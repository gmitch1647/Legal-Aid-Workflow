"""
Damages Analyst Agent.

Calculates all applicable damages based on the fact sheet and case
classification, and provides the exact pleading language to use in the
complaint for each statutory violation.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "damages_analyst"
MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = (
    "You are a consumer protection damages analyst. Based on the fact sheet "
    "and case classification, calculate all applicable damages and provide the "
    "exact pleading language to use in the complaint. "
    "For FCRA violations: actual damages (loss of credit, credit denials, "
    "emotional distress, lost time, embarrassment, humiliation, anxiety), "
    "statutory damages $100\u2013$1,000 per violation under \u00a71681n, punitive "
    "damages for willful violations under \u00a71681n, attorney fees and costs "
    "under \u00a71681n and \u00a71681o. "
    "For FDCPA violations: actual damages, statutory damages up to $1,000 "
    "under \u00a71692k(a)(2)(A), attorney fees under \u00a71692k(a)(3). "
    "For TCPA violations: $500 per violation, $1,500 for willful violations "
    "under \u00a7227(b)(3). "
    "For Georgia FBPA: treble damages under O.C.G.A. \u00a710-1-399 for willful "
    "conduct. "
    "Use this exact damages language in every count: "
    "'As a result of each Defendant\u2019s violations of [section], [Plaintiff] "
    "suffered actual damages, including but not limited to: loss of credit, "
    "denial of credit, loss of ability to purchase or benefit from credit, "
    "loss of time due to learning how to defend against the Defendant\u2019s "
    "violation of his/her rights, damage to reputation from brandishing an "
    "inaccurate consumer report to third parties which in turn led to "
    "humiliation and embarrassment, anxiety and other mental, physical, and "
    "emotional distress.' "
    "Use this willful/negligent closing in every count: "
    "'The violations by each defendant were willful rendering the Defendant "
    "liable for punitive damages in an amount to be determined by the court "
    "pursuant to 15 U.S.C \u00a7 1681n. In the alternative, each defendant was "
    "negligent, which entitles [Plaintiff] to recovery under 15 U.S.C "
    "\u00a7 1681o. [Plaintiff] is entitled to recover actual damages, statutory "
    "damages, cost and attorney\u2019s fees from each defendant in an amount to "
    "be determined by the court pursuant to 15 U.S.C \u00a7\u00a7 1681n and 1681o.' "
    "Return structured damages analysis."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response with robust error handling."""
    from utils.json_parser import parse_agent_json
    return parse_agent_json(text, agent_name=AGENT_NAME)


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(case_id: str, fact_sheet: dict, classification: dict) -> dict:
    """Run the damages analyst agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    fact_sheet:
        Structured fact sheet produced by the intake analyst.
    classification:
        Case classification produced by the case classifier agent.

    Returns
    -------
    dict
        Structured damages analysis with calculated damages and pleading
        language for each count.
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
            "Based on the following fact sheet and case classification, "
            "calculate all applicable damages and provide the exact pleading "
            "language for each count.\n\n"
            f"FACT SHEET:\n{json.dumps(fact_sheet, indent=2)}\n\n"
            f"CASE CLASSIFICATION:\n{json.dumps(classification, indent=2)}"
        )

        # ── Call Claude ──────────────────────────────────────────────────
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        damages = _parse_json_response(raw_text)

        # ── Persist success ──────────────────────────────────────────────
        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=damages,
            completed_at=completed_at,
        )

        logger.info("Damages analyst completed for case %s", case_id)
        return damages

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Damages analyst failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
