"""
QA Reviewer Agent.

Reviews a drafted complaint against a comprehensive checklist covering
court/venue accuracy, count completeness, statutory citations, paragraph
numbering, required language, defendant definitions, and prayer for relief.
Returns a structured pass/fail result with specific issues when applicable.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "qa_reviewer"
MODEL = "claude-haiku-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = (
    "You are a quality assurance reviewer for legal complaints. Review the "
    "drafted complaint against this checklist and return a structured review "
    "result: "
    "(1) Does the court and venue match the classification? "
    "(2) Is there a count for every identified violation? "
    "(3) Are all statutory citations accurate and complete? "
    "(4) Are paragraph numbers sequential with no gaps? "
    "(5) Does every count contain the required damages language? "
    "(6) Does every count contain the willful/negligent closing? "
    "(7) Are all defendants properly defined in the Parties section with "
    "addresses? "
    "(8) Is the Georgia FBPA count included where the classification "
    "identified willful conduct? "
    "(9) Is the caption table correct? "
    "(10) Is the prayer for relief complete? "
    "If any check fails, return: approved: false, issues: [list of specific "
    "issues]. If all checks pass, return: approved: true. Be specific about "
    "what needs to be fixed."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response with robust error handling."""
    from utils.json_parser import parse_agent_json
    return parse_agent_json(text, agent_name=AGENT_NAME)


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(case_id: str, complaint_text: str, classification: dict) -> dict:
    """Run the QA reviewer agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    complaint_text:
        Full complaint text produced by the complaint drafter.
    classification:
        Case classification from the case classifier (used to verify
        that every identified violation has a corresponding count).

    Returns
    -------
    dict
        Review result containing ``approved`` (bool) and, when not
        approved, ``issues`` (list of strings describing each failure).
    """
    supabase = get_supabase()
    client = anthropic.Anthropic()

    now = datetime.now(timezone.utc).isoformat()

    # ── Create / locate the agent_output record ──────────────────────────
    existing = (
        supabase.table("agent_outputs")
        .select("id")
        .eq("case_id", case_id)
        .eq("agent_name", AGENT_NAME)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )

    if existing.data:
        output_id = existing.data[0]["id"]
        _update_agent_output(
            supabase,
            output_id,
            status="running",
            started_at=now,
            error_message=None,
        )
    else:
        insert = (
            supabase.table("agent_outputs")
            .insert(
                {
                    "case_id": case_id,
                    "agent_name": AGENT_NAME,
                    "status": "running",
                    "started_at": now,
                }
            )
            .execute()
        )
        output_id = insert.data[0]["id"]

    try:
        # ── Build the user message ───────────────────────────────────────
        user_message = (
            "Review the following drafted complaint against the case "
            "classification. Apply every item on the QA checklist and "
            "return your structured review result.\n\n"
            f"CASE CLASSIFICATION:\n{json.dumps(classification, indent=2)}\n\n"
            f"COMPLAINT TEXT:\n{complaint_text}"
        )

        # ── Call Claude ──────────────────────────────────────────────────
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        review_result = _parse_json_response(raw_text)

        # Normalise the result structure
        if "approved" not in review_result:
            # If Claude returned a different structure, try to infer
            review_result["approved"] = False
            if "issues" not in review_result:
                review_result["issues"] = [
                    "QA review returned an unexpected format; manual review required."
                ]

        # Ensure issues is always a list when not approved
        if not review_result.get("approved") and "issues" not in review_result:
            review_result["issues"] = []

        # ── Persist success ──────────────────────────────────────────────
        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=review_result,
            completed_at=completed_at,
        )

        logger.info(
            "QA reviewer completed for case %s — approved: %s",
            case_id,
            review_result.get("approved"),
        )
        return review_result

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("QA reviewer failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
