"""
Fast Drafter — 2-call pipeline that produces a complete complaint in ~15 seconds.

Call 1 (Haiku): Analyze facts → extract structured data (plaintiff, defendants,
statutes, violations, damages, count structure) in one pass.

Call 2 (Sonnet): Draft the full complaint using the structured analysis +
RAG reference chunks + prompt caching.

This replaces the 6-agent sequential pipeline for most use cases.
The thorough 7-agent pipeline is still available for complex cases.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

ANALYSIS_MODEL = "claude-haiku-4-5"
DRAFTING_MODEL = "claude-haiku-4-5"  # Haiku for speed (~8s); revision chat uses Sonnet for polish

# ---------------------------------------------------------------------------
# Call 1 — Analysis (Haiku)
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """You are a consumer protection law analyst specializing in FCRA, FDCPA, and TCPA cases filed in the Northern District of Georgia.

CRITICAL — USE ONLY THESE STATUTES FOR COUNTS:

FOR CRA DEFENDANTS (Equifax, Experian, TransUnion, Chex Systems):
- 15 U.S.C. § 1681e(b) — failure to follow reasonable procedures for maximum accuracy
- 15 U.S.C. § 1681i(a)(1)(A) — failure to conduct reasonable reinvestigation after dispute
- 15 U.S.C. § 1681i(a)(2)(A) — failure to forward all relevant dispute info to furnisher
- 15 U.S.C. § 1681i(a)(4) — failure to review all relevant information submitted by consumer
- 15 U.S.C. § 1681i(a)(5)(A) — failure to promptly delete inaccurate information after reinvestigation
- 15 U.S.C. § 1681i(a)(5)(B)(i)(ii)(iii) and (C) — reinsertion of deleted info without certification, notice, or procedures (ONLY when CRA reinserted previously deleted info)
- 15 U.S.C. § 1681g — failure to provide full file disclosure (ONLY if consumer requested file and was denied)
- 15 U.S.C. § 1681i(c) — failure to add consumer statement (ONLY if consumer asked to add statement)

FOR FURNISHER DEFENDANTS (ED Financial, Truist, debt servicers):
- 15 U.S.C. § 1681s-2(b) — failure to investigate after receiving notice of dispute from CRA
  (NEVER use §1681s-2(a) — there is no private right of action under (a))

FOR DEBT COLLECTOR DEFENDANTS (Midland, LVNV, Portfolio Recovery):
- 15 U.S.C. § 1692c(c) — failure to cease communication after written request
- 15 U.S.C. § 1692e — false, deceptive, or misleading representations
- 15 U.S.C. § 1692f — unfair practices
- 15 U.S.C. § 1692g — failure to validate debt

FOR TCPA:
- 47 U.S.C. § 227(b)(1)(A)(iii) — autodialer calls to cell phone
- 47 U.S.C. § 227(b)(1)(B) — prerecorded message calls
- 47 U.S.C. § 227(c) — do-not-call violations

GEORGIA STATE:
- O.C.G.A. § 10-1-390 et seq. — Georgia Fair Business Practices Act (ONLY when conduct is willful or deceptive)
  (NEVER cite O.C.G.A. § 34-6-2 — that is a different statute)

CONDENSED COUNTS: If multiple defendants committed the same violation, combine them into ONE count.
Example: §1681e(b) violated by Equifax, Experian, and TransUnion = ONE count naming all three.

Analyze the case facts below and return a SINGLE JSON object with this structure:

