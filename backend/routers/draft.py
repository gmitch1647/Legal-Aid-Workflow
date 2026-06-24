"""
Draft router.

Attorney-initiated complaint drafting flow. Uses the existing agent
pipeline but bypasses the client portal intake — attorneys fill in a
form directly and trigger the 7-agent pipeline against arbitrary
plaintiff information.

Endpoints
---------
POST   /draft/start              — kick off a new draft session
GET    /draft/{session_id}/status — pipeline status for polling
GET    /draft/{session_id}/result — final complaint text + docx URLs
POST   /draft/{session_id}/save   — attach draft to an existing case
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth helper (delegates to shared profile auto-create logic)
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") != "attorney":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only attorneys can use the drafting tool.",
        )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class DefendantPayload(BaseModel):
    name: str
    entity_type: Optional[str] = None
    principal_address: Optional[str] = None
    ga_registered_agent: Optional[str] = None
    defendant_id: Optional[str] = None  # set if chosen from known defendants


class DraftStartPayload(BaseModel):
    plaintiff_name: str
    plaintiff_county: str
    defendants: list[DefendantPayload]
    court: Optional[str] = None
    statutes: Optional[str] = None
    case_facts: str
    damages_description: str
    jury_demand: bool = True
    georgia_claims: str = "include"  # include | federal_only | agent_decides
    document_urls: list[str] = []
    mode: str = "fast"  # "fast" (2-call, ~15s) or "thorough" (7-agent, ~90s)
    document_type: str = "complaint"  # complaint | motion | discovery | demand_letter
    client_id: Optional[str] = None  # Link draft to a client profile
    attorney_id: Optional[str] = None  # Attorney for signature block
    assigned_staff_id: Optional[str] = None  # Staff attorney assigned to this case


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_case_facts(payload: DraftStartPayload) -> str:
    """Build an enriched case_facts string that includes plaintiff info,
    defendant info, court/statute preferences, and damages."""
    parts = [
        "=== PLAINTIFF ===",
        f"Name: {payload.plaintiff_name}",
        f"County of Residence: {payload.plaintiff_county}, Georgia",
        "",
        "=== DEFENDANTS ===",
    ]
    for i, d in enumerate(payload.defendants):
        if d.name.strip():
            parts.append(f"Defendant {i+1}: {d.name}")
            if d.entity_type:
                parts.append(f"  Entity Type: {d.entity_type}")
            if d.principal_address:
                parts.append(f"  Address: {d.principal_address}")
            if d.ga_registered_agent:
                parts.append(f"  GA Registered Agent: {d.ga_registered_agent}")
    parts.extend([
        "",
        "=== ATTORNEY PREFERENCES ===",
        f"Preferred Court: {payload.court or 'Agent to recommend'}",
        f"Statutes Requested: {payload.statutes or 'Agent to classify from facts'}",
        f"Jury Demand: {'Yes' if payload.jury_demand else 'No'}",
        f"Georgia State Claims: {payload.georgia_claims}",
        "",
        "=== CASE FACTS ===",
        payload.case_facts,
        "",
        "=== DAMAGES DESCRIBED ===",
        payload.damages_description,
    ])

    # Add attorney info if provided
    if payload.attorney_id:
        try:
            supabase = get_supabase()
            atty_resp = supabase.table("attorneys").select("*").eq("id", payload.attorney_id).limit(1).execute()
            if atty_resp.data:
                a = atty_resp.data[0]
                parts.extend([
                    "",
                    "=== ATTORNEY FOR SIGNATURE BLOCK ===",
                    f"Name: {a.get('full_name', '')}",
                    f"Bar Number: {a.get('bar_number', '')}",
                    f"Firm: {a.get('firm_name', '')}",
                    f"Address: {a.get('address', '')}",
                    f"Phone: {a.get('phone', '')}",
                    f"Email: {a.get('email', '')}",
                    "USE THIS INFORMATION IN THE SIGNATURE BLOCK. Do NOT use placeholders.",
                ])
        except Exception:
            pass

    return "\n".join(parts)


def _resolve_defendant_id(supabase, defendant: DefendantPayload) -> Optional[str]:
    """Given a defendant payload from the form, return a Supabase
    defendant_id — either an existing one (if defendant_id was supplied
    or if a matching row exists) or a newly-created custom row."""
    if defendant.defendant_id:
        return defendant.defendant_id

    # Try to match by name (case-insensitive)
    try:
        match = (
            supabase.table("defendants")
            .select("id")
            .ilike("name", defendant.name.strip())
            .limit(1)
            .execute()
        )
        if match.data:
            return match.data[0]["id"]
    except Exception as e:
        logger.warning(f"Defendant lookup failed: {e}")

    # Insert a custom defendant
    try:
        insert = (
            supabase.table("defendants")
            .insert(
                {
                    "name": defendant.name.strip(),
                    "principal_address": defendant.principal_address or "",
                    "ga_registered_agent": defendant.ga_registered_agent or "",
                    "entity_type": defendant.entity_type or "Furnisher",
                    "is_custom": True,
                }
            )
            .execute()
        )
        if insert.data:
            return insert.data[0]["id"]
    except Exception as e:
        logger.error(f"Failed to create custom defendant: {e}")

    return None


# ---------------------------------------------------------------------------
# POST /start — kick off a draft session
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# GET /list — list all draft sessions for the attorney
# ---------------------------------------------------------------------------


@router.get("/list")
async def list_drafts(authorization: str = Header(default=None)):
    """Return all draft sessions (cases), newest first.

    Returns a list with session_id, plaintiff name (parsed from case_facts),
    status, latest version, and created_at for each draft.
    """
    supabase = get_supabase()

    try:
        # Fetch all cases (drafts + real cases)
        cases_resp = (
            supabase.table("cases")
            .select("id, status, case_facts, created_at, updated_at, client_id")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        cases = cases_resp.data or []

        # Enrich each case with defendant names and the latest complaint version
        results = []
        for c in cases:
            # Extract plaintiff name from case_facts header
            plaintiff_name = "Untitled Draft"
            facts = c.get("case_facts", "") or ""
            if "=== PLAINTIFF ===" in facts:
                for line in facts.split("\n"):
                    if line.startswith("Name:"):
                        plaintiff_name = line.replace("Name:", "").strip() or plaintiff_name
                        break

            # Get defendants
            defendants = []
            try:
                cd = (
                    supabase.table("case_defendants")
                    .select("defendant_id")
                    .eq("case_id", c["id"])
                    .execute()
                )
                for row in cd.data or []:
                    d = (
                        supabase.table("defendants")
                        .select("name")
                        .eq("id", row["defendant_id"])
                        .limit(1)
                        .execute()
                    )
                    if d.data:
                        defendants.append(d.data[0]["name"])
            except Exception:
                pass

            # Get current complaint version
            version = None
            try:
                comp = (
                    supabase.table("complaints")
                    .select("version")
                    .eq("case_id", c["id"])
                    .eq("is_current", True)
                    .limit(1)
                    .execute()
                )
                if comp.data:
                    version = comp.data[0].get("version")
            except Exception:
                pass

            results.append({
                "session_id": c["id"],
                "plaintiff_name": plaintiff_name,
                "defendants": defendants,
                "status": c.get("status"),
                "version": version,
                "created_at": c.get("created_at"),
                "updated_at": c.get("updated_at"),
            })

        return results
    except Exception as e:
        logger.exception("Failed to list drafts")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start", status_code=status.HTTP_202_ACCEPTED)
async def start_draft(
    payload: DraftStartPayload,
    authorization: str = Header(...),
):
    """Create a draft case record and launch the agent pipeline."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Auto-create client profile if no client_id provided
    client_id = payload.client_id
    if not client_id and payload.plaintiff_name:
        try:
            # Check if client already exists by name
            existing = supabase.table("profiles").select("id").eq("full_name", payload.plaintiff_name).eq("role", "client").limit(1).execute()
            if existing.data:
                client_id = existing.data[0]["id"]
            else:
                # Create new client profile
                from routers.auth import _generate_temp_password
                import secrets
                temp_email = f"client-{secrets.token_hex(4)}@legalflow.local"

                try:
                    # Try creating via Supabase auth
                    auth_resp = supabase.auth.admin.create_user({
                        "email": temp_email,
                        "password": _generate_temp_password(),
                        "email_confirm": True,
                    })
                    new_user_id = auth_resp.user.id if auth_resp.user else None

                    if new_user_id:
                        supabase.table("profiles").insert({
                            "id": str(new_user_id),
                            "full_name": payload.plaintiff_name,
                            "county": payload.plaintiff_county,
                            "state": "Georgia",
                            "role": "client",
                            "email": temp_email,
                        }).execute()
                        client_id = str(new_user_id)
                        logger.info(f"Auto-created client profile for {payload.plaintiff_name}: {client_id}")
                except Exception as e:
                    logger.warning(f"Could not auto-create client: {e}")
        except Exception as e:
            logger.warning(f"Client lookup failed: {e}")

    # Assign staff attorney to the client if provided
    if payload.assigned_staff_id and client_id:
        try:
            supabase.table("profiles").update(
                {"assigned_attorney_id": payload.assigned_staff_id}
            ).eq("id", client_id).execute()
            logger.info(f"Assigned staff attorney {payload.assigned_staff_id} to client {client_id}")
        except Exception as e:
            logger.warning(f"Could not assign staff attorney: {e}")

    # Create a case row linked to the client.
    case_facts = _format_case_facts(payload)

    now = datetime.now(timezone.utc).isoformat()
    case_insert = (
        supabase.table("cases")
        .insert(
            {
                "client_id": client_id or profile["id"],
                "status": "approved_for_processing",
                "court": payload.court or "",
                "jury_demand": payload.jury_demand,
                "case_facts": case_facts,
                "damages_description": payload.damages_description,
                "created_at": now,
                "updated_at": now,
            }
        )
        .execute()
    )
    if not case_insert.data:
        raise HTTPException(status_code=500, detail="Could not create draft session.")
    case_id = case_insert.data[0]["id"]

    # Link defendants (resolve or create them as needed)
    for defendant in payload.defendants:
        if not defendant.name.strip():
            continue
        def_id = _resolve_defendant_id(supabase, defendant)
        if def_id:
            try:
                supabase.table("case_defendants").insert(
                    {"case_id": case_id, "defendant_id": def_id}
                ).execute()
            except Exception as e:
                logger.warning(f"Could not link defendant {def_id} to case {case_id}: {e}")

    # Attach uploaded document URLs as case_documents rows
    for doc_url in payload.document_urls:
        try:
            supabase.table("case_documents").insert(
                {
                    "case_id": case_id,
                    "file_name": doc_url.split("/")[-1],
                    "file_type": doc_url.split(".")[-1] if "." in doc_url else "bin",
                    "storage_path": doc_url,
                    "document_category": "other",
                    "uploaded_by": profile["id"],
                }
            ).execute()
        except Exception as e:
            logger.warning(f"Could not attach document {doc_url}: {e}")

    # Launch the pipeline as an asyncio background task.
    async def _safe_pipeline(cid: str, mode: str, facts: str, dmg: str, doc_type: str) -> None:
        try:
            if mode == "fast":
                logger.info(f"Fast draft starting for case {cid} (type={doc_type})")
                from agents.fast_drafter import run_fast_draft
                await run_fast_draft(cid, facts, dmg, document_type=doc_type)
                logger.info(f"Fast draft finished for case {cid}")
            else:
                logger.info(f"Thorough pipeline starting for case {cid}")
                from agents.orchestrator import run_pipeline
                await run_pipeline(cid)
                logger.info(f"Thorough pipeline finished for case {cid}")
        except Exception as e:
            logger.exception(f"Pipeline CRASHED for case {cid}: {e}")
            try:
                sb = get_supabase()
                sb.table("cases").update({
                    "status": "error",
                    "revision_notes": f"PIPELINE ERROR: {type(e).__name__}: {e}",
                }).eq("id", cid).execute()
            except Exception:
                pass

    asyncio.create_task(_safe_pipeline(case_id, payload.mode, case_facts, payload.damages_description, payload.document_type))

    logger.info(f"Draft session started for case {case_id} by {profile.get('email')}")

    return {
        "session_id": case_id,
        "status": "started",
        "message": "Agent pipeline kicked off. Poll /draft/{id}/status for updates.",
    }


