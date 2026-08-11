"""Complaint drafting agent with deterministic safety and source-grounding controls."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from utils.complaint_safeguards import (
    ComplaintValidationError,
    assert_complaint_safe,
    audit_credit_report,
    build_drafting_context,
    findings_for_prompt,
)
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "complaint_drafter"
MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 8192
MAX_VALIDATION_REWRITES = 2

SYSTEM_PROMPT = """\
You are LegalFlow's complaint-drafting assistant. Produce a working draft for a
licensed attorney's review before filing. The system will mechanically block a
noncompliant draft, so follow every instruction precisely.

SOURCE DISCIPLINE — NON-NEGOTIABLE
- Treat the redacted fact sheet, classification, research packet, damages
  analysis, credit-report audit, and supplied venue context as the only factual
  record. Do not infer, fill gaps, or silently reconcile conflicting facts.
- Never put a full SSN, full date of birth, full CRA file number, full account
  number, financial-account number, or a minor's full name in the pleading.
  Use a last-four reference only where necessary. Do not add any PII that is
  absent from the redacted source record.
- Do not invent a residence, county, venue fact, event date, legal entity,
  registered agent, dollar amount, credit denial, higher interest rate, reduced
  credit limit, adverse action, or factual allegation. Use a bracketed attorney
  note where a required fact is missing. A registered agent must be marked
  [VERIFY VIA GEORGIA SOS eCORP] unless the supplied fact sheet includes a dated
  verification.
- If VENUE CONTEXT says there is a conflict, include its bracketed attorney note
  verbatim in the venue section. Plead venue generally under 28 U.S.C. § 1391(b)
  and, for an entity CRA defendant, use § 1391(c)(2) as the primary residence
  theory. Never manufacture a county to make venue work.

OUTPUT AND FORMAT
- Return plain text only. The DOCX renderer creates the ONE court header and
  caption table. Do not emit a court header, caption, markdown, or duplicate
  title. Paragraphs must be consecutively numbered.
- Use the sections: NATURE OF ACTION; JURISDICTION AND VENUE; PARTIES;
  FACTUAL ALLEGATIONS; ARTICLE III STANDING AND CONCRETE INJURY; any required
  1681g disclosure narrative; COUNTS; JURY DEMAND AND PRAYER FOR RELIEF;
  SIGNATURE BLOCK.
- For each tradeline with audit findings, use one centered bold-italic
  subheading bearing the tradeline name. Follow it with a paragraph containing
  literal report fields and one numbered paragraph per finding. Include the
  finding ID (for example C-01 or IMPOSSIBLE_DOFD) and at least one literal
  report field/month/value. Do not substitute generic “inconsistencies” prose.
- Never present a statutory paraphrase in quotation marks. Cite the subsection
  and describe the sourced conduct accurately.

COUNTS AND RELIEF
- For CRA defendants, plead FCRA counts only. Do not add any state-law count
  unless the supplied source contains an explicit state_law_claim object with a
  satisfied pre-suit notice date. If a state-law count is not live, omit § 1367,
  its relief request, and all state-law fee references.
- Every FCRA statutory section must appear as a count pair: first a willful
  count citing the section and § 1681n; immediately after, a negligent count
  citing the same section and § 1681o. The negligent count must open
  “Pleaded in the alternative to Count [previous count]” and may seek actual
  damages, fees, and costs only — never statutory or punitive damages.
- Pair § 1681i(a)(1)(A) with § 1681i(a)(5)(A) when the facts support a
  reinvestigation theory. Include § 1681i(a)(4) only when source facts support
  it. Do not use count condensation to merge willful and negligent theories.
- When the report is a Trans Union § 1681g disclosure, include a separate
  pre-count disclosure narrative and a § 1681g(a)(1) willful/negligent pair if
  adverse tradelines lack first-delinquency/removal information as supplied.
- The Prayer may cite only statutes used in a live count. Each count must
  incorporate factual paragraphs 1 through the computed final factual paragraph
  number, consistently across counts.

STANDING, EXHIBITS, AND SIGNATURE
- Plead Article III injury in this order when sourced: third-party
  dissemination, post-dispute dissemination, reputational harm, informational
  injury, time and effort, and emotional distress. Distinguish Regular hard
  inquiries from Promotional or Account Review inquiries. If a heading cannot
  be reliably classified, use an attorney-verification note.
- Do not plead an adverse credit action unless the supplied source specifically
  contains an adverse-action document.
- Cross-reference exhibits only when present: A file disclosure; B written
  dispute; B-1 proof of mailing; C online-dispute confirmation.
- Leave the date line blank: “____ day of ____________, 2026”. The signature
  block must include “Georgia Bar No. [______]”. Flag a 30039/30078 zip conflict
  if it appears in supplied data.
- Use “Trans Union, LLC” exactly and consistently if that defendant is present.