{
  "plaintiff": {
    "name": "full legal name",
    "county": "county of residence",
    "state": "Georgia"
  },
  "defendants": [
    {
      "name": "full legal name",
      "entity_type": "CRA or Debt Collector or Furnisher",
      "address": "principal address",
      "registered_agent": "GA registered agent",
      "role_description": "what they did wrong"
    }
  ],
  "court": "recommended court with full name",
  "statutes_violated": [
    {
      "statute": "exact statute from the list above",
      "short_name": "e.g. FCRA §1681e(b)",
      "violation": "what the defendant did",
      "defendants": ["which defendants violated this"],
      "willful": true
    }
  ],
  "count_structure": [
    {
      "count_number": "I",
      "title": "Violation of the Fair Credit Reporting Act",
      "statute": "15 U.S.C. § 1681e(b)",
      "defendants": ["Equifax", "Experian", "TransUnion"],
      "willful": true
    }
  ],
  "factual_allegations": [
    "numbered factual statements in chronological order"
  ],
  "damages": {
    "actual": ["list of actual damages"],
    "statutory": "statutory damages description",
    "punitive": "punitive damages if willful",
    "attorney_fees": true,
    "ga_fbpa_treble": true
  },
  "key_dates": [
    {"date": "description", "event": "what happened"}
  ],
  "jury_demand": true
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation. Use ONLY statutes from the list above — never invent or guess statute numbers."""

# ---------------------------------------------------------------------------
# Call 2 — Drafting
# ---------------------------------------------------------------------------

DRAFTING_PROMPT = """\
You are a legal complaint drafter trained on actual filed FCRA, FDCPA, and TCPA cases in the Northern District of Georgia. You produce complaints that exactly match the style of successfully filed cases in that district.

CRITICAL RULES — FOLLOW EXACTLY:

1. OUTPUT FORMAT: Return PLAIN TEXT only. NO markdown. NO ## headers. NO ### headers. NO --- dividers. NO ** bold markers. NO bullet points with dashes. Just plain legal document text.

2. CONDENSED COUNTS: If multiple defendants committed the same violation, put them in ONE count. Example: "Count I — Violation of 15 U.S.C. § 1681e(b) (Equifax, Experian, and TransUnion)" — NOT separate counts per defendant.

3. COUNT HEADER FORMAT — exactly three centered lines:
Count [Roman Numeral]
Violation of the Fair Credit Reporting Act
15 U.S.C. § [section] ([Defendant Names])

4. CORRECT STATUTES — only use these sections for counts:
   - §1681e(b) — failure to follow reasonable procedures for maximum accuracy (CRAs)
   - §1681i(a)(1)(A) — failure to conduct reasonable reinvestigation (CRAs)
   - §1681i(a)(2)(A) — failure to forward relevant information to furnisher (CRAs)
   - §1681i(a)(4) — failure to review all relevant information in dispute (CRAs)
   - §1681i(a)(5)(A) — failure to promptly delete inaccurate information (CRAs)
   - §1681i(a)(5)(B)(i)(ii)(iii) and (C) — reinsertion without certification, notice, or procedures (specific CRA that reinserted)
   - §1681g — failure to provide full file disclosure (CRAs, if applicable)
   - §1681i(c) — failure to add consumer statement (CRAs, if applicable)
   - §1681i(a)(6)(B)(iii) — failure to provide reinvestigation procedure description (CRAs, if applicable)
   - §1681s-2(b) — furnisher failure to investigate after notice from CRA (furnishers ONLY, NOT §1681s-2(a))
   - Georgia FBPA: O.C.G.A. § 10-1-390 et seq. (NOT § 34-6-2)
   NEVER cite §1681e(d), §1681s-2(a) for a private count, or §1681i(a)(1)(B).

5. PARTIES SECTION — for each CRA defendant, write THREE paragraphs:
   Paragraph 1: "Upon information and belief, Defendant [Name] is a Consumer Reporting Agency with a principal address at [address]. [Name] has a registered agent by the name of [agent] located at [agent address]."
   Paragraph 2: "Upon information and belief, [Name] is a consumer reporting agency, as defined in 15 U.S.C. § 1681a(f). Upon information and belief, [Name] is regularly engaged in the business of assembling, evaluating, and disbursing information concerning consumers for the purpose of furnishing consumer reports, as defined in 15 U.S.C. § 1681a(d) to third parties."
   Paragraph 3: "Upon information and belief, [Name] disburses such consumer reports to third parties under contract for monetary compensation, furnishing consumer reports, as defined in 15 U.S.C. § 1681a(d) to third parties."
   For furnisher defendants: "Upon information and belief, [Name] is a furnisher of information subject to the duties and obligations imposed by 15 U.S.C. § 1681s-2."
   For debt collectors: define under §1692a(6).

6. EACH COUNT must contain:
   a) Realleges paragraph: "[Plaintiff] realleges and incorporates all other factual allegations set forth in this complaint."
   b) Violation facts specific to that statute
   c) EXACT damages language: "As a result of each Defendant's violations of [section], [Plaintiff] suffered actual damages, including but not limited to: loss of credit, denial of credit, loss of ability to purchase or benefit from credit, loss of time due to learning how to defend against the Defendant's violation of his/her rights, damage to reputation from brandishing an inaccurate consumer report to third parties which in turn led to humiliation and embarrassment, anxiety and other mental, physical, and emotional distress."
   d) EXACT willful/negligent closing: "The violations by each defendant were willful rendering the Defendant liable for punitive damages in an amount to be determined by the court pursuant to 15 U.S.C § 1681n. In the alternative, each defendant was negligent, which entitles [Plaintiff] to recovery under 15 U.S.C § 1681o. [Plaintiff] is entitled to recover actual damages, statutory damages, cost and attorney's fees from each defendant in an amount to be determined by the court pursuant to 15 U.S.C §§ 1681n and 1681o."

