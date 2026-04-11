"""
Interactive Agent — conversational AI agents the attorney can chat with.

Each agent type has a specialized system prompt and access to case context.
The attorney can give tasks, ask questions, and get structured responses.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-5"


def _get_client():
    """Lazy-initialize the Anthropic client so import doesn't crash
    if ANTHROPIC_API_KEY isn't set yet."""
    return anthropic.Anthropic()

# ---------------------------------------------------------------------------
# Agent system prompts — each specialist has deep domain knowledge
# ---------------------------------------------------------------------------

AGENT_SYSTEM_PROMPTS = {
    "general": (
        "You are a senior legal assistant AI working for a consumer protection "
        "law firm. You help the attorney with any task: research, drafting, "
        "analysis, strategy, client communication, case management, and more. "
        "You have deep knowledge of FCRA, FDCPA, TCPA, and Georgia FBPA. "
        "Be concise, professional, and cite specific statutes when relevant. "
        "If case context is provided, use it to give specific answers."
    ),
    "legal_researcher": (
        "You are an expert legal researcher specializing in consumer protection "
        "law. Your expertise covers FCRA (15 U.S.C. § 1681 et seq.), FDCPA "
        "(15 U.S.C. § 1692 et seq.), TCPA (47 U.S.C. § 227), and Georgia FBPA "
        "(O.C.G.A. § 10-1-390 et seq.).\n\n"
        "When the attorney asks you to research something:\n"
        "- Cite specific statutory sections and subsections\n"
        "- Reference relevant case law from the Northern District of Georgia "
        "and the Eleventh Circuit\n"
        "- Explain how the law applies to the specific facts if case context "
        "is provided\n"
        "- Identify any circuit splits or evolving areas of law\n"
        "- Provide the full statutory text when asked\n"
        "- Distinguish between willful and negligent violations\n\n"
        "Prior successful filings have used counts under: §1681e(b), "
        "§1681i(a)(1)(A), §1681i(a)(2)(A), §1681i(a)(4), §1681i(a)(5)(A), "
        "§1681g, §1681i(c), §1681i(a)(6)(B)(iii), §1681i(a)(5)(B)(i)(ii)(iii) "
        "and (C), §1681s-2(b)."
    ),
    "case_analyst": (
        "You are a consumer protection case analyst. You analyze case facts "
        "and identify legal issues, strengths, weaknesses, and strategy.\n\n"
        "When analyzing a case:\n"
        "- Identify all potential statutory violations with specificity\n"
        "- Assess the strength of evidence for each claim\n"
        "- Identify missing evidence or facts that would strengthen the case\n"
        "- Flag any statute of limitations concerns\n"
        "- Evaluate each defendant's potential liability\n"
        "- Consider both willful and negligent theories\n"
        "- Assess damages potential (actual, statutory, punitive)\n"
        "- Identify risks and weaknesses the defense might exploit\n\n"
        "Be direct about weak claims — the attorney needs honest assessment, "
        "not optimism."
    ),
    "complaint_drafter": (
        "You are a legal complaint drafter specializing in consumer protection "
        "law in the Northern District of Georgia. You can draft complete "
        "complaints, individual counts, motions, demand letters, and other "
        "legal documents.\n\n"
        "When drafting:\n"
        "- Match the style of successfully filed NDGA complaints\n"
        "- Use proper legal formatting and numbered paragraphs\n"
        "- Include all required elements for each count\n"
        "- Use the standard damages language: 'As a result of each Defendant's "
        "violations of [section], [Plaintiff] suffered actual damages, including "
        "but not limited to: loss of credit, denial of credit, loss of ability "
        "to purchase or benefit from credit, loss of time due to learning how "
        "to defend against the Defendant's violation of his/her rights, damage "
        "to reputation from brandishing an inaccurate consumer report to third "
        "parties which in turn led to humiliation and embarrassment, anxiety "
        "and other mental, physical, and emotional distress.'\n"
        "- Use the willful/negligent closing in every count\n"
        "- Condense counts where multiple defendants committed the same violation\n\n"
        "You can also draft individual sections, rewrite specific counts, "
        "or help edit existing text the attorney provides."
    ),
    "damages_calculator": (
        "You are a consumer protection damages calculator and analyst. You "
        "help the attorney calculate, structure, and maximize damages claims.\n\n"
        "Your expertise includes:\n"
        "- FCRA: actual damages, statutory damages ($100-$1,000 per violation "
        "under §1681n), punitive damages for willful violations, attorney fees\n"
        "- FDCPA: actual damages, statutory damages up to $1,000 under "
        "§1692k(a)(2)(A), attorney fees under §1692k(a)(3)\n"
        "- TCPA: $500 per violation, $1,500 for willful under §227(b)(3)\n"
        "- Georgia FBPA: treble damages under O.C.G.A. §10-1-399\n\n"
        "When asked about damages:\n"
        "- Calculate specific amounts based on the facts provided\n"
        "- Explain the legal basis for each damages category\n"
        "- Identify all categories of actual damages the client may claim\n"
        "- Provide the exact pleading language to use\n"
        "- Distinguish between per-violation and per-defendant calculations\n"
        "- Reference relevant damages awards from similar cases"
    ),
    "strategy_advisor": (
        "You are a senior litigation strategy advisor for consumer protection "
        "cases. You help the attorney think through case strategy, settlement "
        "positioning, and litigation tactics.\n\n"
        "Areas you advise on:\n"
        "- Pre-suit demand letter strategy\n"
        "- Whether to file in state or federal court\n"
        "- Defendant selection and joinder strategy\n"
        "- Discovery planning and key documents to request\n"
        "- Settlement valuation and negotiation tactics\n"
        "- Motion practice strategy (MTD responses, MSJ)\n"
        "- Trial strategy and jury considerations\n"
        "- Class action vs. individual suit analysis\n"
        "- Fee petition strategy and lodestar calculations\n\n"
        "Be practical and direct. Give the attorney actionable recommendations, "
        "not abstract legal theory."
    ),
}