DRAFT — FOR ATTORNEY REVIEW BEFORE FILING.
"""


def load_reference_cases() -> str:
    """Read style references only; case facts must still come from supplied sources."""
    paths = [
        Path(__file__).resolve().parent.parent / "reference_cases",
        Path.cwd() / "reference_cases",
        Path.cwd() / "backend" / "reference_cases",
        Path("/app") / "reference_cases",
        Path("/app") / "backend" / "reference_cases",
    ]
    ref_dir = next((path for path in paths if path.exists() and any(path.glob("*.docx"))), None)
    if not ref_dir:
        return ""
    try:
        from docx import Document as DocxDocument
    except ImportError:
        return ""

    snippets: list[str] = []
    for filepath in sorted(path for path in ref_dir.glob("*.docx") if not path.name.startswith("~$"))[:3]:
        try:
            doc = DocxDocument(str(filepath))
            text = "\n".join(paragraph.text for paragraph in doc.paragraphs if paragraph.text.strip())
            snippets.append(f"--- STYLE REFERENCE: {filepath.name} ---\n{text[:1800]}")
        except Exception as exc:
            logger.warning("Could not read reference case %s: %s", filepath.name, exc)
    return "\n\n".join(snippets)


def _retrieve_rag_context(fact_sheet: dict, classification: dict, damages: dict) -> str:
    try:
        from utils.embeddings import is_configured
        from utils.rag_retrieval import format_retrieved_context, retrieve_relevant_chunks
    except Exception:
        return ""
    if not is_configured():
        return ""
    facts = fact_sheet.get("facts") or fact_sheet.get("narrative") or ""
    statutes = classification.get("statutes") or classification.get("violations") or []
    query = f"{facts}\n{statutes}".strip()
    if not query:
        return ""
    try:
        chunks = retrieve_relevant_chunks(query_text=query, top_k=6, document_type="complaint")
        return format_retrieved_context(chunks) if chunks else ""
    except Exception as exc:
        logger.warning("Complaint RAG retrieval failed: %s", exc)
        return ""


def _parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        newline = cleaned.find("\n")
        cleaned = cleaned[newline + 1:] if newline >= 0 else cleaned
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"complaint_text": text.strip()}


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


def _create_or_reopen_output(supabase, case_id: str, now: str) -> str:
    existing = (
        supabase.table("agent_outputs").select("id").eq("case_id", case_id)
        .eq("agent_name", AGENT_NAME).order("started_at", desc=True).limit(1).execute()
    )
    if existing.data:
        output_id = existing.data[0]["id"]
        _update_agent_output(supabase, output_id, status="running", started_at=now, error_message=None)
        return output_id
    inserted = supabase.table("agent_outputs").insert({
        "case_id": case_id, "agent_name": AGENT_NAME, "status": "running", "started_at": now,
    }).execute()
    return inserted.data[0]["id"]


def _draft_message(
    context: dict,
    classification: dict,
    research: dict,
    damages: dict,
    findings: list[dict],
    reference_context: str,
    rag_context: str,
    revision_notes: str | None,
    validator_issues: list[str] | None,
) -> str:
    requirements = "\n".join(f"- {issue}" for issue in (validator_issues or [])) or "None."
    return f"""Draft a complete source-grounded federal complaint.

REDACTED FACT SHEET:
{json.dumps(context['redacted_fact_sheet'], indent=2)}

CASE CLASSIFICATION:
{json.dumps(classification, indent=2)}

RESEARCH PACKET:
{json.dumps(research, indent=2)}

DAMAGES ANALYSIS:
{json.dumps(damages, indent=2)}

VENUE CONTEXT:
{json.dumps({key: context[key] for key in ('filing_state', 'report_state', 'venue_conflict', 'venue_note')}, indent=2)}

CREDIT-REPORT AUDIT FINDINGS:
{findings_for_prompt(findings)}

PRIOR REVISION NOTES:
{revision_notes or 'None.'}

HARD-VALIDATOR ISSUES FROM THE PRIOR ATTEMPT:
{requirements}

STYLE REFERENCES — use only for formatting tone, never as factual support:
{reference_context}

OPTIONAL RETRIEVED RESEARCH:
{rag_context}

Return the complete draft now. The final answer must be plain text and must obey every system rule."""


async def run(
    case_id: str,
    fact_sheet: dict,
    classification: dict,
    research: dict,
    damages: dict,
    revision_notes: str | None = None,
) -> dict:
    """Draft a complaint, retry deterministic validation failures, and never persist a failed draft."""
    supabase = get_supabase()
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc).isoformat()
    output_id = _create_or_reopen_output(supabase, case_id, now)

    try:
        drafting_context = build_drafting_context(fact_sheet or {}, classification or {})
        findings = audit_credit_report(fact_sheet or {})
        reference_context = load_reference_cases()
        rag_context = _retrieve_rag_context(drafting_context["redacted_fact_sheet"], classification or {}, damages or {})
        validator_issues: list[str] = []
        result: dict = {}

        for attempt in range(MAX_VALIDATION_REWRITES + 1):
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": _draft_message(
                    drafting_context, classification or {}, research or {}, damages or {}, findings,
                    reference_context, rag_context, revision_notes, validator_issues,
                )}],
            )
            raw_text = response.content[0].text
            result = _parse_json_response(raw_text)
            complaint_text = str(result.get("complaint_text") or raw_text).strip()
            try:
                assert_complaint_safe(complaint_text, context=drafting_context, findings=findings)
                result["complaint_text"] = complaint_text
                result["validation"] = {"approved": True, "attempt": attempt + 1, "findings": findings}
                break
            except ComplaintValidationError as exc:
                validator_issues = exc.issues
                logger.warning("Complaint draft validation failed for case %s (attempt %s): %s", case_id, attempt + 1, validator_issues)
        else:
            raise ComplaintValidationError(validator_issues)

        version_query = (
            supabase.table("complaints").select("version").eq("case_id", case_id)
            .order("version", desc=True).limit(1).execute()
        )
        next_version = (version_query.data[0]["version"] + 1) if version_query.data else 1
        if version_query.data:
            supabase.table("complaints").update({"is_current": False}).eq("case_id", case_id).execute()
        supabase.table("complaints").insert({
            "case_id": case_id, "complaint_text": result["complaint_text"],
            "version": next_version, "is_current": True,
        }).execute()

        _update_agent_output(
            supabase, output_id, status="complete", output_data=result,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info("Complaint drafter completed for case %s (version %d)", case_id, next_version)
        return result
    except Exception as exc:
        _update_agent_output(
            supabase, output_id, status="error", error_message=f"{type(exc).__name__}: {exc}",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.exception("Complaint drafter failed for case %s", case_id)
        raise
