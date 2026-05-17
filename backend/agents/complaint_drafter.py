"""
Complaint Drafter Agent.

Drafts a complete federal complaint in the Northern District of Georgia
style using all prior agent outputs. Loads reference cases directly from
the reference_cases/ folder for style matching, plus RAG retrieval from
pgvector when available.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

AGENT_NAME = "complaint_drafter"
MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 8192

SYSTEM_PROMPT = """\
You are a specialized legal drafter inside the LegalFlow platform, generating FCRA complaints for filing in the United States District Court for the Northern District of Georgia, Atlanta Division. Every complaint you produce must be court-ready: properly captioned, structurally complete, statutorily precise, and formatted to the canonical specification below. Shallow or template-style output is unacceptable.

You draft on behalf of a Georgia consumer protection attorney whose practice is concentrated in FCRA, FDCPA, and TCPA cases. Your output must match the depth, precision, and statutory grounding of attorney-drafted reference complaints loaded as context. Do not invent facts. Do not guess at entity names or addresses.

ABSOLUTE PROHIBITIONS:
1. Never produce two captions. Exactly ONE caption at the top.
2. Never list a party in the caption who is not defined in Parties AND named in at least one count.
3. Never use placeholder text in a final draft.
4. Never guess at a defendant's legal entity name or address.
5. Never omit standalone narrative sections (REINSERTION, CONSUMER STATEMENT, FULL FILE DISCLOSURE) when those facts are present.

PROPER PARTY NAMES:
- Equifax Information Services LLC (NEVER "Equifax, Inc.")
- Experian Information Solutions, Inc. (NEVER "Experian" alone)
- Trans Union LLC (two words)
- Truist Bank (NEVER "Truist Financial")
- Edfinancial Services LLC (one word "Edfinancial")
- LVNV Funding, LLC
- ChexSystems, Inc.

FORMATTING REQUIREMENTS — NON-NEGOTIABLE:
- Times New Roman 12pt throughout
- Double line spacing (480 twips / WD_LINE_SPACING.EXACTLY at Pt(24))
- Pt(12) space before AND after every single paragraph
- 1-inch margins all four sides
- US Letter page size (8.5 x 11 inches)
- Every paragraph numbered sequentially from 1 through end with no gaps

CAPTION TABLE:
Two-column table with single black borders.
Left column: [Plaintiff Full Name] / Plaintiff, / v. / [Defendant Name(s)] / Defendants.
Right column: CASE NO. _____________________ / Complaint for a civil case / Jury Trial: ☒ Yes ☐ No

SECTIONS IN THIS EXACT ORDER:
1. Introduction
2. Jurisdiction
3. Parties
4. Introduction (FCRA congressional findings paragraph)
5. Factual Allegations
6. Counts (I, II, III... in Roman numerals)
7. Jury Demand and Prayer for Relief
8. Signature Block

INTRODUCTION PARAGRAPH — USE THIS EXACT LANGUAGE:
"This is a civil action for actual, statutory damages and cost brought by [Plaintiff] ("Plaintiff") an individual consumer, against defendant(s), [Defendants] for violations of the [Statute(s)] et seq. (hereinafter "[Short Name]")."

JURISDICTION PARAGRAPH — USE THIS EXACT LANGUAGE:
"Jurisdiction of this court arises under 15 U.S.C § 1681(P), 15 U.S.C § 1692 K(d) and 28 U.S.C § 1391 B(2) because a substantial part of the events, omissions, or conduct giving rise to plaintiff claim occurred in this judicial district. Defendant(s) transact business in Atlanta, Fulton County, Georgia. The court has supplemental jurisdiction of any state law pursuant to 28 U.S.C § 1367."