AGENT_DISPLAY_NAMES = {
    "general": "General Assistant",
    "legal_researcher": "Legal Researcher",
    "case_analyst": "Case Analyst",
    "complaint_drafter": "Complaint Drafter",
    "damages_calculator": "Damages Calculator",
    "strategy_advisor": "Strategy Advisor",
}


# ---------------------------------------------------------------------------
# Context builders — give agents relevant case information
# ---------------------------------------------------------------------------

def _build_case_context(case_id: str) -> str:
    """Fetch case data and build a context string for the agent."""
    if not case_id:
        return ""

    supabase = get_supabase()
    parts = []

    try:
        # Case record
        case_resp = supabase.table("cases").select("*").eq("id", case_id).limit(1).execute()
        if case_resp.data:
            case = case_resp.data[0]
            parts.append(f"## Current Case\n- Status: {case.get('status')}")
            parts.append(f"- Court: {case.get('court', 'TBD')}")
            parts.append(f"- Case Facts: {case.get('case_facts', 'N/A')}")
            parts.append(f"- Damages Description: {case.get('damages_description', 'N/A')}")
            if case.get("statutes_identified"):
                parts.append(f"- Statutes Identified: {json.dumps(case['statutes_identified'], indent=2)}")

            # Client info
            client_resp = (
                supabase.table("profiles")
                .select("full_name, county, state")
                .eq("id", case.get("client_id", ""))
                .limit(1)
                .execute()
            )
            if client_resp.data:
                c = client_resp.data[0]
                parts.append(f"- Plaintiff: {c.get('full_name', 'N/A')}, {c.get('county', '')}, {c.get('state', '')}")

        # Defendants
        cd_resp = supabase.table("case_defendants").select("defendant_id").eq("case_id", case_id).execute()
        if cd_resp.data:
            parts.append("\n## Defendants")
            for row in cd_resp.data:
                d_resp = supabase.table("defendants").select("*").eq("id", row["defendant_id"]).limit(1).execute()
                if d_resp.data:
                    d = d_resp.data[0]
                    parts.append(f"- {d['name']} ({d.get('entity_type', 'Unknown')}) — {d.get('principal_address', 'N/A')}")

        # Agent outputs (if pipeline has run)
        ao_resp = (
            supabase.table("agent_outputs")
            .select("agent_name, status, output_data")
            .eq("case_id", case_id)
            .eq("status", "complete")
            .execute()
        )
        if ao_resp.data:
            parts.append("\n## Agent Pipeline Results")
            for ao in ao_resp.data:
                output = ao.get("output_data")
                if output:
                    # Truncate large outputs to avoid blowing up context
                    output_str = json.dumps(output, indent=2)
                    if len(output_str) > 3000:
                        output_str = output_str[:3000] + "\n... [truncated]"
                    parts.append(f"\n### {ao['agent_name']}\n```json\n{output_str}\n```")

        # Current complaint draft
        complaint_resp = (
            supabase.table("complaints")
            .select("complaint_text, version")
            .eq("case_id", case_id)
            .eq("is_current", True)
            .limit(1)
            .execute()
        )
        if complaint_resp.data:
            ct = complaint_resp.data[0]
            text = ct.get("complaint_text", "")
            if len(text) > 5000:
                text = text[:5000] + "\n... [truncated]"
            parts.append(f"\n## Current Complaint Draft (v{ct.get('version', 1)})\n{text}")

    except Exception as e:
        logger.error(f"Failed to build case context for {case_id}: {e}")
        parts.append("\n[Error loading some case context]")

    return "\n".join(parts)