# ---------------------------------------------------------------------------
# POST /upload — upload a single document for a draft
# ---------------------------------------------------------------------------


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_draft_document(
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    """Upload one file to Supabase Storage and return its storage path.

    The caller (the DraftComplaint page) uploads files one by one and
    collects the returned storage paths to include in the final /start
    payload as ``document_urls``.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Read the file bytes
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    # Build a unique storage path under drafts/
    session_folder = str(uuid.uuid4())
    safe_name = file.filename.replace(" ", "_")
    storage_path = f"drafts/{session_folder}/{safe_name}"

    try:
        supabase.storage.from_("documents").upload(
            storage_path,
            content,
            {"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    return {
        "storage_path": storage_path,
        "file_name": file.filename,
        "size": len(content),
    }


# ---------------------------------------------------------------------------
# GET /{session_id}/status — pipeline progress for polling
# ---------------------------------------------------------------------------


AGENT_DISPLAY = {
    "intake_analyst": ("Intake Analyst", "Reading documents and extracting facts"),
    "case_classifier": ("Case Classifier", "Identifying violations and statutes"),
    "legal_researcher": ("Legal Researcher", "Pulling statutory language and counts"),
    "damages_analyst": ("Damages Analyst", "Calculating damages and pleading language"),
    "complaint_drafter": ("Complaint Drafter", "Writing the full complaint"),
    "qa_reviewer": ("QA Reviewer", "Checking all counts and citations"),
}

AGENT_ORDER = [
    "intake_analyst",
    "case_classifier",
    "legal_researcher",
    "damages_analyst",
    "complaint_drafter",
    "qa_reviewer",
]


@router.get("/{session_id}/status")
async def draft_status(session_id: str, authorization: str = Header(...)):
    """Return the pipeline status for a draft session."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Fetch case row to get overall status
    case_resp = (
        supabase.table("cases").select("*").eq("id", session_id).limit(1).execute()
    )
    if not case_resp.data:
        raise HTTPException(status_code=404, detail="Draft session not found.")
    case = case_resp.data[0]

    # Fetch agent_outputs for this case
    outputs_resp = (
        supabase.table("agent_outputs")
        .select("*")
        .eq("case_id", session_id)
        .execute()
    )
    outputs_by_name: dict[str, dict] = {
        row["agent_name"]: row for row in (outputs_resp.data or [])
    }

    # Build the structured agents list in pipeline order
    agents_payload = []
    complete_count = 0
    for name in AGENT_ORDER:
        display_name, description = AGENT_DISPLAY[name]
        row = outputs_by_name.get(name, {})
        status_value = row.get("status", "pending")
        if status_value == "complete":
            complete_count += 1

        elapsed = None
        started = row.get("started_at")
        completed = row.get("completed_at")
        if started and completed:
            try:
                t_start = datetime.fromisoformat(started.replace("Z", "+00:00"))
                t_end = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                elapsed = round((t_end - t_start).total_seconds(), 1)
            except Exception:
                pass

        # Build log messages from output_data if present
        log_messages = []
        output_data = row.get("output_data") or {}
        if isinstance(output_data, dict):
            if "summary" in output_data:
                log_messages.append(str(output_data["summary"])[:200])
            else:
                # Add a generic one-liner
                keys = list(output_data.keys())[:3]
                if keys:
                    log_messages.append(f"Produced: {', '.join(keys)}")
        if row.get("error_message"):
            log_messages.append(f"Error: {row['error_message']}")

        agents_payload.append(
            {
                "name": name,
                "display_name": display_name,
                "description": description,
                "status": status_value,
                "started_at": started,
                "completed_at": completed,
                "elapsed_seconds": elapsed,
                "log_messages": log_messages,
                "error_message": row.get("error_message"),
            }
        )

    # Overall status mapping
    case_status = case.get("status", "")
    if case_status in ("draft_ready", "attorney_review", "approved", "filed"):
        overall = "complete"
    elif case_status in ("error",):
        overall = "error"
    elif case_status in ("agents_processing", "approved_for_processing"):
        overall = "running"
    else:
        overall = "pending"

    # If status is still approved_for_processing after 15 seconds,
    # something probably went wrong before the orchestrator could start
    if case_status == "approved_for_processing" and complete_count == 0:
        created = case.get("created_at", "")
        if created:
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - created_dt).total_seconds()
                if age > 15:
                    overall = "error"
            except Exception:
                pass

    progress_percent = int((complete_count / len(AGENT_ORDER)) * 100)
    if overall == "complete":
        progress_percent = 100

    # Surface any pipeline error stored in the case record
    pipeline_error = None
    revision_notes = case.get("revision_notes") or ""
    if revision_notes.startswith("PIPELINE ERROR:"):
        pipeline_error = revision_notes.replace("PIPELINE ERROR: ", "")

    return {
        "session_id": session_id,
        "overall_status": overall,
        "progress_percent": progress_percent,
        "case_status": case_status,
        "agents": agents_payload,
        "pipeline_error": pipeline_error,
    }