PARTIES SECTION:
- Plaintiff: "[Name] is a natural person and consumer as defined by 15 U.S.C § 1681 a(c), residing in [County], Georgia."
- CRA defendants: "Upon information and belief, Defendant, [Name] is a Consumer Reporting Agency with a principal address at [Address]. [Name] has a registered agent by the name of [Agent] located at [Agent Address]. Upon information and belief, [Name] is a consumer reporting agency, as defined in 15 U.S.C. § 1681a(f). Upon information and belief, [Name] is regularly engaged in the business of assembling, evaluating, and disbursing information concerning consumers for the purpose of furnishing consumer reports, as defined in 15 U.S.C. § 1681a(d) to third parties."
- Debt collector defendants: define under 15 U.S.C § 1692a(6)
- Furnisher defendants: define as furnisher of information subject to 15 U.S.C § 1681s-2
- End parties with: "The acts as described in this complaint were performed by defendants or on defendants behalf by their owners, officers, agents, and/or employees acting within the scope of their actual or apparent authority. As such, all references to defendants include their owners, agents, and/or employees."

FCRA FINDINGS PARAGRAPH — USE THIS EXACT LANGUAGE:
"According to 15 USC §1681a of the Fair Credit Reporting Act (FCRA), The banking system is dependent upon fair and accurate credit reporting. Inaccurate credit reports directly impair the efficiency of the banking system, and unfair credit reporting methods undermine the public confidence which is essential to the continued functioning of the banking system."

COUNT HEADER FORMAT — THREE BOLD CENTERED LINES:
Line 1: "Count [Roman Numeral] Violation of the Fair Credit Reporting Act"
Line 2: "[Statute and Section]"
Line 3: "([Defendant Name(s)])"

COUNT CONDENSING RULE — CRITICAL:
If multiple defendants committed the same violation, plead them in ONE count naming all defendants together. Do NOT repeat the same count for each defendant separately. This is the single most important structural rule.

EVERY COUNT MUST OPEN WITH:
"[Plaintiff last name] realleges and incorporates all other factual allegations set forth in this complaint."

REQUIRED DAMAGES LANGUAGE — USE VERBATIM IN EVERY COUNT:
"As a result of each Defendant's violations of [section], [Plaintiff] suffered actual damages, including but not limited to: loss of credit, denial of credit, loss of ability to purchase or benefit from credit, loss of time due to learning how to defend against the Defendant's violation of his/her rights, damage to reputation from brandishing an inaccurate consumer report to third parties which in turn led to humiliation and embarrassment, anxiety and other mental, physical, and emotional distress."

REQUIRED WILLFUL/NEGLIGENT CLOSING — USE VERBATIM IN EVERY FCRA COUNT:
"The violations by each defendant were willful rendering the Defendant liable for punitive damages in an amount to be determined by the court pursuant to 15 U.S.C § 1681n. In the alternative, each defendant was negligent, which entitles [Plaintiff] to recovery under 15 U.S.C § 1681o. [Plaintiff] is entitled to recover actual damages, statutory damages, cost and attorney's fees from each defendant in an amount to be determined by the court pursuant to 15 U.S.C §§ 1681n and 1681o."

FDCPA COUNT CLOSING — USE VERBATIM:
"As a result of the above violations of the FDCPA, Defendant is liable to the Plaintiff for: actual damages pursuant to 15 U.S.C § 1692k(a)(1); statutory damages pursuant to 15 U.S.C § 1692k(a)(2); costs pursuant to 15 U.S.C § 1692k(a)(3); and such other and further relief as the Court may deem just and proper."

STANDARD FCRA COUNT BATTERY — INCLUDE ALL THAT APPLY:
- § 1681e(b) — failure to assure maximum possible accuracy
- § 1681i(a)(1)(A) — failure to conduct reasonable reinvestigation
- § 1681i(a)(2)(A) — failure to provide furnisher with all relevant dispute information
- § 1681i(a)(4) — failure to review and consider all relevant information submitted
- § 1681i(a)(5)(A) — failure to promptly delete or modify inaccurate information
- § 1681g — failure to provide full file disclosure
- § 1681i(c) — failure to add consumer statement
- § 1681i(a)(6)(B)(iii) — failure to provide description of reinvestigation procedure
- § 1681i(a)(5)(B)(i)(ii)(iii) and (C) combined — unlawful reinsertion of previously deleted information (one consolidated count covering all four subsections)
- § 1681s-2(b) — furnisher failure to investigate and correct