7. DOCUMENT STRUCTURE — sections in this exact order:
   - Introduction (no section number, no header — just the opening paragraph)
   - Jurisdiction
   - Parties
   - Introduction / FCRA Findings (the "banking system" paragraph)
   - Factual Allegations
   - Counts (each with Roman numeral)
   - Prayer for Relief (WHEREFORE paragraph + labeled relief items)
   - TRIAL BY JURY IS DEMANDED (centered, one line)
   - Signature block (Date blank, Plaintiff name, address, phone, email)
   DO NOT include: Certification section, Injunctive Relief as separate item, section numbers like "I." "II." "III." before section names.

8. PARAGRAPH NUMBERING: Number ALL paragraphs sequentially 1 through end. Every paragraph gets a number — introduction, jurisdiction, parties, facts, counts, everything.

9. PRAYER FOR RELIEF format:
   "Declaratory Relief: A declaration that each Defendant violated..."
   "Actual Damages: Compensation for..."
   "Statutory Damages: Statutory damages against each Defendant pursuant to 15 U.S.C. § 1681n(a)(1)(A) in an amount not less than $100 and not more than $1,000 per violation..."
   "Punitive Damages: Punitive damages against each Defendant for willful noncompliance pursuant to 15 U.S.C. § 1681n(a)(2)..."
   "Attorney's Fees and Costs: Reasonable attorney's fees and costs pursuant to 15 U.S.C. §§ 1681n(a)(3) and 1681o(a)(2)."
   "Other Relief: Such other and further relief as this Court deems just and proper."
   Include "Treble Damages" under O.C.G.A. § 10-1-399 ONLY if GA FBPA count is included.

10. Use the plaintiff's last name with honorific in counts: "Mr. [Last Name]" or "Ms. [Last Name]" — not just "Plaintiff."

Return the COMPLETE complaint text as plain text. Do not truncate. Do not use markdown formatting.\
"""


# ---------------------------------------------------------------------------
# Motion Drafting Prompt
# ---------------------------------------------------------------------------

MOTION_PROMPT = """\
You are a legal motion drafter specializing in consumer protection litigation in the Northern District of Georgia. Draft the complete motion using proper federal court formatting.

OUTPUT FORMAT: Plain text only. No markdown. No ## headers. No --- dividers.

FORMATTING: Times New Roman 12pt, double-spaced, 1-inch margins, US Letter.

SUPPORTED MOTION TYPES — draft whichever the attorney specifies:
- Motion to Compel Discovery
- Motion for Summary Judgment
- Motion to Dismiss (response)
- Motion for Default Judgment
- Motion to Strike
- Motion in Limine
- Motion for Sanctions
- Opposition/Response to any motion

