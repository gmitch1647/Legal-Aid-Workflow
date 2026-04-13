"""
Case Classifier Agent.

Analyses a structured fact sheet and identifies every applicable federal
and state statute that has been violated, recommends the correct court,
and maps each violation to the responsible defendant.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "case_classifier"
MODEL = "claude-haiku-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = (
    "You are a consumer protection law case classifier. Based on the fact sheet "
    "provided, identify every applicable federal and state statute that has been "
    "violated. Consider: "
    "FCRA (15 U.S.C. \u00a7 1681 et seq.) \u2014 inaccurate reporting, failure to "
    "investigate, failure to delete, reinsertion without notice, failure to provide "
    "full file disclosure, failure to add consumer statement, failure to provide "
    "reinvestigation procedure description, furnisher liability under \u00a71681s-2(b). "
    "FDCPA (15 U.S.C. \u00a7 1692 et seq.) \u2014 failure to cease communication, false "
    "representations, unfair means. "
    "TCPA (47 U.S.C. \u00a7 227) \u2014 autodialer calls, prerecorded messages, "
    "do-not-call violations. "
    "Georgia FBPA (O.C.G.A. \u00a7 10-1-390 et seq.) \u2014 include when conduct is "
    "willful or deceptive. "
    "Recommend the correct court: default to United States District Court, "
    "Northern District of Georgia, Atlanta Division unless facts indicate another "
    "district is more appropriate. "
    "Return a structured classification with each violation identified, the specific "
    "statute and subsection, which defendant committed it, and your reasoning."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response with robust error handling."""
    from utils.json_parser import parse_agent_json
    return parse_agent_json(text, agent_name=AGENT_NAME)


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(case_id: str, fact_sheet: dict) -> dict:
    """Run the case classifier agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    fact_sheet:
        Structured fact sheet produced by the intake analyst.

    Returns
    -------
    dict
        Classification JSON with violations, statutes, defendants, and reasoning.
    """
    supabase = get_supabase()
    client = anthropic.Anthropic()

    now = datetime.now(timezone.utc).isoformat()

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
        user_message = (
            "Analyse the following fact sheet and classify the case.\n\n"
            f"FACT SHEET:\n{json.dumps(fact_sheet, indent=2)}"
        )

        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        classification = _parse_json_response(raw_text)

        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=classification,
            completed_at=completed_at,
        )

        logger.info("Case classifier completed for case %s", case_id)
        return classification

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Case classifier failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
