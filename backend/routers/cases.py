"""
Cases router.

Provides full CRUD and workflow endpoints for legal cases including
submission, status transitions, agent pipeline orchestration, complaint
approval/revision/denial, and file downloads.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, status

from models.schemas import (
    CaseCreate,
    CaseStatusUpdate,
    DenialRequest,
    RevisionRequest,
)
from utils.supabase_client import get_supabase
from utils.notifications import (
    create_notification,
    notify_attorney_new_submission,
    notify_client_case_denied,
    notify_client_complaint_approved,
)
from utils.email_service import (
    send_case_denied_notification,
    send_case_submitted_notification,
    send_complaint_approved_notification,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Valid agent names (must match the agent_outputs CHECK constraint)
# ---------------------------------------------------------------------------

VALID_AGENTS = {
    "intake_analyst",
    "case_classifier",
    "legal_researcher",
    "damages_analyst",
    "complaint_drafter",
    "qa_reviewer",
}


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Extract and validate the bearer token, returning the caller's profile.

    If the user is authenticated but has no profile row yet, one is
    automatically created. The very first user becomes an attorney;
    subsequent users default to client.
    """
    supabase = get_supabase()

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization[len("Bearer "):]

    try:
        user_response = supabase.auth.get_user(token)
        auth_user = user_response.user
        user_id = auth_user.id
        user_email = getattr(auth_user, "email", None) or ""
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )

    if profile_resp.data:
        return profile_resp.data[0]

    # Profile doesn't exist — auto-create one.
    # First user to sign up gets attorney role; everyone else is a client.
    any_profiles = (
        supabase.table("profiles")
        .select("id")
        .limit(1)
        .execute()
    )
    default_role = "client" if any_profiles.data else "attorney"

    new_profile = {
        "id": str(user_id),
        "role": default_role,
        "full_name": user_email.split("@")[0] if user_email else "User",
        "email": user_email,
    }

    try:
        insert_resp = supabase.table("profiles").insert(new_profile).execute()
        if insert_resp.data:
            return insert_resp.data[0]
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to auto-create profile: {e}")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Profile not found and could not be created.",
    )


def _require_attorney(profile: dict) -> None:
    """Raise 403 if the profile is not an attorney."""
    if profile.get("role") != "attorney":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only attorneys can perform this action.",
        )


# ---------------------------------------------------------------------------
# Helper: fetch a case and optionally verify ownership
# ---------------------------------------------------------------------------


def _fetch_case(case_id: str, *, profile: dict | None = None) -> dict:
    """Fetch a case by ID. If *profile* is provided and the user is a
    client, verify they own the case (raise 403 otherwise)."""
    supabase = get_supabase()
    resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found.",
        )
    case = resp.data[0]
    if profile and profile["role"] == "client" and case["client_id"] != profile["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this case.",
        )
    return case