# ---------------------------------------------------------------------------
# GET /{session_id}/result — final complaint + download URLs
# ---------------------------------------------------------------------------


@router.get("/{session_id}/result")
async def draft_result(session_id: str, authorization: str = Header(...)):
    """Return the completed complaint text and document URLs."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Fetch the current complaint row
    complaint_resp = (
        supabase.table("complaints")
        .select("*")
        .eq("case_id", session_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )

    if not complaint_resp.data:
        # Check if case exists but has no document yet
        case_resp = supabase.table("cases").select("status, case_facts").eq("id", session_id).limit(1).execute()
        if case_resp.data:
            case = case_resp.data[0]
            if case.get("status") == "agents_processing":
                return {
                    "complaint_text": "",
                    "version": 0,
                    "status": "processing",
                    "message": "Draft is still being generated. Please wait.",
                }
            # Return empty result so the UI can show the chat assistant
            return {
                "complaint_text": "",
                "version": 0,
                "status": case.get("status", "unknown"),
                "message": "No document generated yet. Use the chat assistant to draft one.",
            }
        raise HTTPException(
            status_code=404,
            detail="Draft session not found.",
        )

    complaint = complaint_resp.data[0]

    # Pull summary info from agent outputs
    summary: dict = {
        "statutes_identified": [],
        "defendants": [],
        "counts": [],
        "damages_potential": "",
    }

    try:
        outputs = (
            supabase.table("agent_outputs")
            .select("agent_name, output_data")
            .eq("case_id", session_id)
            .eq("status", "complete")
            .execute()
        )
        for row in outputs.data or []:
            data = row.get("output_data") or {}
            if not isinstance(data, dict):
                continue
            if row["agent_name"] == "case_classifier":
                summary["statutes_identified"] = data.get("statutes", []) or data.get(
                    "violations", []
                )
            elif row["agent_name"] == "legal_researcher":
                summary["counts"] = data.get("counts", []) or data.get(
                    "count_structure", []
                )
            elif row["agent_name"] == "damages_analyst":
                summary["damages_potential"] = data.get("total_damages", "") or data.get(
                    "summary", ""
                )

        # Defendants
        cd_resp = (
            supabase.table("case_defendants")
            .select("defendant_id")
            .eq("case_id", session_id)
            .execute()
        )
        for row in cd_resp.data or []:
            d_resp = (
                supabase.table("defendants")
                .select("name")
                .eq("id", row["defendant_id"])
                .limit(1)
                .execute()
            )
            if d_resp.data:
                summary["defendants"].append(d_resp.data[0]["name"])
    except Exception as e:
        logger.warning(f"Could not build draft summary: {e}")

    # Sign URLs for download
    def _sign_url(path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        try:
            # Use signed URL (valid for 1 hour) so the frontend can trigger download
            res = supabase.storage.from_("documents").create_signed_url(path, 3600)
            return res.get("signedURL") or res.get("signed_url") or res.get("signedUrl")
        except Exception as e:
            logger.warning(f"Could not sign url for {path}: {e}")
            return None

    return {
        "session_id": session_id,
        "complaint_text": complaint.get("complaint_text", ""),
        "complaint_docx_url": _sign_url(complaint.get("complaint_docx_url")),
        "strategy_memo_url": _sign_url(complaint.get("strategy_memo_url")),
        "version": complaint.get("version", 1),
        "case_summary": summary,
    }


# ---------------------------------------------------------------------------
# POST /{session_id}/save — attach draft to a client case
# ---------------------------------------------------------------------------


class SaveDraftPayload(BaseModel):
    client_id: Optional[str] = None
    new_case_notes: Optional[str] = None


@router.post("/{session_id}/save")
async def save_draft_to_case(
    session_id: str,
    payload: SaveDraftPayload,
    authorization: str = Header(...),
):
    """Assign the draft case to a real client (moves it into the
    regular case pipeline under that client). If no client_id is
    provided, the draft stays under the attorney as-is."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    update_fields: dict = {
        "status": "attorney_review",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.client_id:
        update_fields["client_id"] = payload.client_id

    supabase.table("cases").update(update_fields).eq("id", session_id).execute()

    return {"session_id": session_id, "saved": True}


# ---------------------------------------------------------------------------
# GET /{session_id}/download — generate and download a formatted .docx
# ---------------------------------------------------------------------------


