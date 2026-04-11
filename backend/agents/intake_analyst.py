"""
Intake Analyst Agent.

Reads all case documents and facts submitted by a client, sends them to
Claude, and extracts a complete, structured fact sheet for downstream agents.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase
from utils.document_reader import read_document

logger = logging.getLogger(__name__)

AGENT_NAME = "intake_analyst"
MODEL = "claude-haiku-4-5"
MAX_TOKENS = 4096

SYSTEM_PROMPT = (
    "You are a legal intake analyst specializing in consumer protection law. "
    "Your job is to read all case documents and facts submitted by a client and "
    "extract a complete, structured fact sheet. Extract: plaintiff full name and "
    "county, all defendant names and their role (CRA / debt collector / furnisher), "
    "all relevant dates (when delinquency began, when disputes were sent, when "
    "responses were received, key violation dates), account numbers and account "
    "details, specific violations described, any forbearance or administrative "
    "protection covering the relevant period, prior dispute history, and any "
    "damages described by the client. Return a structured JSON fact sheet."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response, handling markdown-wrapped JSON."""
    cleaned = text.strip()
    # Handle markdown code blocks
    if cleaned.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
        # Remove closing fence
        if cleaned.endswith("```"):
            cleaned = cleaned[: -3].strip()
    return json.loads(cleaned)


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(case_id: str, case_data: dict) -> dict:
    """Run the intake analyst agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    case_data:
        Dictionary containing at minimum ``case_facts``, ``damages_description``,
        and ``defendants`` (list of defendant dicts).

    Returns
    -------
    dict
        Structured fact sheet extracted by Claude.
    """
    supabase = get_supabase()
    client = anthropic.Anthropic()

    # ── Create / locate the agent_output record ──────────────────────────
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        supabase.table("agent_outputs")
        .select("id")
        .eq("case_id", case_id)
        .eq("agent_name", AGENT_NAME)
        .order("created_at", desc=True)
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
        # ── Gather document text ─────────────────────────────────────────
        docs_response = (
            supabase.table("documents")
            .select("file_name, file_type, storage_path")
            .eq("case_id", case_id)
            .execute()
        )

        document_texts: list[str] = []
        for doc in docs_response.data or []:
            try:
                text = read_document(doc["storage_path"], doc["file_type"])
                if text:
                    document_texts.append(
                        f"--- Document: {doc['file_name']} ---\n{text}"
                    )
            except Exception:
                logger.exception(
                    "Failed to read document %s for case %s",
                    doc["file_name"],
                    case_id,
                )
                document_texts.append(
                    f"--- Document: {doc['file_name']} ---\n"
                    "[Error: could not extract text from this document]"
                )

        # ── Build the user message ───────────────────────────────────────
        user_content_parts = [
            f"CASE FACTS:\n{case_data.get('case_facts', '')}",
            f"\nDAMAGES DESCRIBED:\n{case_data.get('damages_description', '')}",
        ]

        defendants = case_data.get("defendants", [])
        if defendants:
            defendant_lines = []
            for d in defendants:
                name = d.get("name", "Unknown")
                role = d.get("entity_type", "Unknown role")
                defendant_lines.append(f"- {name} ({role})")
            user_content_parts.append(
                "\nDEFENDANTS:\n" + "\n".join(defendant_lines)
            )

        if document_texts:
            user_content_parts.append(
                "\nUPLOADED DOCUMENTS:\n" + "\n\n".join(document_texts)
            )
        else:
            user_content_parts.append(
                "\n[No documents were uploaded for this case.]"
            )

        user_message = "\n".join(user_content_parts)

        # ── Call Claude ──────────────────────────────────────────────────
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        fact_sheet = _parse_json_response(raw_text)

        # ── Persist success ──────────────────────────────────────────────
        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=fact_sheet,
            completed_at=completed_at,
        )

        logger.info("Intake analyst completed for case %s", case_id)
        return fact_sheet

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Intake analyst failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