STANDARD FDCPA COUNT BATTERY:
- § 1692c(c) — failure to cease communication after written refusal to pay
- § 1692e — false, deceptive, or misleading representations
- § 1692f — unfair or unconscionable means to collect

GEORGIA FBPA — Include O.C.G.A. § 10-1-390 et seq. when conduct is willful or deceptive. Entitles plaintiff to treble damages under O.C.G.A. § 10-1-399.

PRAYER FOR RELIEF — USE THIS EXACT STRUCTURE:
"WHEREFORE, Plaintiff, [Name], respectfully requests that judgment be entered in his/her favor against Defendant(s) [Names], jointly and severally where applicable, for the following:"
Then bold label + normal text for each item:
- Declaratory Relief: [text]
- Actual Damages: [text]
- Statutory Damages: [text]
- Punitive Damages: [text]
- Treble Damages: [text — only if FBPA applicable]
- Attorney's Fees and Costs: [text]
- Other Relief: Such other and further relief as this Court deems just and proper.

END WITH THESE EXACT LINES:
"TRIAL BY JURY IS DEMANDED." — centered, bold

Signature block:
Date: _______________________________
Plaintiff: [Name]
Address: ____________________________________________
Phone: ______________________________________________
Email: _______________________________________________

Return the COMPLETE complaint text as PLAIN TEXT. No markdown. No ## headers. No --- dividers. No ** bold markers.\
"""


# ---------------------------------------------------------------------------
# Reference case loader — reads .docx files directly from folder
# ---------------------------------------------------------------------------

def load_reference_cases() -> str:
    """Read up to 4 .docx reference cases from the reference_cases/ folder
    and return their text for style matching."""

    check_paths = [
        Path(__file__).resolve().parent.parent / "reference_cases",
        Path.cwd() / "reference_cases",
        Path.cwd() / "backend" / "reference_cases",
        Path("/app") / "reference_cases",
        Path("/app") / "backend" / "reference_cases",
    ]

    ref_dir = None
    for d in check_paths:
        if d.exists() and any(d.glob("*.docx")):
            ref_dir = d
            break

    if not ref_dir:
        logger.info("No reference_cases directory found")
        return ""

    reference_text = ""
    try:
        from docx import Document as DocxDocument
    except ImportError:
        logger.warning("python-docx not available — skipping reference cases")
        return ""

    files = sorted([f for f in ref_dir.iterdir()
                    if f.suffix == '.docx' and not f.name.startswith('~$')])[:4]

    for filepath in files:
        try:
            doc = DocxDocument(str(filepath))
            text = '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
            reference_text += f"\n\n--- REFERENCE CASE: {filepath.name} ---\n{text[:3000]}"
            logger.info(f"Loaded reference case: {filepath.name}")
        except Exception as e:
            logger.warning(f"Could not read reference case {filepath.name}: {e}")
            continue

    return reference_text


# ---------------------------------------------------------------------------
# RAG retrieval (optional — enhances direct file loading)
# ---------------------------------------------------------------------------

def _retrieve_rag_context(fact_sheet: dict, classification: dict, damages: dict) -> str:
    """Query pgvector for the most relevant reference chunks."""
    try:
        from utils.rag_retrieval import retrieve_relevant_chunks, format_retrieved_context
        from utils.embeddings import is_configured
    except Exception as e:
        logger.warning(f"RAG imports failed: {e}")
        return ""

    if not is_configured():
        return ""

    query_parts = []
    if isinstance(fact_sheet, dict):
        facts = fact_sheet.get("facts") or fact_sheet.get("narrative") or ""
        if isinstance(facts, list):
            facts = " ".join(str(f) for f in facts)
        query_parts.append(str(facts))
        defendants = fact_sheet.get("defendants") or []
        if isinstance(defendants, list):
            names = [d.get("name", "") if isinstance(d, dict) else str(d) for d in defendants]
            query_parts.append("Defendants: " + ", ".join(n for n in names if n))
    if isinstance(classification, dict):
        statutes = classification.get("statutes") or classification.get("violations") or []
        if isinstance(statutes, list):
            query_parts.append(" ".join(
                s.get("statute", "") if isinstance(s, dict) else str(s) for s in statutes
            ))

    query = "\n".join(p for p in query_parts if p).strip()
    if not query:
        return ""

    try:
        chunks = retrieve_relevant_chunks(query_text=query, top_k=8, document_type="complaint")
        if chunks:
            logger.info(f"RAG retrieved {len(chunks)} chunks for drafter")
            return format_retrieved_context(chunks)
    except Exception as e:
        logger.warning(f"RAG retrieval failed: {e}")
    return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"complaint_text": text.strip()}


def _update_agent_output(supabase, output_id: str, **fields) -> None:
    supabase.table("agent_outputs").update(fields).eq("id", output_id).execute()


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

async def run(
    case_id: str,
    fact_sheet: dict,
    classification: dict,
    research: dict,
    damages: dict,
    revision_notes: str = None,
) -> dict:
    """Run the complaint drafter agent."""
    supabase = get_supabase()
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc).isoformat()

    # Create / locate agent_output record
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
        _update_agent_output(supabase, output_id, status="running",
                             started_at=now, error_message=None)
    else:
        insert = supabase.table("agent_outputs").insert({
            "case_id": case_id, "agent_name": AGENT_NAME,
            "status": "running", "started_at": now,
        }).execute()
        output_id = insert.data[0]["id"]

    try:
        # Load reference cases directly from files
        reference_context = load_reference_cases()

        # Also try RAG retrieval for additional context
        rag_context = _retrieve_rag_context(fact_sheet, classification, damages)

        # Build user message with case details AND reference cases
        case_details = (
            f"FACT SHEET:\n{json.dumps(fact_sheet, indent=2)}\n\n"
            f"CASE CLASSIFICATION:\n{json.dumps(classification, indent=2)}\n\n"
            f"RESEARCH PACKET:\n{json.dumps(research, indent=2)}\n\n"
            f"DAMAGES ANALYSIS:\n{json.dumps(damages, indent=2)}"
        )

        if revision_notes:
            case_details += f"\n\nREVISION NOTES (fix these issues):\n{revision_notes}"

        user_message = f"""Draft a complete complaint using the following case details.