@router.get("/{session_id}/download")
async def download_complaint_docx(
    session_id: str,
    authorization: str = Header(default=None),
):
    """Generate a court-ready Word document from the current complaint text."""
    import io
    from fastapi.responses import StreamingResponse

    supabase = get_supabase()

    # Fetch current complaint text
    complaint_resp = (
        supabase.table("complaints")
        .select("complaint_text, version")
        .eq("case_id", session_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    if not complaint_resp.data:
        raise HTTPException(status_code=404, detail="No complaint found for this session.")

    complaint_text = complaint_resp.data[0].get("complaint_text", "")
    version = complaint_resp.data[0].get("version", 1)

    if not complaint_text.strip():
        raise HTTPException(status_code=400, detail="Complaint text is empty.")

    # Get plaintiff and defendant info from the case
    plaintiff_name = ""
    defendant_names = []
    jury_demand = True

    try:
        case_resp = supabase.table("cases").select("case_facts, jury_demand").eq("id", session_id).limit(1).execute()
        if case_resp.data:
            case = case_resp.data[0]
            jury_demand = case.get("jury_demand", True)
            facts = case.get("case_facts", "") or ""
            if "=== PLAINTIFF ===" in facts:
                for line in facts.split("\n"):
                    if line.startswith("Name:"):
                        plaintiff_name = line.replace("Name:", "").strip()
                        break

        cd_resp = supabase.table("case_defendants").select("defendant_id").eq("case_id", session_id).execute()
        for row in cd_resp.data or []:
            d = supabase.table("defendants").select("name").eq("id", row["defendant_id"]).limit(1).execute()
            if d.data:
                defendant_names.append(d.data[0]["name"])
    except Exception as e:
        logger.warning(f"Could not fetch case info for docx: {e}")

    try:
        from utils.docx_formatter import generate_complaint_docx
        buffer = generate_complaint_docx(
            complaint_text=complaint_text,
            plaintiff_name=plaintiff_name,
            defendant_names=defendant_names,
            jury_demand=jury_demand,
        )
        filename = f"complaint_v{version}.docx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.exception(f"Failed to generate DOCX for session {session_id}")
        raise HTTPException(status_code=500, detail=f"Document generation failed: {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# POST /reindex — rebuild the reference_chunks table from backend/reference_cases/
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# POST /{session_id}/chat — streaming conversational assistant for drafts
# ---------------------------------------------------------------------------


@router.post("/{session_id}/chat-stream")
async def draft_chat_stream(
    session_id: str,
    request: Request,
    authorization: str = Header(default=None),
):
    """Full conversational assistant for any document type — streams responses.
    Can revise complaints/discovery/motions, answer questions, discuss case law, or give opinions.
    If it revises, the response starts with REVISED DOCUMENT: or REVISED COMPLAINT: prefix."""
    from fastapi.responses import StreamingResponse
    import anthropic

    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    message = body.get("message", "")
    complaint_text = body.get("complaint_text", "")
    attachment_paths = body.get("attachment_paths", [])
    chat_history = body.get("history", [])

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Load revision history from DB for continuity
    case_resp = (
        supabase.table("cases")
        .select("revision_history, case_facts, status")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    db_history = []
    case_facts = ""
    if case_resp.data:
        db_history = case_resp.data[0].get("revision_history") or []
        case_facts = case_resp.data[0].get("case_facts") or ""

    # Get RAG context
    reference_context = ""
    try:
        from utils.rag_retrieval import retrieve_relevant_chunks, format_retrieved_context
        from utils.embeddings import is_configured
        if is_configured():
            chunks = retrieve_relevant_chunks(message[:500], top_k=4, document_type="complaint")
            if chunks:
                reference_context = format_retrieved_context(chunks)
    except Exception:
        pass

    # Get case law context
    case_law_context = ""
    try:
        from utils.embeddings import embed_text, is_configured as _emb_check
        if _emb_check():
            query_emb = embed_text(message[:500])
            cl_resp = supabase.rpc("match_case_law_chunks", {
                "query_embedding": query_emb,
                "match_threshold": 0.6,
                "match_count": 3,
            }).execute()
            if cl_resp.data:
                parts = []
                for chunk in cl_resp.data:
                    ci = supabase.table("case_law").select("case_name, citation, court, year").eq("id", chunk["case_law_id"]).limit(1).execute()
                    info = ci.data[0] if ci.data else {}
                    parts.append(f"[{info.get('case_name', '')}] ({info.get('citation', '')}, {info.get('court', '')} {info.get('year', '')})\n{chunk['content'][:1200]}")
                case_law_context = "\n\n".join(parts)
    except Exception:
        pass

    # Attorney memory
    memory_context = ""
    try:
        from utils.memory import get_full_memory_context
        memory_context = get_full_memory_context(session_id, profile.get("id"))
    except Exception:
        pass

    # Read attachments
    attachment_text = ""
    if attachment_paths:
        try:
            from utils.document_reader import read_document
            for path in attachment_paths[:3]:
                try:
                    file_type = path.split(".")[-1].lower() if "." in path else "bin"
                    text = read_document(path, file_type)
                    if text:
                        attachment_text += f"\n=== ATTACHMENT: {path.split('/')[-1]} ===\n{text[:6000]}\n"
                except Exception:
                    pass
        except Exception:
            pass

    # Determine document type from the case record
    doc_type = "document"
    try:
        dt_resp = supabase.table("cases").select("case_facts").eq("id", session_id).limit(1).execute()
        if dt_resp.data:
            facts = dt_resp.data[0].get("case_facts", "")
            if "MOTION TYPE:" in facts:
                doc_type = "motion"
            elif "DISCOVERY TYPE:" in facts:
                doc_type = "discovery"
            elif "DISPUTE TYPE:" in facts:
                doc_type = "dispute letter"
            elif "demand" in facts.lower()[:200]:
                doc_type = "demand letter"
            else:
                doc_type = "complaint"
    except Exception:
        pass

    system_prompt = f"""You are a senior legal assistant for a consumer protection attorney in the Northern District of Georgia. The current date is {datetime.now(timezone.utc).strftime('%B %d, %Y')}.

CRITICAL BEHAVIOR RULES:
- When asked to DRAFT or REVISE: produce the document IMMEDIATELY. No preamble, no analysis, no "shall I proceed?". Just produce the document.
- When the attorney gives you information (names, addresses, dates), USE IT immediately — update the complaint and show the result. Do NOT ask for information the attorney already provided.
- When asked a QUESTION: answer in 2-3 sentences max. No lengthy analysis.
- NEVER use markdown formatting (no ##, no **, no ---, no bullet lists with headers). Output plain text only.
- NEVER refuse to draft because of missing details. Use what you have. Use "[TO BE CONFIRMED]" for truly missing info like registered agents.
- NEVER ask the attorney to "type out" or "transcribe" something they already uploaded or described.
- If the attorney says "the info is in the messages/screenshots" — work with what they've told you, don't demand transcripts.
- Be smart, fast, and direct. Act like a senior attorney.

The attorney is currently working on a {doc_type.upper()}. You are an expert at ALL legal document types.

You serve TWO roles in this conversation:
1. LEGAL ADVISOR — Answer ANY question about law, strategy, formatting, procedure, discovery practice, or case analysis. You are all-knowing in consumer protection law.
2. DOCUMENT REVISER — When asked to change/add/remove content from the current {doc_type}

WHEN ANSWERING QUESTIONS OR GIVING OPINIONS:
- Be direct, specific, and authoritative
- Cite relevant statutes, case law, and rules of procedure
- Give honest assessments of strengths and weaknesses
- Reference the current document and case facts when relevant
- Share strategic insights — you are a litigation expert
- If asked about discovery formatting, rules, or practice — answer fully
- NEVER say you can only handle one document type — you handle ALL types

WHEN REVISING THE DOCUMENT:
You have TWO options for returning revisions. Choose based on scope:

OPTION A — SMALL CHANGES (changing a few paragraphs, fixing language, adding a sentence):
Start with "CHANGES:" then describe what you changed in 1-3 bullet points. Do NOT reproduce the full document. The original stays intact; the attorney will apply your suggestions manually or ask you for the specific replacement text.

Example:
CHANGES:
- Paragraph 12: Changed "Defendant" to "Defendant Equifax Information Services LLC"
- Count III header: Added "(Equifax Information Services LLC and Trans Union LLC)"
- Added new paragraph 45 after damages section: [full text of new paragraph]

OPTION B — MAJOR REWRITE (restructuring counts, adding entire new sections, rewriting large portions):
Start with a brief "CHANGES MADE:" summary (3-5 bullet points listing EXACTLY what you changed and WHERE — paragraph numbers, section names, count numbers) THEN on a new line write "REVISED DOCUMENT:" followed by the complete document. Every paragraph present. Nothing abbreviated.

Example for Option B:
CHANGES MADE:
- Added Count VI (§1681i(a)(5)(B) reinsertion) after Count V, paragraphs 72-78
- Rewrote willfulness section paragraphs 35-38 to add Safeco analysis
- Changed "Defendant" to "Defendant Equifax Information Services LLC" throughout
- Added paragraph 22 describing the January 25 reinsertion timeline

REVISED DOCUMENT:
IN THE UNITED STATES DISTRICT COURT...

ALWAYS tell the attorney exactly what you changed — paragraph numbers, section names, and what the change was. Never make changes without reporting them.

DEFAULT TO OPTION A unless the attorney explicitly asks for a full rewrite or the changes affect the majority of the document. Option A is faster and avoids fragmentation.

MANDATORY FOR BOTH OPTIONS: After ANY revision, ALWAYS tell the attorney:
1. WHAT you changed (specific language added/removed/modified)
2. WHERE you changed it (paragraph number, section name, count number)
3. WHY (brief reason)
This is non-negotiable. Never make a silent change.

When using Option A, include the EXACT replacement text for changed paragraphs so the attorney can copy-paste.
- NO markdown — plain text only

DISCOVERY-SPECIFIC KNOWLEDGE:
- All interrogatories must include space/instructions for answering
- RFPs should include instructions, definitions, and numbered requests
- RFAs should be clear yes/no propositions
- Always include a "INSTRUCTIONS TO RESPONDING PARTY" section
- Include standard definitions (Documents, Communications, Identify, Relate to)
- Federal Rules: 33 (interrogatories, max 25), 34 (RFPs), 36 (RFAs)
- N.D. Ga. Local Rules apply (L.R. 26.1, 33.1, 34.1, 37.1)

VALID FCRA STATUTES:
CRA: §1681e(b), §1681i(a)(1)(A), §1681i(a)(2)(A), §1681i(a)(4), §1681i(a)(5)(A), §1681i(a)(5)(B), §1681g, §1681i(c)
Furnishers: §1681s-2(b) (NEVER §1681s-2(a))
FDCPA: §1692c(c), §1692e, §1692f, §1692g
TCPA: §227(b)(1)(A)(iii), §227(b)(1)(B), §227(c)
Georgia FBPA: O.C.G.A. §10-1-390 et seq. (NEVER §34-6-2)

HOW TO DETERMINE YOUR RESPONSE:
- If asking for a revision/change/addition/removal → revise and return full document with "REVISED DOCUMENT:" prefix
- If asking a question about law, procedure, strategy, formatting → answer conversationally and thoroughly
- If unclear, answer the question AND ask if they want you to revise the document based on your answer

Be concise but thorough. The attorney's time is valuable. You are an expert — act like one."""

    if reference_context:
        system_prompt += f"\n\n--- REFERENCE CASE STYLE ---\n{reference_context}"
    if case_law_context:
        system_prompt += f"\n\n--- RELEVANT CASE LAW ---\n{case_law_context}"
    if memory_context:
        system_prompt += f"\n\n--- MEMORY ---\n{memory_context}"

    # Always include attorney info if available in case_facts
    if case_facts and "=== ATTORNEY FOR SIGNATURE BLOCK ===" in case_facts:
        atty_block = case_facts[case_facts.index("=== ATTORNEY FOR SIGNATURE BLOCK ==="):]
        system_prompt += f"\n\n{atty_block}\nALWAYS use this attorney's information in signature blocks and letterheads for ALL documents you draft."

    # Build messages
    messages = []
    for turn in (db_history or [])[-6:]:
        if turn.get("role") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:2000]})
    for turn in (chat_history or [])[-8:]:
        if turn.get("role") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:3000]})

    # Current user message
    user_content = ""
    if complaint_text:
        user_content += f"CURRENT DOCUMENT (v latest):\n---\n{complaint_text}\n---\n\n"
    if case_facts:
        user_content += f"CASE FACTS:\n{case_facts}\n\n"

    # Extract and highlight attorney info from case_facts
    if "=== ATTORNEY FOR SIGNATURE BLOCK ===" in (case_facts or ""):
        atty_section = case_facts[case_facts.index("=== ATTORNEY FOR SIGNATURE BLOCK ==="):]
        user_content += f"\nIMPORTANT — {atty_section}\n\n"

    if attachment_text:
        user_content += f"ATTACHMENTS:\n{attachment_text}\n\n"
    user_content += f"ATTORNEY: {message}"

    messages.append({"role": "user", "content": user_content})

    client = anthropic.Anthropic()

    async def generate():
        full_response = ""
        try:
            with client.messages.stream(
                model="claude-sonnet-4-5",
                max_tokens=16384,
                system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    full_response += text
                    yield f"data: {json.dumps(text)}\n\n"
            yield "data: [DONE]\n\n"

            # Save conversation to revision_history for continuity
            try:
                updated_history = (db_history or []) + [
                    {"role": "user", "content": message[:2000]},
                    {"role": "assistant", "content": full_response[:2000]},
                ]
                updated_history = updated_history[-20:]
                supabase.table("cases").update({
                    "revision_history": updated_history,
                }).eq("id", session_id).execute()
            except Exception:
                pass

            # Extract memories (non-blocking)
            try:
                import asyncio
                from utils.memory import extract_memories_from_draft
                asyncio.create_task(
                    extract_memories_from_draft(
                        session_id=session_id,
                        case_id=session_id,
                        attorney_id=profile.get("id"),
                        revision_message=message,
                        revised_output=full_response[:1000],
                    )
                )
            except Exception:
                pass

            # If it's a revision or a full document, save new version
            revision_marker = None
            complaint_text = None

            if "REVISED DOCUMENT:" in full_response:
                revision_marker = "REVISED DOCUMENT:"
                complaint_text = full_response.split(revision_marker, 1)[1].strip()
            elif "REVISED COMPLAINT:" in full_response:
                revision_marker = "REVISED COMPLAINT:"
                complaint_text = full_response.split(revision_marker, 1)[1].strip()
            elif "IN THE UNITED STATES DISTRICT COURT" in full_response:
                start_idx = full_response.index("IN THE UNITED STATES DISTRICT COURT")
                complaint_text = full_response[start_idx:].strip()
            elif len(full_response) > 1000 and any(marker in full_response for marker in [
                "Dear ", "RE:", "Re:", "DEMAND LETTER", "PRE-LITIGATION",
                "NOTICE OF DISPUTE", "CEASE AND DESIST",
                "PLAINTIFF'S FIRST", "INTERROGATOR", "REQUEST FOR",
                "MOTION TO", "MEMORANDUM",
            ]):
                # Looks like a full legal document (demand letter, discovery, motion)
                complaint_text = full_response.strip()

            if complaint_text and len(complaint_text) > 500:
                    try:
                        version_q = supabase.table("complaints").select("version").eq("case_id", session_id).order("version", desc=True).limit(1).execute()
                        next_v = (version_q.data[0]["version"] + 1) if version_q.data else 1
                        if next_v > 1:
                            supabase.table("complaints").update({"is_current": False}).eq("case_id", session_id).execute()
                        supabase.table("complaints").insert({
                            "case_id": session_id,
                            "complaint_text": complaint_text,
                            "version": next_v,
                            "is_current": True,
                        }).execute()
                        logger.info(f"Saved document version {next_v} for session {session_id}")
                    except Exception as e:
                        logger.warning(f"Could not save document: {e}")

        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# POST /dispute-chat — streaming chat for dispute letter revisions
# ---------------------------------------------------------------------------


@router.post("/dispute-chat")
async def dispute_chat_stream(
    request: Request,
    authorization: str = Header(default=None),
):
    """Streaming chat for the dispute letter editor.
    Accepts the current letter text + user message, streams back a revised version or answer."""
    from fastapi.responses import StreamingResponse
    import anthropic

    profile = await _get_current_user(authorization)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    message = body.get("message", "")
    letter_text = body.get("letter_text", "")
    accounts_context = body.get("accounts_context", "")
    chat_history = body.get("history", [])

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Build system prompt with full Metro 2 knowledge
    from agents.credit_analyzer import ANALYSIS_PROMPT as METRO2_KNOWLEDGE
    # Extract just the Metro 2 reference section
    metro2_section = ""
    if "=== METRO 2 REFERENCE KNOWLEDGE ===" in METRO2_KNOWLEDGE:
        metro2_section = METRO2_KNOWLEDGE[
            METRO2_KNOWLEDGE.index("=== METRO 2 REFERENCE KNOWLEDGE ==="):
            METRO2_KNOWLEDGE.index("=== YOUR TASK ===") if "=== YOUR TASK ===" in METRO2_KNOWLEDGE else len(METRO2_KNOWLEDGE)
        ]

    system_prompt = f"""You are a credit dispute letter assistant. You help an attorney revise and improve FCRA dispute letters.

You have expert-level knowledge of the Metro 2 format from the 2024 CDIA Credit Reporting Resource Guide:

{metro2_section}

When the attorney asks you to:
- REVISE the letter: Return the COMPLETE revised letter text, not just the changed parts. Start your response with "REVISED LETTER:" followed by the full letter.
- ADD accounts or language: Incorporate into the existing letter and return the full revised version.
- REMOVE sections: Remove them and return the full revised version.
- ASK A QUESTION: Answer concisely and helpfully. Cite specific Metro 2 codes, status codes, or FCRA sections.
- CHANGE TONE/STYLE: Apply the change to the full letter and return it.
- IDENTIFY VIOLATIONS: Use Metro 2 knowledge to identify specific reporting violations with exact codes and rules.

RULES:
- Always cite specific Metro 2 field numbers, status codes, and compliance condition codes
- Reference exact FCRA sections (§1681e(b), §1681i(a)(1)(A), etc.)
- Keep dispute language assertive but professional
- When adding Metro 2 violation language, cite the specific rule being violated
- Each disputed account should reference specific inaccuracies with Metro 2 backing
- Consumer statements must be ~100 words, first-person, unique per account
- Be fast and concise in your responses
- If asked about a specific violation, explain what the Metro 2 guide says and how to dispute it"""

    # Inject memory
    try:
        from utils.memory import get_attorney_memories
        mem = get_attorney_memories(profile.get("id"), limit=10)
        if mem:
            system_prompt += f"\n\n--- ATTORNEY PREFERENCES ---\n{mem}"
    except Exception:
        pass

    # Build messages
    messages = []
    for turn in (chat_history or [])[-10:]:
        if turn.get("role") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:3000]})

    user_content = message
    if letter_text:
        user_content = f"CURRENT DISPUTE LETTER:\n---\n{letter_text}\n---\n\n"
        if accounts_context:
            user_content += f"ACCOUNT DETAILS:\n{accounts_context}\n\n"
        user_content += f"ATTORNEY'S REQUEST: {message}"

    messages.append({"role": "user", "content": user_content})

    client = anthropic.Anthropic()

    async def generate():
        try:
            with client.messages.stream(
                model="claude-sonnet-4-5",
                max_tokens=16384,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps(text)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# POST /analyze-credit-report-pdf — upload PDF, extract text server-side, analyze
# ---------------------------------------------------------------------------


@router.post("/analyze-credit-report-pdf")
async def analyze_credit_report_pdf_endpoint(
    file: UploadFile = File(...),
    bureau: str = Form(""),
    authorization: str = Header(default=None),
):
    """Upload a credit report PDF. Server extracts text and sends to Claude."""
    import io

    content = await file.read()
    text = ""

    # Try PyPDF2 first
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                pages.append(page_text)
        text = "\n\n--- PAGE BREAK ---\n\n".join(pages)
        logger.info(f"PDF extracted via PyPDF2: {len(text)} chars from {len(pages)} pages")
    except Exception as e:
        logger.warning(f"PyPDF2 extraction failed: {e}")

    # Fallback: try pymupdf if PyPDF2 failed
    if not text or len(text) < 100:
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            pages = []
            for page in doc:
                page_text = page.get_text()
                if page_text:
                    pages.append(page_text)
            text = "\n\n--- PAGE BREAK ---\n\n".join(pages)
            logger.info(f"PDF extracted via pymupdf: {len(text)} chars from {len(pages)} pages")
        except Exception as e:
            logger.warning(f"pymupdf extraction failed: {e}")

    if not text or len(text) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from this PDF. Try pasting the report text manually.")

    # Smart extraction for web-captured credit reports (TransUnion/Equifax/Experian online)
    # These are 50-80+ page PDFs with massive formatting noise
    import re
    if len(text) > 40000:
        logger.info(f"[PDF] Large report ({len(text)} chars), applying smart extraction")
        import re
        lines = text.split('\n')

        # Detect format: TransUnion (web) vs Equifax (standard PDF) vs other
        is_transunion_web = 'Chat Now' in text or 'transunion.com/dss' in text or 'TransUnion' in text[:500]
        is_equifax = 'equifax.com' in text.lower() or 'Confirmation #' in text or 'Equifax' in text[:500]
        is_experian = 'experian' in text.lower()[:500]

        if is_transunion_web:
            # TransUnion web-captured format: CREDITOR NAME ACCOUNTNUMBER****
            accounts = []
            current = []
            important = {'Address', 'Phone', 'Date Opened', 'Date Updated', 'Date Closed',
                'Pay Status', 'Balance', 'Credit Limit', 'High Balance', 'Loan Type',
                'Monthly Payment', 'Last Payment Made', 'Terms', 'Remarks', 'Responsibility',
                'Account Type', 'Estimated month and year this item will be removed',
                'High Balance (Hist.)', 'Credit Limit (Hist.)', 'Original Creditor'}

            i = 0
            while i < len(lines):
                s = lines[i].strip()
                if re.match(r'^[A-Z][A-Z\s&/\.\'-]+\s+\d{4,}[\d\*]+$', s):
                    if current:
                        accounts.append('\n'.join(current))
                    current = [f'ACCOUNT: {s}']
                    i += 1
                    continue
                for field in important:
                    if s == field or s.startswith(field):
                        if i + 2 < len(lines):
                            val = lines[i + 2].strip()
                            if val and val not in important and not val.startswith('Chat'):
                                current.append(f'{field}: {val}')
                                i += 3
                                break
                        i += 1
                        break
                else:
                    if s in ('30', '60', '90', '120', 'C/O', 'COL', 'FC', 'RPO', 'VS'):
                        for k in range(i - 1, max(i - 6, 0), -1):
                            m = re.match(r'^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$', lines[k].strip())
                            if m:
                                current.append(f'LATE: {m.group()} = {s}')
                                break
                    if '>' in s and '<' in s:
                        current.append(s)
                    i += 1
            if current:
                accounts.append('\n'.join(current))
            accounts = [a for a in accounts if 'ACCOUNT:' in a and len(a) > 30]

            pr = ''
            if 'Public Records' in text:
                pr_start = text.index('Public Records')
                pr_end = min(pr_start + 2000, text.index('Accounts', pr_start) if 'Accounts' in text[pr_start:pr_start + 3000] else pr_start + 2000)
                pr = text[pr_start:pr_end]

            if accounts:
                text = f"CREDIT REPORT (TransUnion) - {len(accounts)} accounts found\n\nPUBLIC RECORDS:\n{pr}\n\n" + '\n\n'.join(accounts)
                logger.info(f"[PDF] TransUnion smart extraction: {len(accounts)} accounts, {len(text)} chars")
            else:
                # Smart extraction found nothing — fall back to cleaned raw text
                logger.warning("[PDF] TransUnion smart extraction found 0 accounts, falling back to raw text")
                text = re.sub(r'\n{3,}', '\n\n', text)

        elif is_equifax:
            # Equifax format: clean structured PDF, just strip noise
            # Remove repeated payment history legends, page headers/footers
            text = re.sub(r'Prepared for:.*?Confirmation #\s*\d+', '', text)
            text = re.sub(r'\d{10,}-DISC\nPage \d+ of \d+\n\S+', '', text)
            text = re.sub(r'Paid on Time\n30\n30 Days Past Due.*?No Data Available', '', text, flags=re.DOTALL)
            text = re.sub(r'\n{3,}', '\n\n', text)
            logger.info(f"[PDF] Equifax cleanup: {len(text)} chars")

        else:
            # Generic large report: just strip common noise
            text = re.sub(r'\n{3,}', '\n\n', text)
            logger.info(f"[PDF] Generic cleanup: {len(text)} chars")

    logger.info(f"[PDF] Final text length: {len(text)} chars, sending to Claude for analysis")

    try:
        from agents.credit_analyzer import analyze_credit_report
        accounts = await analyze_credit_report(text)

        if bureau:
            for acc in accounts:
                if not acc.get("bureau"):
                    acc["bureau"] = bureau

        return {"accounts": accounts, "count": len(accounts), "text_length": len(text)}
    except Exception as e:
        logger.exception("Credit report PDF analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {type(e).__name__}: {str(e)[:300]}")


# ---------------------------------------------------------------------------
# POST /analyze-credit-report — AI analysis of credit report text
# ---------------------------------------------------------------------------


@router.post("/analyze-credit-report")
async def analyze_credit_report_endpoint(
    request: Request,
    authorization: str = Header(default=None),
):
    """Analyze credit report text using Claude to extract all negative accounts."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    report_text = body.get("report_text", "")
    bureau = body.get("bureau", "")

    if not report_text or len(report_text) < 50:
        raise HTTPException(status_code=400, detail="Report text is too short")

    try:
        from agents.credit_analyzer import analyze_credit_report
        accounts = await analyze_credit_report(report_text)

        # Tag each account with the bureau if provided
        if bureau:
            for acc in accounts:
                if not acc.get("bureau"):
                    acc["bureau"] = bureau

        return {"accounts": accounts, "count": len(accounts)}
    except Exception as e:
        logger.exception("Credit report analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {type(e).__name__}: {str(e)[:300]}")


class ReindexPayload(BaseModel):
    force: bool = False


@router.post("/reindex")
async def reindex_reference_cases(
    payload: ReindexPayload = ReindexPayload(),
    authorization: str = Header(default=None),
):
    """Rebuild the RAG reference index from .docx files in
    backend/reference_cases/.

    Parameters
    ----------
    force : bool
        If True, wipes the existing index first and re-indexes
        everything. Otherwise only processes files whose hash has
        changed since the last index.

    Returns a summary dict with counts of files processed and any
    errors encountered. Attorney-only.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    try:
        from utils.reference_indexer import index_all_reference_cases
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Reference indexer could not be loaded: {e}",
        )

    logger.info(f"Reindex triggered by {profile.get('email')} (force={payload.force})")
    result = index_all_reference_cases(force=payload.force)

    return {
        "status": "done",
        **result,
    }


