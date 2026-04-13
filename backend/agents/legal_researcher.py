"""
Legal Researcher Agent.

Compiles a complete research packet based on the case classification,
including statutory language, count structure, case law citations, and
pleading elements for each identified violation.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "legal_researcher"
MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = (
    "You are a legal researcher specializing in consumer protection litigation. "
    "Based on the case classification provided, compile a complete research packet "
    "including: the exact statutory language for every identified violation, the "
    "proper count structure for a complaint (condensed \u2014 if multiple defendants "
    "committed the same violation, combine them in one count), applicable case law "
    "citations that support each violation, and the standard pleading elements "
    "required for each count. "
    "Reference these prior filed case styles: Northern District of Georgia FCRA "
    "complaints against Equifax, Experian, TransUnion \u2014 cases have been "
    "successfully filed using counts under \u00a71681e(b), \u00a71681i(a)(1)(A), "
    "\u00a71681i(a)(2)(A), \u00a71681i(a)(4), \u00a71681i(a)(5)(A), \u00a71681g, "
    "\u00a71681i(c), \u00a71681i(a)(6)(B)(iii), \u00a71681i(a)(5)(B)(i)(ii)(iii) "
    "and (C), \u00a71681s-2(b). "
    "Return a structured research packet."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response, handling markdown-wrapped JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[: -3].strip()
    return json.loads(cleaned)


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(case_id: str, classification: dict) -> dict:
    """Run the legal researcher agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    classification:
        Case classification produced by the case classifier agent.

    Returns
    -------
    dict
        Structured research packet with statutory language, count structure,
        case law, and pleading elements.
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
            "Based on the following case classification, compile a complete "
            "research packet.\n\n"
            f"CASE CLASSIFICATION:\n{json.dumps(classification, indent=2)}"
        )

        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        research_packet = _parse_json_response(raw_text)

        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=research_packet,
            completed_at=completed_at,
        )

        logger.info("Legal researcher completed for case %s", case_id)
        return research_packet

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Legal researcher failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