# ---------------------------------------------------------------------------
# POST /submit -- client submits new case
# ---------------------------------------------------------------------------


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_case(
    body: CaseCreate,
    authorization: str = Header(...),
):
    """Client submits a new case with facts, damages, and defendant IDs."""
    profile = await get_current_user(authorization)
    supabase = get_supabase()

    # Create the case record
    case_payload = {
        "client_id": profile["id"],
        "status": "submitted",
        "case_facts": body.case_facts,
        "damages_description": body.damages_description,
    }

    try:
        case_resp = supabase.table("cases").insert(case_payload).execute()
        if not case_resp.data:
            raise RuntimeError("Case insert returned no data.")
        case = case_resp.data[0]
    except Exception as exc:
        logger.exception("Failed to create case for client %s", profile["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create case: {exc}",
        )

    case_id = case["id"]

    # Link defendants via case_defendants join table
    for def_id in body.defendant_ids:
        try:
            supabase.table("case_defendants").insert(
                {"case_id": case_id, "defendant_id": str(def_id)}
            ).execute()
        except Exception:
            logger.exception(
                "Failed to link defendant %s to case %s", def_id, case_id
            )

    # Notify attorney (in-app)
    notify_attorney_new_submission(
        case_id=case_id,
        client_name=profile.get("full_name", "Client"),
    )

    # Notify attorney (email -- best effort)
    try:
        attorney_resp = (
            supabase.table("profiles")
            .select("email")
            .eq("role", "attorney")
            .limit(1)
            .execute()
        )
        if attorney_resp.data:
            await send_case_submitted_notification(
                attorney_email=attorney_resp.data[0]["email"],
                client_name=profile.get("full_name", "Client"),
            )
    except Exception:
        logger.warning("Could not send case-submitted email notification")

    return case


# ---------------------------------------------------------------------------
# GET / -- list cases
# ---------------------------------------------------------------------------


@router.get("")
async def list_cases(
    authorization: str = Header(...),
    status_filter: Optional[str] = Query(None, alias="status"),
    client_id: Optional[str] = Query(None),
):
    """List cases.  Attorneys see all (with optional filters); clients
    see only their own cases."""
    profile = await get_current_user(authorization)
    supabase = get_supabase()

    query = supabase.table("cases").select("*")

    if profile["role"] == "client":
        query = query.eq("client_id", profile["id"])
    else:
        if client_id:
            query = query.eq("client_id", client_id)

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("created_at", desc=True)
    resp = query.execute()
    cases = resp.data or []

    # Enrich each case with client name and defendant info
    enriched: list[dict] = []
    for case in cases:
        # Extract plaintiff name from case_facts header (for draft cases)
        plaintiff_name = ""
        facts = case.get("case_facts") or ""
        if "=== PLAINTIFF ===" in facts:
            for line in facts.split("\n"):
                if line.strip().startswith("Name:"):
                    plaintiff_name = line.replace("Name:", "").strip()
                    break

        # Client name from profile
        client_resp = (
            supabase.table("profiles")
            .select("id, full_name, email")
            .eq("id", case["client_id"])
            .limit(1)
            .execute()
        )
        client_profile = client_resp.data[0] if client_resp.data else None
        case["client"] = client_profile

        # Use plaintiff name from case_facts if available, otherwise profile name
        case["plaintiff_name"] = (
            plaintiff_name or
            (client_profile.get("full_name") if client_profile else None) or
            "Unknown Client"
        )
        case["client_name"] = case["plaintiff_name"]

        # Defendants
        cd_resp = (
            supabase.table("case_defendants")
            .select("defendant_id")
            .eq("case_id", case["id"])
            .execute()
        )
        defendant_ids = [row["defendant_id"] for row in (cd_resp.data or [])]
        defendants: list[dict] = []
        for did in defendant_ids:
            d_resp = (
                supabase.table("defendants")
                .select("*")
                .eq("id", did)
                .limit(1)
                .execute()
            )
            if d_resp.data:
                defendants.append(d_resp.data[0])
        case["defendants"] = defendants

        enriched.append(case)

    return enriched


# ---------------------------------------------------------------------------
# GET /{case_id} -- full case detail
# ---------------------------------------------------------------------------


@router.get("/{case_id}")
async def get_case_detail(case_id: str, authorization: str = Header(...)):
    """Full case detail including client profile, defendants, documents,
    agent outputs, and the current complaint."""
    profile = await get_current_user(authorization)
    case = _fetch_case(case_id, profile=profile)
    supabase = get_supabase()

    # Client profile
    client_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    client_profile = client_resp.data[0] if client_resp.data else None
    case["client"] = client_profile

    # Extract plaintiff name from case_facts header
    plaintiff_name = ""
    facts = case.get("case_facts") or ""
    if "=== PLAINTIFF ===" in facts:
        for line in facts.split("\n"):
            if line.strip().startswith("Name:"):
                plaintiff_name = line.replace("Name:", "").strip()
                break

    case["plaintiff_name"] = (
        plaintiff_name or
        (client_profile.get("full_name") if client_profile else None) or
        "Unknown Client"
    )
    case["client_name"] = case["plaintiff_name"]

    # Defendants
    cd_resp = (
        supabase.table("case_defendants")
        .select("defendant_id")
        .eq("case_id", case_id)
        .execute()
    )
    defendant_ids = [row["defendant_id"] for row in (cd_resp.data or [])]
    defendants: list[dict] = []
    for did in defendant_ids:
        d_resp = (
            supabase.table("defendants")
            .select("*")
            .eq("id", did)
            .limit(1)
            .execute()
        )
        if d_resp.data:
            defendants.append(d_resp.data[0])
    case["defendants"] = defendants

    # Documents
    doc_resp = (
        supabase.table("case_documents")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    )
    case["documents"] = doc_resp.data or []

    # Agent outputs (attorney only, or if case is approved/filed/closed for client)
    if profile["role"] == "attorney" or case["status"] in (
        "approved",
        "filed",
        "closed",
    ):
        ao_resp = (
            supabase.table("agent_outputs")
            .select("*")
            .eq("case_id", case_id)
            .order("started_at")
            .execute()
        )
        case["agent_outputs"] = ao_resp.data or []
    else:
        case["agent_outputs"] = []

    # Current complaint
    complaint_resp = (
        supabase.table("complaints")
        .select("*")
        .eq("case_id", case_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    case["complaint"] = complaint_resp.data[0] if complaint_resp.data else None

    return case


# ---------------------------------------------------------------------------
# PATCH /{case_id}/status -- attorney updates case status
# ---------------------------------------------------------------------------


@router.patch("/{case_id}/status")
async def update_case_status(
    case_id: str,
    body: CaseStatusUpdate,
    authorization: str = Header(...),
):
    """Attorney manually updates the workflow status of a case."""
    profile = await get_current_user(authorization)
    _require_attorney(profile)
    _fetch_case(case_id)  # ensure case exists

    supabase = get_supabase()
    resp = (
        supabase.table("cases")
        .update({
            "status": body.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", case_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update case status.",
        )

    return resp.data[0]


# ---------------------------------------------------------------------------
# POST /{case_id}/approve-for-processing -- attorney approves pipeline run
# ---------------------------------------------------------------------------


@router.post("/{case_id}/approve-for-processing")
async def approve_for_processing(
    case_id: str,
    authorization: str = Header(...),
):
    """Attorney approves a submitted case for AI agent processing.

    Sets status to ``approved_for_processing`` and launches the agent
    pipeline in a background task.
    """
    import asyncio

    profile = await get_current_user(authorization)
    _require_attorney(profile)
    case = _fetch_case(case_id)

    supabase = get_supabase()

    # Update status
    supabase.table("cases").update({
        "status": "approved_for_processing",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).execute()

    # Launch pipeline as asyncio task
    async def _safe_pipeline(cid: str) -> None:
        try:
            from agents.orchestrator import run_pipeline
            await run_pipeline(cid)
        except Exception as e:
            logger.exception(f"Pipeline crashed for case {cid}: {e}")
            try:
                sb = get_supabase()
                sb.table("cases").update({
                    "status": "error",
                    "revision_notes": f"PIPELINE ERROR: {type(e).__name__}: {e}",
                }).eq("id", cid).execute()
            except Exception:
                pass

    asyncio.create_task(_safe_pipeline(case_id))

    return {
        "message": "Case approved for processing. Agent pipeline started.",
        "case_id": case_id,
        "status": "approved_for_processing",
    }


# ---------------------------------------------------------------------------
# POST /{case_id}/approve-complaint -- attorney approves the complaint
# ---------------------------------------------------------------------------


@router.post("/{case_id}/approve-complaint")
async def approve_complaint(
    case_id: str,
    authorization: str = Header(...),
):
    """Attorney approves the current complaint for a case.

    Sets the complaint's ``approved_by`` / ``approved_at`` fields and
    locks the case status to ``approved``.  Notifies the client.
    """
    profile = await get_current_user(authorization)
    _require_attorney(profile)
    case = _fetch_case(case_id)

    supabase = get_supabase()

    # Find the current complaint
    complaint_resp = (
        supabase.table("complaints")
        .select("*")
        .eq("case_id", case_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    if not complaint_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No current complaint found for this case.",
        )

    complaint = complaint_resp.data[0]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Update complaint
    supabase.table("complaints").update({
        "approved_by": profile["id"],
        "approved_at": now_iso,
    }).eq("id", complaint["id"]).execute()

    # Update case status
    supabase.table("cases").update({
        "status": "approved",
        "updated_at": now_iso,
    }).eq("id", case_id).execute()

    # Generate the approved .docx and upload to Supabase Storage
    docx_url = None
    try:
        from utils.docx_formatter import generate_complaint_docx

        # Get plaintiff + defendant info for the caption
        plaintiff_name = ""
        defendant_names = []
        jury_demand = case.get("jury_demand", True)
        facts = case.get("case_facts", "") or ""
        if "=== PLAINTIFF ===" in facts:
            for line in facts.split("\n"):
                if line.startswith("Name:"):
                    plaintiff_name = line.replace("Name:", "").strip()
                    break

        cd_resp = supabase.table("case_defendants").select("defendant_id").eq("case_id", case_id).execute()
        for row in cd_resp.data or []:
            d = supabase.table("defendants").select("name").eq("id", row["defendant_id"]).limit(1).execute()
            if d.data:
                defendant_names.append(d.data[0]["name"])

        buffer = generate_complaint_docx(
            complaint_text=complaint.get("complaint_text", ""),
            plaintiff_name=plaintiff_name,
            defendant_names=defendant_names,
            jury_demand=jury_demand,
        )

        # Upload to Supabase Storage
        storage_path = f"cases/{case_id}/approved_complaint_v{complaint.get('version', 1)}.docx"
        supabase.storage.from_("documents").upload(
            storage_path,
            buffer.read(),
            {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "upsert": "true"},
        )

        # Save URL to complaints table
        supabase.table("complaints").update({
            "complaint_docx_url": storage_path,
        }).eq("id", complaint["id"]).execute()

        docx_url = storage_path
        logger.info(f"Approved complaint .docx generated and uploaded for case {case_id}")
    except Exception as e:
        logger.exception(f"Failed to generate approved .docx for case {case_id}: {e}")

    # Notify client (in-app)
    notify_client_complaint_approved(
        client_id=case["client_id"],
        case_id=case_id,
    )

    # Notify client (email -- best effort)
    try:
        client_resp = (
            supabase.table("profiles")
            .select("email, full_name")
            .eq("id", case["client_id"])
            .limit(1)
            .execute()
        )
        if client_resp.data:
            client = client_resp.data[0]
            await send_complaint_approved_notification(
                client_email=client["email"],
                client_name=client.get("full_name", "Client"),
            )
    except Exception:
        logger.warning("Could not send complaint-approved email for case %s", case_id)

    return {"message": "Complaint approved.", "case_id": case_id, "status": "approved"}


# ---------------------------------------------------------------------------
# POST /{case_id}/request-revision -- attorney requests revision
# ---------------------------------------------------------------------------


@router.post("/{case_id}/request-revision")
async def request_revision(
    case_id: str,
    body: RevisionRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
):
    """Attorney requests revisions on the complaint.

    Increments ``revision_count`` (max 3), stores the revision notes,
    and reruns the complaint drafter + QA reviewer agents in background.
    """
    profile = await get_current_user(authorization)
    _require_attorney(profile)
    case = _fetch_case(case_id)

    current_count = case.get("revision_count", 0)
    if current_count >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum revisions reached (3). Please approve or deny the case.",
        )

    supabase = get_supabase()
    new_count = current_count + 1

    supabase.table("cases").update({
        "revision_notes": body.notes,
        "revision_count": new_count,
        "status": "revision_requested",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).execute()

    # Background: rerun complaint_drafter with revision notes, then qa_reviewer
    async def _revision_task(cid: str, notes: str) -> None:
        from agents import complaint_drafter, qa_reviewer

        sb = get_supabase()
        try:
            # Gather prior agent outputs needed by the complaint drafter
            outputs: dict[str, dict] = {}
            for agent_name in (
                "intake_analyst",
                "case_classifier",
                "legal_researcher",
                "damages_analyst",
            ):
                ao = (
                    sb.table("agent_outputs")
                    .select("output_data")
                    .eq("case_id", cid)
                    .eq("agent_name", agent_name)
                    .order("completed_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if ao.data and ao.data[0].get("output_data"):
                    outputs[agent_name] = ao.data[0]["output_data"]
                else:
                    outputs[agent_name] = {}

            # Rerun complaint drafter
            draft_result = await complaint_drafter.run(
                cid,
                outputs.get("intake_analyst", {}),
                outputs.get("case_classifier", {}),
                outputs.get("legal_researcher", {}),
                outputs.get("damages_analyst", {}),
                notes,
            )
            complaint_text = draft_result.get("complaint_text", "")

            # Rerun QA reviewer
            await qa_reviewer.run(
                cid,
                complaint_text,
                outputs.get("case_classifier", {}),
            )

            # Update case status back to draft_ready
            sb.table("cases").update({
                "status": "draft_ready",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", cid).execute()

        except Exception:
            logger.exception("Revision task failed for case %s", cid)
            try:
                sb.table("cases").update({
                    "status": "error",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", cid).execute()
            except Exception:
                logger.exception("Could not set error status for case %s", cid)

    background_tasks.add_task(_revision_task, case_id, body.notes)

    return {
        "message": f"Revision {new_count} requested. Agents re-running.",
        "case_id": case_id,
        "revision_count": new_count,
    }


# ---------------------------------------------------------------------------
# POST /{case_id}/deny -- attorney denies the case
# ---------------------------------------------------------------------------


@router.post("/{case_id}/deny")
async def deny_case(
    case_id: str,
    body: DenialRequest,
    authorization: str = Header(...),
):
    """Attorney denies a case, setting status to ``closed`` and recording
    the denial reason.  Notifies the client."""
    profile = await get_current_user(authorization)
    _require_attorney(profile)
    case = _fetch_case(case_id)

    supabase = get_supabase()

    supabase.table("cases").update({
        "status": "closed",
        "denial_reason": body.reason,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", case_id).execute()

    # Notify client (in-app)
    notify_client_case_denied(
        client_id=case["client_id"],
        case_id=case_id,
        reason=body.reason,
    )

    # Notify client (email -- best effort)
    try:
        client_resp = (
            supabase.table("profiles")
            .select("email, full_name")
            .eq("id", case["client_id"])
            .limit(1)
            .execute()
        )
        if client_resp.data:
            client = client_resp.data[0]
            await send_case_denied_notification(
                client_email=client["email"],
                client_name=client.get("full_name", "Client"),
                reason=body.reason,
            )
    except Exception:
        logger.warning("Could not send case-denied email for case %s", case_id)

    return {"message": "Case denied.", "case_id": case_id, "status": "closed"}


# ---------------------------------------------------------------------------
# GET /{case_id}/download/complaint -- get complaint DOCX URL
# ---------------------------------------------------------------------------


@router.get("/{case_id}/download/complaint")
async def download_complaint(case_id: str, authorization: str = Header(...)):
    """Return the complaint DOCX download URL from Supabase Storage."""
    profile = await get_current_user(authorization)
    case = _fetch_case(case_id, profile=profile)

    supabase = get_supabase()

    complaint_resp = (
        supabase.table("complaints")
        .select("complaint_docx_url")
        .eq("case_id", case_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    if not complaint_resp.data or not complaint_resp.data[0].get("complaint_docx_url"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint DOCX not available for this case.",
        )

    url = complaint_resp.data[0]["complaint_docx_url"]

    # If the URL is a storage path (not a full URL), generate a signed URL
    if not url.startswith("http"):
        try:
            signed = supabase.storage.from_("documents").create_signed_url(
                url, 3600  # 1 hour
            )
            url = signed.get("signedURL", signed.get("signedUrl", url))
        except Exception:
            logger.warning("Could not generate signed URL for %s", url)

    return {"url": url}


# ---------------------------------------------------------------------------
# GET /{case_id}/download/memo -- get strategy memo DOCX URL
# ---------------------------------------------------------------------------


@router.get("/{case_id}/download/memo")
async def download_memo(case_id: str, authorization: str = Header(...)):
    """Return the strategy memo DOCX download URL from Supabase Storage."""
    profile = await get_current_user(authorization)
    case = _fetch_case(case_id, profile=profile)

    supabase = get_supabase()

    complaint_resp = (
        supabase.table("complaints")
        .select("strategy_memo_url")
        .eq("case_id", case_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    if not complaint_resp.data or not complaint_resp.data[0].get("strategy_memo_url"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Strategy memo not available for this case.",
        )

    url = complaint_resp.data[0]["strategy_memo_url"]

    if not url.startswith("http"):
        try:
            signed = supabase.storage.from_("documents").create_signed_url(
                url, 3600
            )
            url = signed.get("signedURL", signed.get("signedUrl", url))
        except Exception:
            logger.warning("Could not generate signed URL for %s", url)

    return {"url": url}


# ---------------------------------------------------------------------------
# GET /{case_id}/pipeline-status -- agent pipeline progress
# ---------------------------------------------------------------------------


@router.get("/{case_id}/pipeline-status")
async def pipeline_status(case_id: str, authorization: str = Header(...)):
    """Return the status of all agents for this case from agent_outputs."""
    profile = await get_current_user(authorization)
    _fetch_case(case_id, profile=profile)

    supabase = get_supabase()

    resp = (
        supabase.table("agent_outputs")
        .select("agent_name, status, started_at, completed_at, error_message")
        .eq("case_id", case_id)
        .order("started_at")
        .execute()
    )

    return resp.data or []


# ---------------------------------------------------------------------------
# POST /{case_id}/rerun-agent/{agent_name} -- rerun a specific agent
# ---------------------------------------------------------------------------


@router.post("/{case_id}/rerun-agent/{agent_name}")
async def rerun_agent(
    case_id: str,
    agent_name: str,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
):
    """Attorney reruns a specific agent for the given case."""
    profile = await get_current_user(authorization)
    _require_attorney(profile)
    _fetch_case(case_id)

    if agent_name not in VALID_AGENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid agent name '{agent_name}'. Must be one of: {sorted(VALID_AGENTS)}",
        )

    async def _rerun_task(cid: str, aname: str) -> None:
        """Background task to rerun a single agent."""
        from agents import (
            intake_analyst,
            case_classifier,
            legal_researcher,
            damages_analyst,
            complaint_drafter,
            qa_reviewer,
        )

        sb = get_supabase()

        agent_map = {
            "intake_analyst": intake_analyst,
            "case_classifier": case_classifier,
            "legal_researcher": legal_researcher,
            "damages_analyst": damages_analyst,
            "complaint_drafter": complaint_drafter,
            "qa_reviewer": qa_reviewer,
        }

        try:
            # Gather prior agent outputs for context
            def _get_output(name: str) -> dict:
                ao = (
                    sb.table("agent_outputs")
                    .select("output_data")
                    .eq("case_id", cid)
                    .eq("agent_name", name)
                    .order("completed_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if ao.data and ao.data[0].get("output_data"):
                    return ao.data[0]["output_data"]
                return {}

            case_resp = (
                sb.table("cases")
                .select("*")
                .eq("id", cid)
                .limit(1)
                .execute()
            )
            case_data = case_resp.data[0] if case_resp.data else {}

            if aname == "intake_analyst":
                await intake_analyst.run(cid, case_data)
            elif aname == "case_classifier":
                fact_sheet = _get_output("intake_analyst")
                await case_classifier.run(cid, fact_sheet)
            elif aname == "legal_researcher":
                classification = _get_output("case_classifier")
                await legal_researcher.run(cid, classification)
            elif aname == "damages_analyst":
                fact_sheet = _get_output("intake_analyst")
                classification = _get_output("case_classifier")
                await damages_analyst.run(cid, fact_sheet, classification)
            elif aname == "complaint_drafter":
                fact_sheet = _get_output("intake_analyst")
                classification = _get_output("case_classifier")
                research = _get_output("legal_researcher")
                damages = _get_output("damages_analyst")
                revision_notes = case_data.get("revision_notes")
                await complaint_drafter.run(
                    cid, fact_sheet, classification, research, damages, revision_notes
                )
            elif aname == "qa_reviewer":
                classification = _get_output("case_classifier")
                # Get latest complaint text
                complaint_resp = (
                    sb.table("complaints")
                    .select("complaint_text")
                    .eq("case_id", cid)
                    .eq("is_current", True)
                    .limit(1)
                    .execute()
                )
                complaint_text = ""
                if complaint_resp.data:
                    complaint_text = complaint_resp.data[0].get("complaint_text", "")
                await qa_reviewer.run(cid, complaint_text, classification)

            logger.info("Agent '%s' rerun completed for case %s", aname, cid)
        except Exception:
            logger.exception("Rerun of agent '%s' failed for case %s", aname, cid)

    background_tasks.add_task(_rerun_task, case_id, agent_name)

    return {
        "message": f"Agent '{agent_name}' rerun started.",
        "case_id": case_id,
        "agent_name": agent_name,
    }