# ---------------------------------------------------------------------------
# GET /reindex/status — count of indexed chunks + list of indexed files
# ---------------------------------------------------------------------------


@router.get("/reindex/status")
async def reindex_status(authorization: str = Header(default=None)):
    """Return the current state of the RAG reference index."""
    try:
        from utils.reference_indexer import iter_reference_files, count_indexed_chunks, _get_reference_dir
        from utils.embeddings import is_configured
        from pathlib import Path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexer unavailable: {e}")

    supabase = get_supabase()

    # Files on disk
    disk_files = [p.name for p in iter_reference_files()]

    # Files currently indexed (distinct source_file values)
    indexed_files: list[str] = []
    try:
        resp = (
            supabase.table("reference_chunks")
            .select("source_file")
            .execute()
        )
        indexed_files = sorted({row["source_file"] for row in (resp.data or [])})
    except Exception as e:
        logger.warning(f"Could not fetch indexed files: {e}")

    return {
        "voyage_configured": is_configured(),
        "files_on_disk": disk_files,
        "files_indexed": indexed_files,
        "total_chunks": count_indexed_chunks(supabase),
        "missing_from_index": [f for f in disk_files if f not in indexed_files],
        "reference_dir": str(_get_reference_dir()),
        "cwd": str(Path.cwd()),
    }


