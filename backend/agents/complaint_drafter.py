"""
Complaint Drafter Agent.

Drafts a complete federal complaint in the Northern District of Georgia
style using all prior agent outputs (fact sheet, classification, research
packet, and damages analysis).  Supports revision loops when the QA
reviewer identifies issues.

Reads `.docx` files from `backend/reference_cases/` at runtime and
includes condensed excerpts in the system context so the drafter
matches the exact voice and structure of previously filed complaints.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reference cases loader
# ---------------------------------------------------------------------------

_REFERENCE_CASES_DIR = Path(__file__).resolve().parent.parent / "reference_cases"
_REFERENCE_CACHE: dict[str, str] | None = None
_REFERENCE_MAX_CHARS_PER_FILE = 4000
_REFERENCE_MAX_FILES = 5  # cap how many we include to stay within token budget


def _load_reference_cases() -> dict[str, str]:
    """Load and extract text from all .docx files in reference_cases/.

    Cached in-memory after first call. Returns a mapping of filename
    to extracted plain text (truncated to _REFERENCE_MAX_CHARS_PER_FILE).
    """
    global _REFERENCE_CACHE
    if _REFERENCE_CACHE is not None:
        return _REFERENCE_CACHE

    _REFERENCE_CACHE = {}
    if not _REFERENCE_CASES_DIR.exists():
        logger.info("reference_cases/ directory not found — skipping")
        return _REFERENCE_CACHE

    try:
        from docx import Document as DocxDocument
    except ImportError:
        logger.warning("python-docx not available — skipping reference cases")
        return _REFERENCE_CACHE

    for docx_path in sorted(_REFERENCE_CASES_DIR.glob("*.docx")):
        try:
            doc = DocxDocument(str(docx_path))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            if len(text) > _REFERENCE_MAX_CHARS_PER_FILE:
                text = text[:_REFERENCE_MAX_CHARS_PER_FILE] + "\n[...truncated]"
            _REFERENCE_CACHE[docx_path.name] = text
            logger.info(f"Loaded reference case: {docx_path.name}")
        except Exception as e:
            logger.warning(f"Could not read reference case {docx_path.name}: {e}")

    return _REFERENCE_CACHE


def _build_reference_context(max_files: int = _REFERENCE_MAX_FILES) -> str:
    """Return a formatted string of reference case excerpts, or empty
    string if there are no reference files."""
    cases = _load_reference_cases()
    if not cases:
        return ""

    selected = list(cases.items())[:max_files]
    parts = [
        "\n\n=== REFERENCE CASES (prior filed complaints — match this style) ==="
    ]
    for filename, text in selected:
        parts.append(f"\n--- {filename} ---\n{text}")
    return "\n".join(parts)

AGENT_NAME = "complaint_drafter"
MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = (
    "You are a legal complaint drafter specializing in consumer protection law "
    "in the Northern District of Georgia. You draft complaints that exactly "
    "match the style of successfully filed cases in that district. Draft the "
    "complete complaint using this precise structure and language:\n\n"

    "FORMATTING: Times New Roman 12pt, double-spaced, 1-inch margins all "
    "sides, US Letter page size.\n\n"

    "CAPTION: Two-column table. Left column: Plaintiff Name / Plaintiff, / "
    "v. / Defendant Name(s) / Defendants. Right column: CASE NO. _____ / "
    "Complaint for a civil case / Jury Trial: \u2611 Yes \u2610 No\n\n"

    "SECTIONS IN ORDER:\n"
    "1. Introduction \u2014 'This is a civil action for actual, statutory damages "
    "and cost brought by [Plaintiff] (\"Plaintiff\") an individual consumer, "
    "against defendant(s), [Defendants] for violations of the [Statutes].'\n"

    "2. Jurisdiction \u2014 'Jurisdiction of this court arises under 15 U.S.C "
    "\u00a7 1681(P), 15 U.S.C \u00a7 1692 K(d) and 28 U.S.C \u00a7 1391 B(2) because a "
    "substantial part of the events, omissions, or conduct giving rise to "
    "plaintiff claim occurred in this judicial district. [Defendants] transact "
    "business in Atlanta, Fulton County, Georgia. The court has supplemental "
    "jurisdiction of any state law pursuant to 28 U.S.C \u00a7 1367.'\n"

    "3. Parties \u2014 Plaintiff defined as 'natural person and consumer as "
    "defined by 15 U.S.C \u00a7 1681 a(c), residing in [County], Georgia.' Each "
    "CRA defendant defined under \u00a71681a(f) with full address and GA registered "
    "agent. Each debt collector defined under \u00a71692a(6). Each furnisher defined "
    "under \u00a71681s-2.\n"

    "4. Introduction (FCRA findings) \u2014 '...the banking system is dependent "
    "upon fair and accurate credit reporting...'\n"

    "5. Factual Allegations \u2014 numbered paragraphs, plain factual narrative\n"

    "6. Counts \u2014 each count: bold centered header 'Count [Roman Numeral] "
    "Violation of [Statute] [Section] ([Defendants])' / realleges paragraph / "
    "violation facts / damages language / willful-negligent close. CONDENSE "
    "counts \u2014 same violation by multiple defendants = one count naming all.\n"

    "7. Prayer for Relief \u2014 Declaratory relief / Actual damages / Statutory "
    "damages / Punitive damages / Treble damages if FBPA / Attorney fees and "
    "costs / Other relief\n"

    "8. TRIAL BY JURY IS DEMANDED \u2014 centered bold\n"

    "9. Signature block \u2014 Date blank, Plaintiff name, address, phone, email\n\n"

    "Number ALL paragraphs sequentially 1 through end. Return the complete "
    "complaint text."
)


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude's response, handling markdown-wrapped JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    # The complaint drafter may return plain text instead of JSON.
    # Try JSON first; fall back to wrapping raw text in a dict.
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"complaint_text": text.strip()}


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    """Update an agent_outputs row with the given fields."""
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


async def run(
    case_id: str,
    fact_sheet: dict,
    classification: dict,
    research: dict,
    damages: dict,
    revision_notes: str = None,
) -> dict:
    """Run the complaint drafter agent.

    Parameters
    ----------
    case_id:
        UUID of the case being processed.
    fact_sheet:
        Structured fact sheet from the intake analyst.
    classification:
        Case classification from the case classifier.
    research:
        Research packet from the legal researcher.
    damages:
        Damages analysis from the damages analyst.
    revision_notes:
        Optional notes from the QA reviewer indicating issues that need
        to be fixed in a revision pass.

    Returns
    -------
    dict
        Dictionary containing at least ``complaint_text`` with the full
        drafted complaint.
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
        # ── Build the user message ───────────────────────────────────────
        user_parts = [
            "Draft a complete federal complaint using the following materials.\n",
            f"FACT SHEET:\n{json.dumps(fact_sheet, indent=2)}\n",
            f"CASE CLASSIFICATION:\n{json.dumps(classification, indent=2)}\n",
            f"RESEARCH PACKET:\n{json.dumps(research, indent=2)}\n",
            f"DAMAGES ANALYSIS:\n{json.dumps(damages, indent=2)}\n",
        ]

        if revision_notes:
            user_parts.append(
                "REVISION NOTES (fix these issues from the previous draft):\n"
                f"{revision_notes}\n"
            )

        user_message = "\n".join(user_parts)

        # Append reference case excerpts to the system prompt at runtime
        system_with_refs = SYSTEM_PROMPT + _build_reference_context()

        # ── Call Claude ──────────────────────────────────────────────────
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_with_refs,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        result = _parse_json_response(raw_text)

        # Ensure there is always a complaint_text key
        if "complaint_text" not in result:
            # If Claude returned structured JSON without the key, wrap it
            result["complaint_text"] = raw_text.strip()

        # ── Save to the complaints table ─────────────────────────────────
        # Determine current version number
        version_query = (
            supabase.table("complaints")
            .select("version")
            .eq("case_id", case_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        next_version = 1
        if version_query.data:
            next_version = version_query.data[0]["version"] + 1
            # Mark previous versions as not current
            supabase.table("complaints").update(
                {"is_current": False}
            ).eq("case_id", case_id).execute()

        supabase.table("complaints").insert(
            {
                "case_id": case_id,
                "complaint_text": result["complaint_text"],
                "version": next_version,
                "is_current": True,
            }
        ).execute()

        # ── Persist agent output success ─────────────────────────────────
        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(
            supabase,
            output_id,
            status="complete",
            output_data=result,
            completed_at=completed_at,
        )

        logger.info(
            "Complaint drafter completed for case %s (version %d)",
            case_id,
            next_version,
        )
        return result

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Complaint drafter failed for case %s", case_id)
        _update_agent_output(
            supabase,
            output_id,
            status="error",
            error_message=error_msg,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