MOTION STRUCTURE:
1. Caption (same format as complaints — two-column table)
2. Title of Motion — centered, bold (e.g. "PLAINTIFF'S MOTION TO COMPEL DISCOVERY")
3. Introduction — brief statement of what is being requested and why
4. Statement of Facts — relevant factual background
5. Legal Standard — applicable legal standards for the motion type
6. Argument — detailed legal argument with statutory citations and case law
   - Use Roman numeral sections (I, II, III) for major arguments
   - Use letter sub-sections (A, B, C) for sub-arguments
7. Conclusion — specific relief requested
8. Certificate of Conference (if required — state whether parties conferred)
9. Signature block
10. Certificate of Service

STATUTORY REFERENCES for consumer protection motions:
- FCRA: 15 U.S.C. § 1681 et seq.
- FDCPA: 15 U.S.C. § 1692 et seq.
- Federal Rules of Civil Procedure (cite specific rules)
- Local Rules for N.D. Georgia where applicable

Number all paragraphs sequentially. Return the COMPLETE motion text.\
"""

# ---------------------------------------------------------------------------
# Discovery Drafting Prompt
# ---------------------------------------------------------------------------

DISCOVERY_PROMPT = """\
You are a consumer protection discovery specialist drafting discovery requests for FCRA, FDCPA, and TCPA cases in the Northern District of Georgia. You produce discovery documents that are thorough, strategically targeted, and designed to build the strongest possible case.

OUTPUT FORMAT: Plain text only. No markdown. No ## headers. No --- dividers. No ** bold markers.

FORMATTING: Times New Roman 12pt, double-spaced, 1-inch margins, US Letter.

DETERMINE THE DISCOVERY TYPE from the attorney's instructions and draft accordingly.

=== DOCUMENT STRUCTURE (ALL DISCOVERY TYPES) ===

CAPTION:
Same two-column table format as complaints.
Left: [Plaintiff] / Plaintiff, / v. / [Defendant(s)] / Defendants.
Right: CASE NO. [if provided or blank] / [Discovery Type Title]

TITLE — centered, bold, all caps. Examples:
- "PLAINTIFF'S FIRST SET OF INTERROGATORIES TO DEFENDANT [NAME]"
- "PLAINTIFF'S FIRST REQUESTS FOR PRODUCTION OF DOCUMENTS TO DEFENDANT [NAME]"
- "PLAINTIFF'S FIRST REQUESTS FOR ADMISSION TO DEFENDANT [NAME]"

=== INSTRUCTIONS AND DEFINITIONS (include in every discovery document) ===

DEFINITIONS:
1. "You" and "Your" refer to [Defendant Name] and its agents, employees, officers, directors, predecessors, successors, subsidiaries, affiliates, and any person or entity acting on its behalf.
2. "Documents" means all written, printed, typed, or electronically stored information as defined in Federal Rule of Civil Procedure 34(a), including but not limited to: letters, memoranda, emails, text messages, notes, reports, records, logs, charts, spreadsheets, databases, policies, procedures, manuals, training materials, screen prints, system notes, audio recordings, and metadata.
3. "Communications" means any exchange of information, whether oral, written, or electronic, including but not limited to telephone calls, voicemails, emails, text messages, letters, faxes, chat messages, and internal notes or memoranda.
4. "Identify" when used with respect to a person means to state the person's full name, title, employer, business address, telephone number, and their relationship to the subject matter.
5. "Identify" when used with respect to a document means to state the date, author, recipient, subject matter, and current location or custodian.
6. "Relate to" or "Relating to" means concerning, referring to, reflecting, describing, evidencing, constituting, or being in any way legally relevant to.
7. "Consumer Report" has the meaning defined in 15 U.S.C. § 1681a(d).
8. "Consumer Reporting Agency" or "CRA" has the meaning defined in 15 U.S.C. § 1681a(f).