def _load_conversation_history(conversation_id: str, limit: int = 50) -> list[dict]:
    """Load recent messages from a conversation for context."""
    supabase = get_supabase()
    resp = (
        supabase.table("conversation_messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return [{"role": msg["role"], "content": msg["content"]} for msg in (resp.data or [])]


# ---------------------------------------------------------------------------
# Main chat function
# ---------------------------------------------------------------------------

async def chat(
    conversation_id: str,
    agent_type: str,
    user_message: str,
    case_id: str | None = None,
) -> dict:
    """Send a message to an interactive agent and get a response.

    Parameters
    ----------
    conversation_id : str
        UUID of the conversation.
    agent_type : str
        Which specialist agent to use.
    user_message : str
        The attorney's message.
    case_id : str, optional
        If provided, the agent gets full case context.

    Returns
    -------
    dict
        {"role": "assistant", "content": str, "metadata": dict | None}
    """
    supabase = get_supabase()

    # Build system prompt with case context
    system_prompt = AGENT_SYSTEM_PROMPTS.get(agent_type, AGENT_SYSTEM_PROMPTS["general"])

    if case_id:
        case_context = _build_case_context(case_id)
        if case_context:
            system_prompt += (
                "\n\n--- CASE CONTEXT ---\n"
                "The attorney is working on a specific case. Here is the "
                "full context. Use this information to give specific, "
                "relevant answers.\n\n"
                f"{case_context}"
            )

    # Load conversation history
    history = _load_conversation_history(conversation_id)

    # Add the new user message to history
    messages = history + [{"role": "user", "content": user_message}]

    # Save user message to database
    supabase.table("conversation_messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": user_message,
    }).execute()

    # Call Claude with prompt caching on the system prompt.
    # The system prompt for each agent type is identical across messages
    # in a conversation, so caching it yields ~90% savings on repeated
    # turns (cache window is 5 minutes).
    try:
        client = _get_client()
        system_blocks = [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system_blocks,
            messages=messages,
        )
        assistant_content = response.content[0].text

        # Log cache performance for cost tracking
        usage = getattr(response, "usage", None)
        if usage:
            logger.info(
                "Interactive agent tokens — input: %s, cache_creation: %s, cache_read: %s, output: %s",
                getattr(usage, "input_tokens", 0),
                getattr(usage, "cache_creation_input_tokens", 0),
                getattr(usage, "cache_read_input_tokens", 0),
                getattr(usage, "output_tokens", 0),
            )

        # Save assistant response to database
        supabase.table("conversation_messages").insert({
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": assistant_content,
        }).execute()

        # Auto-title the conversation after the first exchange
        if len(history) == 0:
            try:
                title_response = client.messages.create(
                    model=MODEL,
                    max_tokens=50,
                    messages=[
                        {"role": "user", "content": f"Generate a short title (under 6 words) for a conversation that starts with: \"{user_message[:200]}\"  Return ONLY the title, nothing else."}
                    ],
                )
                title = title_response.content[0].text.strip().strip('"')
                supabase.table("conversations").update({"title": title}).eq("id", conversation_id).execute()
            except Exception:
                pass  # Title generation is not critical

        return {
            "role": "assistant",
            "content": assistant_content,
            "metadata": None,
        }

    except Exception as e:
        logger.error(f"Interactive agent error: {e}")
        error_msg = f"I encountered an error processing your request: {str(e)}"

        supabase.table("conversation_messages").insert({
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": error_msg,
        }).execute()

        return {
            "role": "assistant",
            "content": error_msg,
            "metadata": {"error": True},
        }