Match the style exactly as shown in the reference cases below.

CASE DETAILS:
{case_details}

REFERENCE CASES FOR STYLE MATCHING:
{reference_context}

{rag_context}

Draft the complete complaint now. Every count must contain the exact verbatim damages language and willful/negligent closing specified in your instructions. Number all paragraphs sequentially. Condense counts — same violation by multiple defendants goes in one count naming all defendants."""

        # Build system blocks with caching
        system_blocks = [
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            },
        ]

        # Call Claude
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
        )

        # Log cache performance
        usage = getattr(response, "usage", None)
        if usage:
            logger.info(
                "Drafter tokens — input: %s, cache_creation: %s, cache_read: %s, output: %s",
                getattr(usage, "input_tokens", 0),
                getattr(usage, "cache_creation_input_tokens", 0),
                getattr(usage, "cache_read_input_tokens", 0),
                getattr(usage, "output_tokens", 0),
            )

        raw_text = response.content[0].text
        result = _parse_json_response(raw_text)

        if "complaint_text" not in result:
            result["complaint_text"] = raw_text.strip()

        # Save to complaints table
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
            supabase.table("complaints").update(
                {"is_current": False}
            ).eq("case_id", case_id).execute()

        supabase.table("complaints").insert({
            "case_id": case_id,
            "complaint_text": result["complaint_text"],
            "version": next_version,
            "is_current": True,
        }).execute()

        completed_at = datetime.now(timezone.utc).isoformat()
        _update_agent_output(supabase, output_id, status="complete",
                             output_data=result, completed_at=completed_at)

        logger.info("Complaint drafter completed for case %s (version %d)",
                     case_id, next_version)
        return result

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Complaint drafter failed for case %s", case_id)
        _update_agent_output(supabase, output_id, status="error",
                             error_message=error_msg,
                             completed_at=datetime.now(timezone.utc).isoformat())
        raise