INSTRUCTIONS:
1. These requests are continuing in nature pursuant to Federal Rule of Civil Procedure 26(e). You are required to supplement your responses if you obtain additional information.
2. If you object to any request, state the specific grounds for objection and respond to the extent the request is not objectionable.
3. If any document is withheld on the basis of privilege, provide a privilege log identifying: the date, author, recipient(s), subject matter, and the specific privilege claimed.
4. The time period covered by these requests is [relevant period based on facts] unless otherwise specified.
5. These requests are served pursuant to Federal Rules of Civil Procedure Rules 26, 33, 34, and 36 as applicable, and the Local Rules of the United States District Court for the Northern District of Georgia.

=== FOR INTERROGATORIES (Fed. R. Civ. P. 33) ===

Draft interrogatories specific to the case type. Include ALL that are relevant:

FCRA INTERROGATORIES (for CRA defendants):
1. Identify every person who participated in any reinvestigation of Plaintiff's dispute(s).
2. Describe in detail the procedures followed during each reinvestigation of Plaintiff's dispute(s), including what steps were taken, what information was reviewed, and what systems were accessed.
3. Identify every document reviewed during the reinvestigation of Plaintiff's dispute(s).
4. State whether you contacted the furnisher of the disputed information during reinvestigation, and if so, identify the furnisher, the date of contact, the method of contact, and the substance of the communication.
5. Describe your standard procedures for ensuring the maximum possible accuracy of consumer reports as required by 15 U.S.C. § 1681e(b).
6. Identify all third parties to whom you provided Plaintiff's consumer report during the period [date range].
7. State the basis upon which you verified the disputed information as accurate after receiving Plaintiff's dispute.
8. Describe your procedures for handling consumer disputes, including the training provided to employees who process disputes.
9. Identify all versions of Plaintiff's consumer report in your possession from [date range].
10. State whether any information on Plaintiff's consumer report was deleted and subsequently reinserted, and if so, describe the circumstances of reinsertion.
11. Describe your procedures for providing written notice to consumers when previously deleted information is reinserted pursuant to 15 U.S.C. § 1681i(a)(5)(B).
12. Identify your Metro 2 data format records for Plaintiff's account(s) for the period [date range].

FCRA INTERROGATORIES (for Furnisher defendants):
1. Identify every person who participated in any investigation of Plaintiff's dispute(s) after receiving notice from a CRA pursuant to 15 U.S.C. § 1681s-2(b).
2. Describe in detail the investigation conducted after receiving notice of Plaintiff's dispute from [CRA name].
3. State the results of your investigation and the information reported back to each CRA.
4. Identify all documents reviewed during your investigation of Plaintiff's dispute.
5. Describe your policies and procedures for investigating consumer disputes received from CRAs.
6. State whether you determined the disputed information was inaccurate, incomplete, or unverifiable, and if so, what actions you took.

FDCPA INTERROGATORIES (for Debt Collector defendants):
1. State the original creditor, original amount, and date of the debt you attempted to collect from Plaintiff.
2. Identify every communication (written, oral, or electronic) between you and Plaintiff regarding the alleged debt.
3. Describe your procedures for validating debts upon request from consumers.
4. State whether you received a written request from Plaintiff to cease communications, and if so, the date received.
5. Identify all persons who communicated with Plaintiff regarding the alleged debt.

=== FOR REQUESTS FOR PRODUCTION (Fed. R. Civ. P. 34) ===

FCRA RFPs (for CRA defendants):
1. All consumer reports relating to Plaintiff generated during [date range].
2. All dispute correspondence received from Plaintiff, including dispute letters, online disputes, and telephone dispute records.
3. All documents relating to the reinvestigation of Plaintiff's dispute(s), including internal notes, system records, ACDV forms, e-OSCAR records, and communications with furnishers.
4. All Metro 2 data and trade line information for Plaintiff's account(s) received from furnishers during [date range].
5. All e-OSCAR communications between you and any furnisher regarding Plaintiff's account(s).
6. Your written policies and procedures for: (a) ensuring maximum possible accuracy of consumer reports, (b) processing consumer disputes, (c) conducting reinvestigations, (d) reinserting previously deleted information.
7. All training materials provided to employees who process consumer disputes.
8. All documents relating to your decision to verify the disputed information as accurate.
9. All records of third parties who obtained Plaintiff's consumer report during [date range], including subscriber codes and inquiry records.
10. All internal screen prints, system notes, and audit trails relating to Plaintiff's consumer file.