# ---------------------------------------------------------------------------
# POST /{session_id}/revise — chat-style revision of a drafted complaint
# ---------------------------------------------------------------------------


class RevisePayload(BaseModel):
    message: str
    complaint_text: str  # the current complaint text to revise
    attachment_paths: list[str] = []  # Supabase storage paths to analyze


# ---------------------------------------------------------------------------
# GET /{session_id}/versions — list all complaint versions
# ---------------------------------------------------------------------------


@router.get("/{session_id}/versions")
async def list_versions(session_id: str, authorization: str = Header(default=None)):
    """Return all complaint versions for a session."""
    supabase = get_supabase()
    resp = (
        supabase.table("complaints")
        .select("id, version, complaint_text, is_current, created_at")
        .eq("case_id", session_id)
        .order("version", desc=True)
        .execute()
    )
    rows = resp.data or []
    # Add preview + length for each version
    for r in rows:
        text = r.get("complaint_text") or ""
        r["length"] = len(text)
        r["preview"] = text[:200]
    return rows


# ---------------------------------------------------------------------------
# POST /{session_id}/restore-version — make an old version current
# ---------------------------------------------------------------------------


class RestoreVersionPayload(BaseModel):
    version: int


@router.post("/{session_id}/restore-version")
async def restore_version(
    session_id: str,
    payload: RestoreVersionPayload,
    authorization: str = Header(default=None),
):
    """Restore a previous complaint version to be the current one."""
    supabase = get_supabase()

    # Find the target version
    target = (
        supabase.table("complaints")
        .select("id, complaint_text")
        .eq("case_id", session_id)
        .eq("version", payload.version)
        .limit(1)
        .execute()
    )
    if not target.data:
        raise HTTPException(status_code=404, detail=f"Version {payload.version} not found")

    # Mark all other versions as not current
    supabase.table("complaints").update(
        {"is_current": False}
    ).eq("case_id", session_id).execute()

    # Create a new version that is a copy of the target (preserves history)
    max_ver = (
        supabase.table("complaints")
        .select("version")
        .eq("case_id", session_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    new_version = (max_ver.data[0]["version"] + 1) if max_ver.data else 1

    supabase.table("complaints").insert({
        "case_id": session_id,
        "complaint_text": target.data[0]["complaint_text"],
        "version": new_version,
        "is_current": True,
    }).execute()

    return {
        "restored_from_version": payload.version,
        "new_version": new_version,
        "complaint_text": target.data[0]["complaint_text"],
    }


@router.post("/{session_id}/revise")
async def revise_draft(
    session_id: str,
    payload: RevisePayload,
    authorization: str = Header(default=None),
):
    """Send a revision instruction and get back the updated complaint.

    Uses RAG retrieval + conversation memory + explicit statute guidance
    for high-quality revisions that match the attorney's filed case style.
    """
    import anthropic

    supabase = get_supabase()
    client = anthropic.Anthropic()

    # Load revision history for this session (stored in session_metadata jsonb)
    case_resp = (
        supabase.table("cases")
        .select("revision_history")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    conversation_history = []
    if case_resp.data and case_resp.data[0].get("revision_history"):
        conversation_history = case_resp.data[0]["revision_history"] or []

    # Retrieve relevant reference chunks via RAG
    reference_context = ""

    # Read any uploaded attachments
    attachment_text = ""
    if payload.attachment_paths:
        try:
            from utils.document_reader import read_document
            attachment_parts = []
            for path in payload.attachment_paths:
                try:
                    file_type = path.split(".")[-1].lower() if "." in path else "bin"
                    text = read_document(path, file_type)
                    if text:
                        file_name = path.split("/")[-1]
                        # Truncate very long documents
                        if len(text) > 8000:
                            text = text[:8000] + "\n\n[...document truncated, showing first 8000 chars]"
                        attachment_parts.append(f"\n=== ATTACHMENT: {file_name} ===\n{text}\n=== END {file_name} ===\n")
                except Exception as e:
                    logger.warning(f"Could not read attachment {path}: {e}")
                    attachment_parts.append(f"\n[Failed to read {path}: {e}]\n")
            attachment_text = "\n".join(attachment_parts)
            logger.info(f"[revise] Attached {len(payload.attachment_paths)} files ({len(attachment_text)} chars)")
        except Exception as e:
            logger.error(f"[revise] Attachment processing failed: {e}")
    try:
        from utils.rag_retrieval import retrieve_relevant_chunks, format_retrieved_context
        from utils.embeddings import is_configured
        if is_configured():
            query = f"{payload.message}\n\n{payload.complaint_text[:2000]}"
            chunks = retrieve_relevant_chunks(query, top_k=6, document_type="complaint")
            if chunks:
                reference_context = format_retrieved_context(chunks)
                logger.info(f"[revise] RAG retrieved {len(chunks)} chunks")
    except Exception as e:
        logger.warning(f"[revise] RAG retrieval failed: {e}")

    # Inject attorney memory/preferences into the revision context
    profile = await _get_current_user(authorization)
    memory_context = ""
    try:
        from utils.memory import get_full_memory_context
        memory_context = get_full_memory_context(session_id, profile.get("id"))
    except Exception:
        pass

    # Build the enhanced system prompt
    system_prompt = """You are a legal complaint revision assistant specializing in consumer protection law in the Northern District of Georgia.

CRITICAL — USE ONLY THESE STATUTES FOR COUNTS:

FOR CRA DEFENDANTS (Equifax, Experian, TransUnion, Chex Systems):
- 15 U.S.C. § 1681e(b) — failure to follow reasonable procedures for maximum accuracy
- 15 U.S.C. § 1681i(a)(1)(A) — failure to conduct reasonable reinvestigation after dispute
- 15 U.S.C. § 1681i(a)(2)(A) — failure to forward all relevant dispute info to furnisher
- 15 U.S.C. § 1681i(a)(4) — failure to review all relevant information submitted by consumer
- 15 U.S.C. § 1681i(a)(5)(A) — failure to promptly delete inaccurate information after reinvestigation
- 15 U.S.C. § 1681i(a)(5)(B)(i)(ii)(iii) and (C) — reinsertion without certification/notice/procedures
- 15 U.S.C. § 1681g — failure to provide full file disclosure
- 15 U.S.C. § 1681i(c) — failure to add consumer statement

FOR FURNISHERS (ED Financial, Truist, debt servicers):
- 15 U.S.C. § 1681s-2(b) — failure to investigate after CRA notice
  (NEVER use §1681s-2(a) — no private right of action)

FOR DEBT COLLECTORS (Midland, LVNV, Portfolio Recovery):
- 15 U.S.C. § 1692c(c), § 1692e, § 1692f, § 1692g

FOR TCPA:
- 47 U.S.C. § 227(b)(1)(A)(iii), § 227(b)(1)(B), § 227(c)

GEORGIA FBPA (only if willful/deceptive conduct):
- O.C.G.A. § 10-1-390 et seq. (NEVER § 34-6-2)

NEVER use: §1681e(d), §1681s-2(a), §1681i(a)(1)(B), O.C.G.A. § 34-6-2

RULES FOR REVISIONS:
1. Return the COMPLETE revised complaint text — not just the changed parts
2. CONDENSE counts: same violation by multiple defendants = ONE count naming all
3. NEVER add parties the attorney didn't specifically request
4. NEVER hallucinate defendants, case numbers, or facts not in the current complaint
5. Count headers: 3 centered lines — "Count [Roman]" / "Violation of the Fair Credit Reporting Act" / "15 U.S.C. § [section] ([Defendants])"
6. Each count must include: realleges paragraph, violation facts, EXACT damages language, EXACT willful/negligent closing
7. Number ALL paragraphs sequentially 1 through end
8. If renumbering is needed after adding/removing a count, renumber ALL affected paragraphs
9. NO markdown — plain text only. No ## headers, no --- dividers, no ** bold markers
10. Plaintiff referenced as "Mr./Ms. [Last Name]" in counts, not "Plaintiff"

STANDARD DAMAGES LANGUAGE (use verbatim in every count):
"As a result of each Defendant's violations of [section], [Plaintiff] suffered actual damages, including but not limited to: loss of credit, denial of credit, loss of ability to purchase or benefit from credit, loss of time due to learning how to defend against the Defendant's violation of his/her rights, damage to reputation from brandishing an inaccurate consumer report to third parties which in turn led to humiliation and embarrassment, anxiety and other mental, physical, and emotional distress."

STANDARD WILLFUL/NEGLIGENT CLOSING (use verbatim in every count):
"The violations by each defendant were willful rendering the Defendant liable for punitive damages in an amount to be determined by the court pursuant to 15 U.S.C § 1681n. In the alternative, each defendant was negligent, which entitles [Plaintiff] to recovery under 15 U.S.C § 1681o. [Plaintiff] is entitled to recover actual damages, statutory damages, cost and attorney's fees from each defendant in an amount to be determined by the court pursuant to 15 U.S.C §§ 1681n and 1681o."

RESPONSE FORMAT:
CHANGES MADE:
- [bullet list of what you changed]

REVISED COMPLAINT:
[full complaint text here]"""

    # Build messages with conversation history
    messages = []

    # Add prior revision turns
    for turn in conversation_history[-6:]:  # last 3 exchanges max
        if turn.get("role") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    # Current revision request
    user_content_parts = [
        f"CURRENT COMPLAINT:\n\n"
        f"---BEGIN COMPLAINT---\n{payload.complaint_text}\n---END COMPLAINT---",
    ]
    if attachment_text:
        user_content_parts.append(
            f"\nATTACHMENTS (the attorney uploaded these for you to analyze):\n{attachment_text}"
        )
    user_content_parts.append(
        f"\nAttorney's instruction: {payload.message}\n\n"
        f"Remember: do not add defendants, parties, or facts not requested. "
        f"Return the complete revised complaint."
    )
    user_content = "\n".join(user_content_parts)
    messages.append({"role": "user", "content": user_content})

    # Build system blocks with cached core + optional RAG
    system_blocks = [
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    if reference_context:
        system_blocks.append({"type": "text", "text": reference_context})
    if memory_context:
        system_blocks.append({"type": "text", "text": f"\n--- MEMORY (learned from past interactions) ---\n{memory_context}"})

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=16384,
            system=system_blocks,
            messages=messages,
        )

        assistant_text = response.content[0].text

        # Try to extract the revised complaint from the response
        revised_complaint = None
        changes_summary = ""

        if "REVISED COMPLAINT:" in assistant_text:
            parts = assistant_text.split("REVISED COMPLAINT:", 1)
            changes_summary = parts[0].replace("CHANGES MADE:", "").strip()
            candidate = parts[1].strip()
            if len(candidate) > 500:  # must look like an actual complaint
                revised_complaint = candidate
        elif "---BEGIN COMPLAINT---" in assistant_text:
            try:
                start = assistant_text.index("---BEGIN COMPLAINT---") + len("---BEGIN COMPLAINT---")
                end = assistant_text.index("---END COMPLAINT---") if "---END COMPLAINT---" in assistant_text else len(assistant_text)
                candidate = assistant_text[start:end].strip()
                if len(candidate) > 500:
                    revised_complaint = candidate
                changes_summary = assistant_text[:assistant_text.index("---BEGIN COMPLAINT---")].strip()
            except Exception:
                pass

        # Validate: a real revised complaint should have typical markers
        if revised_complaint:
            markers_present = sum(
                1 for m in ["Plaintiff", "Defendant", "Count", "1681", "1692", "227", "Jurisdiction", "Prayer"]
                if m in revised_complaint
            )
            if markers_present < 3 or len(revised_complaint) < 1000:
                # Claude returned something that doesn't look like a complaint —
                # treat it as a chat response, DON'T save as a new version
                revised_complaint = None

        # If we don't have a valid revised complaint, treat this as a chat-only reply
        # and keep the existing complaint unchanged
        if not revised_complaint:
            chat_reply = assistant_text.strip()
            # Trim any leading "CHANGES MADE:" header
            if chat_reply.startswith("CHANGES MADE:"):
                chat_reply = chat_reply[len("CHANGES MADE:"):].strip()

            # Save conversation history only
            try:
                updated_history = conversation_history + [
                    {"role": "user", "content": payload.message[:2000]},
                    {"role": "assistant", "content": chat_reply[:2000]},
                ]
                updated_history = updated_history[-20:]
                supabase.table("cases").update({
                    "revision_history": updated_history,
                }).eq("id", session_id).execute()
            except Exception:
                pass

            # Get current version to return unchanged
            current_ver = 1
            try:
                v = (
                    supabase.table("complaints")
                    .select("version")
                    .eq("case_id", session_id)
                    .eq("is_current", True)
                    .limit(1)
                    .execute()
                )
                if v.data:
                    current_ver = v.data[0].get("version", 1)
            except Exception:
                pass

            return {
                "revised_complaint": payload.complaint_text,  # unchanged
                "changes_summary": chat_reply,
                "version": current_ver,
                "full_response": assistant_text,
                "was_revised": False,
            }

        # Save the revised complaint as a new version
        version_query = (
            supabase.table("complaints")
            .select("version")
            .eq("case_id", session_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        next_version = 1
        if version_query.data:
            next_version = version_query.data[0]["version"] + 1
            supabase.table("complaints").update(
                {"is_current": False}
            ).eq("case_id", session_id).execute()

        supabase.table("complaints").insert({
            "case_id": session_id,
            "complaint_text": revised_complaint,
            "version": next_version,
            "is_current": True,
        }).execute()

        # Save to revision history for multi-turn memory (try/except — column may not exist yet)
        try:
            updated_history = conversation_history + [
                {"role": "user", "content": payload.message[:2000]},
                {"role": "assistant", "content": (changes_summary or "Revised complaint")[:1000]},
            ]
            # Keep only last 20 turns to avoid unbounded growth
            updated_history = updated_history[-20:]
            supabase.table("cases").update({
                "revision_history": updated_history,
            }).eq("id", session_id).execute()
        except Exception as e:
            logger.warning(f"Could not save revision history: {e}")

        # Extract memories from this revision (async, non-blocking)
        try:
            import asyncio
            from utils.memory import extract_memories_from_draft
            asyncio.create_task(
                extract_memories_from_draft(
                    session_id=session_id,
                    case_id=session_id,
                    attorney_id=profile.get("id"),
                    revision_message=payload.message,
                    revised_output=changes_summary or "",
                )
            )
        except Exception:
            pass

        return {
            "revised_complaint": revised_complaint,
            "changes_summary": changes_summary,
            "version": next_version,
            "full_response": assistant_text,
        }

    except Exception as e:
        logger.exception(f"Revision failed for session {session_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Revision failed: {type(e).__name__}: {e}",
        )
