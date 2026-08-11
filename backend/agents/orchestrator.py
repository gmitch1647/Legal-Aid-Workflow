"""
Pipeline Orchestrator.

Master controller that runs the full agent pipeline for a case:

    intake_analyst -> case_classifier -> legal_researcher ->
    damages_analyst -> complaint_drafter -> qa_reviewer

Includes retry logic (max 2 retries per agent), a QA revision loop
(max 2 iterations), DOCX generation, status updates, and attorney
notification on completion.
"""

import json
import logging
from datetime import datetime, timezone

from utils.supabase_client import get_supabase
from utils.notifications import notify_attorney_draft_ready
from utils.email_service import send_draft_ready_notification

from agents import (
    intake_analyst,
    case_classifier,
    legal_researcher,
    damages_analyst,
    complaint_drafter,
    qa_reviewer,
)

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MAX_AGENT_RETRIES = 2
MAX_QA_REVISIONS = 2

AGENT_SEQUENCE = [
    "intake_analyst",
    "case_classifier",
    "legal_researcher",
    "damages_analyst",
    "complaint_drafter",
    "qa_reviewer",
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _update_case_status(supabase, case_id: str, status: str) -> None:
    """Update the case record's workflow status."""
    supabase.table("cases").update(
        {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", case_id).execute()


def _create_pending_agent_outputs(supabase, case_id: str) -> dict:
    """Create a 'pending' agent_outputs row for each agent in the pipeline.

    Returns a mapping of agent_name -> output_id so downstream code can
    update the correct row.
    """
    output_ids: dict[str, str] = {}
    for agent_name in AGENT_SEQUENCE:
        # Check if a record already exists (e.g. from a previous failed run)
        existing = (
            supabase.table("agent_outputs")
            .select("id")
            .eq("case_id", case_id)
            .eq("agent_name", agent_name)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        if existing.data:
            row_id = existing.data[0]["id"]
            supabase.table("agent_outputs").update(
                {"status": "pending", "error_message": None}
            ).eq("id", row_id).execute()
            output_ids[agent_name] = row_id
        else:
            insert = (
                supabase.table("agent_outputs")
                .insert(
                    {
                        "case_id": case_id,
                        "agent_name": agent_name,
                        "status": "pending",
                    }
                )
                .execute()
            )
            output_ids[agent_name] = insert.data[0]["id"]
    return output_ids


async def _run_with_retries(agent_fn, *args, agent_name: str = "", **kwargs):
    """Execute an agent function with up to MAX_AGENT_RETRIES retries.

    On the final failure the exception is re-raised so the orchestrator
    can handle it as an unrecoverable error.
    """
    last_exc = None
    for attempt in range(1, MAX_AGENT_RETRIES + 2):  # 1 initial + N retries
        try:
            return await agent_fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt <= MAX_AGENT_RETRIES:
                logger.warning(
                    "Agent '%s' failed (attempt %d/%d): %s — retrying",
                    agent_name,
                    attempt,
                    MAX_AGENT_RETRIES + 1,
                    exc,
                )
            else:
                logger.error(
                    "Agent '%s' failed after %d attempts: %s",
                    agent_name,
                    attempt,
                    exc,
                )
    raise last_exc  # type: ignore[misc]


def _fetch_case_data(supabase, case_id: str) -> dict:
    """Fetch the case record and related data from Supabase.

    Returns a dictionary containing the case row plus a ``defendants``
    list and the attorney's profile (if an attorney is assigned).
    """
    # Core case record
    case_resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not case_resp.data:
        raise ValueError(f"Case {case_id} not found")

    case_row = case_resp.data[0]

    # Defendants linked to this case via the junction table
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
            .eq("id", str(did))
            .limit(1)
            .execute()
        )
        if d_resp.data:
            defendants.append(d_resp.data[0])

    case_data = {
        **case_row,
        "defendants": defendants,
    }

    # Try to resolve the attorney profile for notifications
    attorney_profile = None
    try:
        attorney_resp = (
            supabase.table("profiles")
            .select("id, full_name, email")
            .eq("role", "attorney")
            .limit(1)
            .execute()
        )
        if attorney_resp.data:
            attorney_profile = attorney_resp.data[0]
    except Exception:
        logger.warning("Could not fetch attorney profile for notifications")

    case_data["_attorney_profile"] = attorney_profile

    return case_data


def _generate_docx(
    case_id: str,
    complaint_text: str,
    case_data: dict,
    defendants: list,
    agent_outputs: dict,
    version: int = 1,
) -> None:
    """Generate DOCX files via the formatter utility.

    The formatter is imported lazily so that the orchestrator module
    can still be loaded in environments where python-docx is not
    installed (e.g. lightweight test runners).
    """
    try:
        from utils.formatter import format_complaint_documents  # type: ignore[import]
        format_complaint_documents(
            case_id, complaint_text, case_data, defendants, agent_outputs, version
        )
        logger.info("DOCX generated for case %s", case_id)
    except ImportError:
        logger.warning(
            "utils.formatter not available — skipping DOCX generation "
            "for case %s",
            case_id,
        )
    except Exception:
        logger.exception("DOCX generation failed for case %s", case_id)


# ── Main pipeline ────────────────────────────────────────────────────────────

async def run_pipeline(case_id: str) -> dict:
    """Execute the full agent pipeline for a given case.

    Orchestration steps
    -------------------
    1. Fetch case data and documents from Supabase.
    2. Update case status to ``agents_processing``.
    3. Create ``pending`` agent_output records for all six agents.
    4. Run agents in sequence, passing each agent's output to the next.
    5. If the QA reviewer returns ``approved: false``, feed the issues
       back to the complaint drafter (max 2 revision loops).
    6. Generate DOCX files from the approved complaint.
    7. Update case status to ``draft_ready``.
    8. Send notification to the assigned attorney.
    9. Return a summary dict of the pipeline run.

    Error handling
    --------------
    Each agent is retried up to 2 times on failure.  If an agent still
    fails after retries the case status is set to ``error`` and the
    exception details are logged.

    Parameters
    ----------
    case_id:
        UUID of the case to process.

    Returns
    -------
    dict
        Summary of the pipeline execution including the status of each
        agent and the final case status.
    """
    supabase = get_supabase()
    pipeline_start = datetime.now(timezone.utc).isoformat()

    pipeline_result: dict = {
        "case_id": case_id,
        "started_at": pipeline_start,
        "agents": {},
        "qa_revision_count": 0,
        "final_status": None,
    }

    try:
        # ── 1. Fetch case data ───────────────────────────────────────────
        case_data = _fetch_case_data(supabase, case_id)
        attorney_profile = case_data.pop("_attorney_profile", None)

        # ── 2. Update case status ────────────────────────────────────────
        _update_case_status(supabase, case_id, "agents_processing")

        # ── 3. Create pending agent_output records ───────────────────────
        _create_pending_agent_outputs(supabase, case_id)

        # ── 4. Run agents sequentially ───────────────────────────────────

        # 4a. Intake Analyst
        fact_sheet = await _run_with_retries(
            intake_analyst.run,
            case_id,
            case_data,
            agent_name="intake_analyst",
        )
        pipeline_result["agents"]["intake_analyst"] = "complete"

        # 4b. Case Classifier
        classification = await _run_with_retries(
            case_classifier.run,
            case_id,
            fact_sheet,
            agent_name="case_classifier",
        )
        pipeline_result["agents"]["case_classifier"] = "complete"

        # 4c. Legal Researcher
        research = await _run_with_retries(
            legal_researcher.run,
            case_id,
            classification,
            agent_name="legal_researcher",
        )
        pipeline_result["agents"]["legal_researcher"] = "complete"

        # 4d. Damages Analyst
        damages = await _run_with_retries(
            damages_analyst.run,
            case_id,
            fact_sheet,
            classification,
            agent_name="damages_analyst",
        )
        pipeline_result["agents"]["damages_analyst"] = "complete"

        # 4e. Complaint Drafter
        draft_result = await _run_with_retries(
            complaint_drafter.run,
            case_id,
            fact_sheet,
            classification,
            research,
            damages,
            agent_name="complaint_drafter",
        )
        pipeline_result["agents"]["complaint_drafter"] = "complete"

        complaint_text = draft_result.get("complaint_text", "")

        # 4f. QA Reviewer (with revision loop)
        qa_result = await _run_with_retries(
            qa_reviewer.run,
            case_id,
            complaint_text,
            classification,
            agent_name="qa_reviewer",
        )
        pipeline_result["agents"]["qa_reviewer"] = "complete"

        # ── 5. QA revision loop ──────────────────────────────────────────
        revision_count = 0
        while (
            not qa_result.get("approved")
            and revision_count < MAX_QA_REVISIONS
        ):
            revision_count += 1
            logger.info(
                "QA revision loop %d for case %s — issues: %s",
                revision_count,
                case_id,
                qa_result.get("issues"),
            )

            # Build revision notes from the QA issues list
            issues_list = qa_result.get("issues", [])
            revision_notes = "\n".join(
                f"- {issue}" for issue in issues_list
            )

            # Re-run complaint drafter with revision notes
            draft_result = await _run_with_retries(
                complaint_drafter.run,
                case_id,
                fact_sheet,
                classification,
                research,
                damages,
                revision_notes,
                agent_name="complaint_drafter",
            )
            complaint_text = draft_result.get("complaint_text", "")

            # Re-run QA reviewer on the revised complaint
            qa_result = await _run_with_retries(
                qa_reviewer.run,
                case_id,
                complaint_text,
                classification,
                agent_name="qa_reviewer",
            )

        pipeline_result["qa_revision_count"] = revision_count

        if not qa_result.get("approved"):
            logger.warning(
                "QA still not approved after %d revisions for case %s — blocking DOCX generation pending attorney review",
                revision_count,
                case_id,
            )
            _update_case_status(supabase, case_id, "attorney_review")
            pipeline_result["final_status"] = "attorney_review"
            pipeline_result["docx_generated"] = False
            pipeline_result["validation_issues"] = qa_result.get("issues", [])
            pipeline_result["completed_at"] = datetime.now(timezone.utc).isoformat()
            return pipeline_result

        # ── 6. Generate DOCX files ───────────────────────────────────────
        agent_outputs_for_memo = {
            "intake_analyst": fact_sheet,
            "case_classifier": classification,
            "legal_researcher": research,
            "damages_analyst": damages,
            "complaint_drafter": draft_result,
            "qa_reviewer": qa_result,
        }
        _generate_docx(
            case_id,
            complaint_text,
            case_data,
            case_data.get("defendants", []),
            agent_outputs_for_memo,
        )
        pipeline_result["docx_generated"] = True

        # ── 7. Update case status to draft_ready ─────────────────────────
        _update_case_status(supabase, case_id, "draft_ready")
        pipeline_result["final_status"] = "draft_ready"

        # ── 8. Notify the attorney ───────────────────────────────────────
        defendant_names = [
            d.get("name", "Unknown") for d in case_data.get("defendants", [])
        ]
        client_name = ""
        try:
            client_resp = (
                supabase.table("profiles")
                .select("full_name")
                .eq("id", str(case_data.get("client_id", "")))
                .limit(1)
                .execute()
            )
            if client_resp.data:
                client_name = client_resp.data[0].get("full_name", "")
        except Exception:
            logger.warning("Could not fetch client name for notification")

        # In-app notification
        if attorney_profile:
            notify_attorney_draft_ready(
                case_id=case_id,
                client_name=client_name or "Client",
                defendants=defendant_names,
                attorney_id=attorney_profile["id"],
            )
            # Email notification
            await send_draft_ready_notification(
                attorney_email=attorney_profile.get("email", ""),
                client_name=client_name or "Client",
                defendant_names=defendant_names,
            )

        pipeline_result["completed_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("Pipeline completed for case %s", case_id)
        return pipeline_result

    except Exception as exc:
        # ── Unrecoverable error ──────────────────────────────────────────
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Pipeline failed for case %s", case_id)

        try:
            _update_case_status(supabase, case_id, "error")
        except Exception:
            logger.exception(
                "Failed to update case status to 'error' for case %s", case_id
            )

        # Store the error in the case record itself so the status
        # endpoint can surface it even if agent_outputs insert fails.
        try:
            supabase.table("cases").update(
                {"revision_notes": f"PIPELINE ERROR: {error_msg}"}
            ).eq("id", case_id).execute()
        except Exception:
            pass

        pipeline_result["final_status"] = "error"
        pipeline_result["error"] = error_msg
        pipeline_result["completed_at"] = datetime.now(timezone.utc).isoformat()
        return pipeline_result