FCRA RFPs (for Furnisher defendants):
1. All records relating to Plaintiff's account, including account history, payment records, and status codes.
2. All communications with any CRA regarding Plaintiff's account, including ACDV responses and Metro 2 reports.
3. All documents relating to your investigation of Plaintiff's dispute(s).
4. Your policies and procedures for reporting consumer information to CRAs.
5. Your policies and procedures for investigating disputes received from CRAs under 15 U.S.C. § 1681s-2(b).

=== FOR REQUESTS FOR ADMISSION (Fed. R. Civ. P. 36) ===

FCRA RFAs:
1. Admit that Plaintiff submitted a dispute to you regarding [specific account/information] on or about [date].
2. Admit that you received Plaintiff's dispute regarding [specific information].
3. Admit that the [specific information] reported on Plaintiff's consumer report was inaccurate.
4. Admit that you verified the disputed information as accurate after receiving Plaintiff's dispute.
5. Admit that you failed to delete or modify the disputed information after receiving Plaintiff's dispute and supporting documentation.
6. Admit that you failed to provide Plaintiff with written notice of the results of your reinvestigation within five (5) business days of completion.
7. Admit that you furnished Plaintiff's consumer report to [third party] on or about [date].
8. Admit that you are a "consumer reporting agency" as defined in 15 U.S.C. § 1681a(f).
9. Admit that you previously deleted [specific information] from Plaintiff's consumer report and subsequently reinserted it.
10. Admit that you failed to provide Plaintiff with prior written notice before reinserting previously deleted information.

SIGNATURE BLOCK:
Respectfully submitted,
[blank date line]
[Plaintiff name]
[Address]
[Phone]
[Email]

CERTIFICATE OF SERVICE:
"I hereby certify that on this ___ day of _________, 20__, a true and correct copy of the foregoing was served upon all counsel of record via [electronic service/U.S. Mail]."
[Signature line]

Number ALL requests sequentially. Tailor every request to the specific facts provided by the attorney. Do not include generic requests — make each one specific to the case.\
"""

# ---------------------------------------------------------------------------
# Demand Letter Prompt
# ---------------------------------------------------------------------------

DEMAND_LETTER_PROMPT = """\
You are a consumer protection attorney drafting a pre-litigation demand letter. Draft the complete letter in professional legal format.

OUTPUT FORMAT: Plain text only. No markdown.

LETTER STRUCTURE:
1. Attorney/Firm letterhead block (name, address, phone, email, bar number)
2. Date
3. Recipient's name and address
4. RE: [Client name] — [Account/Reference number] — [Brief description]
5. "VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED" (centered)
6. Salutation: "Dear [Name/General Counsel/To Whom It May Concern]:"
7. Opening paragraph — identify the client, the violation, and the law
8. Factual background — chronological summary of what happened
9. Legal violations — specific statutes violated with citations
10. Demand — specific actions required and deadline (usually 30 days)
11. Settlement offer (if applicable)
12. Warning of litigation if demand not met
13. Closing: "Sincerely," + signature block

TONE: Professional but firm. Clearly state the violations and consequences.

Include specific statutory references (FCRA, FDCPA, TCPA as applicable).
State the damages the client has suffered.
Set a reasonable deadline for response (typically 30 days).

