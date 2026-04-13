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
DRAFTING_MODEL = "claude-sonnet-4-5"

# ---------------------------------------------------------------------------
# Call 1 — Analysis (Haiku)
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """You are a consumer protection law analyst. Analyze the case facts below and return a SINGLE JSON object with this exact structure. Be thorough but concise.

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
      "statute": "e.g. 15 U.S.C. § 1681e(b)",
      "short_name": "e.g. FCRA §1681e(b)",
      "violation": "what the defendant did",
      "defendants": ["which defendants violated this"],
      "willful": true or false
    }
  ],
  "count_structure": [
    {
      "count_number": "I",
      "title": "Violation of FCRA 15 U.S.C. § 1681e(b)",
      "statute": "15 U.S.C. § 1681e(b)",
      "defendants": ["Equifax", "Experian"],
      "elements": ["what must be proved"],
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
    "ga_fbpa_treble": true or false
  },
  "key_dates": [
    {"date": "YYYY-MM-DD or description", "event": "what happened"}
  ],
  "jury_demand": true
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation, no text before or after the JSON."""

# ---------------------------------------------------------------------------
# Call 2 — Drafting (Sonnet)
# ---------------------------------------------------------------------------

DRAFTING_PROMPT = (
    "You are a legal complaint drafter specializing in consumer protection law "
    "in the Northern District of Georgia. You draft complaints that exactly "
    "match the style of successfully filed cases in that district.\n\n"

    "You will receive a structured case analysis. Draft the COMPLETE complaint "
    "using this EXACT structure:\n\n"

    "CAPTION: Two-column format. Left: Plaintiff Name, Plaintiff, v., "
    "Defendant Name(s), Defendants. Right: CASE NO. _____, Complaint for "
    "a civil case, Jury Trial: ☒ Yes ☐ No\n\n"

    "SECTIONS IN ORDER:\n"
    "1. INTRODUCTION — 'This is a civil action for actual, statutory damages "
    "and cost brought by [Plaintiff] (\"Plaintiff\") an individual consumer, "
    "against defendant(s), [Defendants] for violations of the [Statutes].'\n\n"

    "2. JURISDICTION — 'Jurisdiction of this court arises under 15 U.S.C "
    "§ 1681(P), 15 U.S.C § 1692 K(d) and 28 U.S.C § 1391 B(2) because a "
    "substantial part of the events, omissions, or conduct giving rise to "
    "plaintiff claim occurred in this judicial district. [Defendants] transact "
    "business in Atlanta, Fulton County, Georgia. The court has supplemental "
    "jurisdiction of any state law pursuant to 28 U.S.C § 1367.'\n\n"

    "3. PARTIES — Plaintiff as natural person under §1681a(c) residing in "
    "[County], Georgia. Each CRA defendant defined under §1681a(f) with full "
    "address and GA registered agent. Each debt collector under §1692a(6). "
    "Each furnisher under §1681s-2.\n\n"

    "4. FCRA FINDINGS — 'According to 15 USC §1681a of the Fair Credit "
    "Reporting Act (FCRA), The banking system is dependent upon fair and "
    "accurate credit reporting. Inaccurate credit reports directly impair "
    "the efficiency of the banking system, and unfair credit reporting methods "
    "undermine the public confidence which is essential to the continued "
    "functioning of the banking system.'\n\n"

    "5. FACTUAL ALLEGATIONS — numbered paragraphs, plain factual narrative\n\n"

    "6. COUNTS — each count: bold centered header 'Count [Roman Numeral] "
    "Violation of [Statute] [Section] ([Defendants])'. Realleges all prior "
    "paragraphs. States the violation. CONDENSE — same violation by multiple "
    "defendants = one count naming all.\n\n"

    "Use this EXACT damages language in every count:\n"
    "'As a result of each Defendant's violations of [section], [Plaintiff] "
    "suffered actual damages, including but not limited to: loss of credit, "
    "denial of credit, loss of ability to purchase or benefit from credit, "
    "loss of time due to learning how to defend against the Defendant's "
    "violation of his/her rights, damage to reputation from brandishing an "
    "inaccurate consumer report to third parties which in turn led to "
    "humiliation and embarrassment, anxiety and other mental, physical, and "
    "emotional distress.'\n\n"

    "Use this EXACT willful/negligent closing in every count:\n"
    "'The violations by each defendant were willful rendering the Defendant "
    "liable for punitive damages in an amount to be determined by the court "
    "pursuant to 15 U.S.C § 1681n. In the alternative, each defendant was "
    "negligent, which entitles [Plaintiff] to recovery under 15 U.S.C § 1681o. "
    "[Plaintiff] is entitled to recover actual damages, statutory damages, "
    "cost and attorney's fees from each defendant in an amount to be "
    "determined by the court pursuant to 15 U.S.C §§ 1681n and 1681o.'\n\n"

    "7. PRAYER FOR RELIEF — Declaratory relief / Actual damages / Statutory "
    "damages / Punitive damages / Treble damages if GA FBPA / Attorney fees "
    "and costs / Other relief\n\n"

    "8. TRIAL BY JURY IS DEMANDED — centered bold\n\n"

    "9. Signature block — Date blank, Plaintiff name, address, phone, email\n\n"

    "Number ALL paragraphs sequentially 1 through end.\n"
    "Return the COMPLETE complaint text. Do not truncate or summarize."
)


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------


async def run_fast_draft(case_id: str, case_facts: str, damages_description: str) -> dict:
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

        # ── CALL 1: Analysis (Haiku) ────────────────────────────────────
        t1_start = datetime.now(timezone.utc)
        logger.info(f"[fast_draft] Call 1 (analysis) starting for case {case_id}")

        analysis_response = client.messages.create(
            model=ANALYSIS_MODEL,
            max_tokens=4096,
            system=ANALYSIS_PROMPT,
            messages=[{
                "role": "user",
                "content": f"CASE FACTS:\n{case_facts}\n\nDAMAGES:\n{damages_description}",
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

        # Build system prompt with caching
        system_blocks = [
            {
                "type": "text",
                "text": DRAFTING_PROMPT,
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