Return the COMPLETE letter text.\
"""

# ---------------------------------------------------------------------------
# Prompt selector
# ---------------------------------------------------------------------------

DOCUMENT_PROMPTS = {
    "complaint": DRAFTING_PROMPT,
    "motion": MOTION_PROMPT,
    "discovery": DISCOVERY_PROMPT,
    "demand_letter": DEMAND_LETTER_PROMPT,
}

DOCUMENT_LABELS = {
    "complaint": "Complaint",
    "motion": "Motion",
    "discovery": "Discovery",
    "demand_letter": "Demand Letter",
}

# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------


async def run_fast_draft(case_id: str, case_facts: str, damages_description: str, document_type: str = "complaint") -> dict:
    """Run the fast 2-call pipeline.

    Returns dict with complaint_text, analysis, and timing info.
    """
    supabase = get_supabase()
    client = anthropic.Anthropic()
    timings = {}

    try:
        # ── Update case status ──────────────────────────────────────────
        supabase.table("cases").update({
            "status": "agents_processing",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", case_id).execute()

        # Create agent_output records for UI tracking
        for agent_name, display_status in [
            ("intake_analyst", "running"),
            ("case_classifier", "running"),
            ("legal_researcher", "running"),
            ("damages_analyst", "running"),
        ]:
            try:
                supabase.table("agent_outputs").insert({
                    "case_id": case_id,
                    "agent_name": agent_name,
                    "status": display_status,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
            except Exception:
                pass

        # ── Read uploaded documents ─────────────────────────────────────
        document_text = ""
        try:
            docs_resp = (
                supabase.table("case_documents")
                .select("file_name, file_type, storage_path")
                .eq("case_id", case_id)
                .execute()
            )
            if docs_resp.data:
                from utils.document_reader import read_document
                doc_parts = []
                for doc in docs_resp.data:
                    try:
                        text = read_document(doc["storage_path"], doc.get("file_type", "txt"))
                        if text:
                            if len(text) > 6000:
                                text = text[:6000] + "\n[...document truncated]"
                            doc_parts.append(f"\n--- DOCUMENT: {doc['file_name']} ---\n{text}")
                            logger.info(f"[fast_draft] Read document: {doc['file_name']} ({len(text)} chars)")
                    except Exception as e:
                        logger.warning(f"[fast_draft] Could not read {doc['file_name']}: {e}")
                if doc_parts:
                    document_text = "\n\nUPLOADED DOCUMENTS (read and analyze these):\n" + "\n".join(doc_parts)
        except Exception as e:
            logger.warning(f"[fast_draft] Could not load documents: {e}")

        # ── CALL 1: Analysis (Haiku) ────────────────────────────────────
        t1_start = datetime.now(timezone.utc)
        logger.info(f"[fast_draft] Call 1 (analysis) starting for case {case_id}")

        analysis_response = client.messages.create(
            model=ANALYSIS_MODEL,
            max_tokens=4096,
            system=ANALYSIS_PROMPT,
            messages=[{
                "role": "user",
                "content": f"CASE FACTS:\n{case_facts}\n\nDAMAGES:\n{damages_description}{document_text}",
            }],
        )

        analysis_text = analysis_response.content[0].text
        t1_end = datetime.now(timezone.utc)
        timings["analysis_seconds"] = round((t1_end - t1_start).total_seconds(), 1)
        logger.info(f"[fast_draft] Call 1 done in {timings['analysis_seconds']}s")

        # Parse analysis JSON
        from utils.json_parser import parse_agent_json
        analysis = parse_agent_json(analysis_text, agent_name="fast_analysis")

        # Mark analysis agents as complete
        for agent_name in ["intake_analyst", "case_classifier", "legal_researcher", "damages_analyst"]:
            try:
                supabase.table("agent_outputs").update({
                    "status": "complete",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "output_data": analysis if agent_name == "intake_analyst" else {"see": "intake_analyst"},
                }).eq("case_id", case_id).eq("agent_name", agent_name).execute()
            except Exception:
                pass

        # Create drafter agent_output
        try:
            supabase.table("agent_outputs").insert({
                "case_id": case_id,
                "agent_name": "complaint_drafter",
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass

        # ── CALL 2: Drafting (Sonnet) ───────────────────────────────────
        t2_start = datetime.now(timezone.utc)
        logger.info(f"[fast_draft] Call 2 (drafting) starting for case {case_id}")

        # Get RAG reference context if available
        reference_context = ""
        try:
            from utils.rag_retrieval import retrieve_relevant_chunks, format_retrieved_context
            from utils.embeddings import is_configured
            if is_configured():
                chunks = retrieve_relevant_chunks(case_facts, top_k=8, document_type="complaint")
                if chunks:
                    reference_context = format_retrieved_context(chunks)
                    logger.info(f"[fast_draft] RAG retrieved {len(chunks)} chunks")
        except Exception as e:
            logger.warning(f"[fast_draft] RAG retrieval failed: {e}")

        # Select the appropriate drafting prompt based on document type
        selected_prompt = DOCUMENT_PROMPTS.get(document_type, DRAFTING_PROMPT)
        doc_label = DOCUMENT_LABELS.get(document_type, "Complaint")
        logger.info(f"[fast_draft] Document type: {document_type} ({doc_label})")

        # Build system prompt with caching
        system_blocks = [
            {
                "type": "text",
                "text": selected_prompt,
                "cache_control": {"type": "ephemeral"},
            },
        ]
        if reference_context:
            system_blocks.append({
                "type": "text",
                "text": reference_context,
            })

        draft_response = client.messages.create(
            model=DRAFTING_MODEL,
            max_tokens=8192,
            system=system_blocks,
            messages=[{
                "role": "user",
                "content": (
                    "Draft a complete federal complaint using this case analysis:\n\n"
                    f"{json.dumps(analysis, indent=2)}\n\n"
                    f"ORIGINAL CASE FACTS:\n{case_facts}\n\n"
                    f"DAMAGES:\n{damages_description}"
                ),
            }],
        )

        complaint_text = draft_response.content[0].text
        t2_end = datetime.now(timezone.utc)
        timings["drafting_seconds"] = round((t2_end - t2_start).total_seconds(), 1)
        timings["total_seconds"] = round((t2_end - t1_start).total_seconds(), 1)
        logger.info(
            f"[fast_draft] Call 2 done in {timings['drafting_seconds']}s "
            f"(total: {timings['total_seconds']}s)"
        )

        # Log token usage
        usage = getattr(draft_response, "usage", None)
        if usage:
            logger.info(
                "[fast_draft] Drafter tokens — input: %s, cache_creation: %s, "
                "cache_read: %s, output: %s",
                getattr(usage, "input_tokens", 0),
                getattr(usage, "cache_creation_input_tokens", 0),
                getattr(usage, "cache_read_input_tokens", 0),
                getattr(usage, "output_tokens", 0),
            )

        # Mark drafter as complete
        try:
            supabase.table("agent_outputs").update({
                "status": "complete",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "output_data": {"complaint_text": complaint_text[:500] + "..."},
            }).eq("case_id", case_id).eq("agent_name", "complaint_drafter").execute()
        except Exception:
            pass

        # Mark QA as complete (skipped in fast mode)
        try:
            supabase.table("agent_outputs").insert({
                "case_id": case_id,
                "agent_name": "qa_reviewer",
                "status": "complete",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "output_data": {"mode": "fast_draft", "qa_skipped": True},
            }).execute()
        except Exception:
            pass

        # ── Save complaint to database ──────────────────────────────────
        # Check existing version
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
            "complaint_text": complaint_text,
            "version": next_version,
            "is_current": True,
        }).execute()

        # Update case status to draft_ready
        supabase.table("cases").update({
            "status": "draft_ready",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", case_id).execute()

        logger.info(f"[fast_draft] Complete for case {case_id} in {timings['total_seconds']}s")

        return {
            "complaint_text": complaint_text,
            "analysis": analysis,
            "timings": timings,
            "mode": "fast",
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception(f"[fast_draft] Failed for case {case_id}")

        try:
            supabase.table("cases").update({
                "status": "error",
                "revision_notes": f"PIPELINE ERROR: {error_msg}",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", case_id).execute()
        except Exception:
            pass

        raise
