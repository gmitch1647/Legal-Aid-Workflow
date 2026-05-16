"""
Memory System — extracts and retrieves knowledge from conversations and drafts.

Two memory types:
1. Case memories — facts, decisions, strategies specific to a case
2. Attorney memories — global preferences and instructions that apply everywhere

Memory is extracted asynchronously after each conversation turn or draft revision,
and injected into future AI calls as context.
"""

import json
import logging
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are a memory extraction system for a legal CRM. Your job is to extract important facts, decisions, instructions, and preferences from conversations between an attorney and their AI assistant.

Extract ONLY information worth remembering for future interactions. Skip generic/obvious things.

Categories:
- "fact": A specific fact about the case (dates, amounts, parties, events, findings)
- "decision": A strategic or legal decision the attorney made about the case
- "strategy": A litigation strategy or approach discussed for the case
- "preference": How the attorney likes things done (formatting, style, approach)
- "instruction": A direct instruction from the attorney about how to handle something

For each memory, assign importance 1-10:
- 10: Critical case fact or firm instruction that must always be referenced
- 7-9: Important decision or strategy that shapes the case
- 4-6: Useful context that may be relevant later
- 1-3: Minor detail

Return a JSON array of objects: [{"category": "...", "content": "...", "importance": N}]
If nothing worth remembering, return an empty array: []

RULES:
- Be specific — include names, dates, amounts, statute numbers
- Keep each memory to 1-2 sentences
- Don't extract things that are already in the case record (basic case facts)
- DO extract attorney preferences, instructions, corrections, and strategic decisions
- DO extract new findings or facts discovered during conversation
- Return ONLY the JSON array. No markdown, no explanation.\
"""


async def extract_memories_from_conversation(
    conversation_id: str,
    case_id: str | None,
    attorney_id: str,
    recent_messages: list[dict],
) -> list[dict]:
    """Extract important memories from recent conversation messages.

    Called after each agent response to capture new knowledge.
    Only processes the last few messages (not the entire history).
    """
    if not recent_messages or len(recent_messages) < 2:
        return []

    # Only analyze the last exchange (user + assistant)
    last_msgs = recent_messages[-4:] if len(recent_messages) >= 4 else recent_messages
    conversation_text = "\n".join(
        f"{'ATTORNEY' if m['role'] == 'user' else 'AI'}: {m['content'][:2000]}"
        for m in last_msgs
    )

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2048,
            system=EXTRACTION_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Extract memories from this exchange:\n\n{conversation_text}",
            }],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        memories = json.loads(raw)
        if not isinstance(memories, list):
            return []

        supabase = get_supabase()
        saved = []

        for mem in memories:
            if not mem.get("content"):
                continue

            category = mem.get("category", "fact")
            content = mem["content"]
            importance = min(10, max(1, int(mem.get("importance", 5))))

            # Determine if this is case-specific or a global attorney preference
            if category in ("preference", "instruction") and not case_id:
                # Global attorney memory
                record = {
                    "attorney_id": attorney_id,
                    "category": category,
                    "content": content,
                    "source_type": "conversation",
                    "source_id": conversation_id,
                    "importance": importance,
                }
                supabase.table("attorney_memories").insert(record).execute()
            elif category in ("preference", "instruction"):
                # Save to both — it's a preference discovered in a case context
                record = {
                    "attorney_id": attorney_id,
                    "category": category,
                    "content": content,
                    "source_type": "conversation",
                    "source_id": conversation_id,
                    "importance": importance,
                }
                supabase.table("attorney_memories").insert(record).execute()

                if case_id:
                    case_record = {
                        "case_id": case_id,
                        "category": category,
                        "content": content,
                        "source_type": "conversation",
                        "source_id": conversation_id,
                        "importance": importance,
                    }
                    supabase.table("case_memories").insert(case_record).execute()
            elif case_id:
                # Case-specific memory
                record = {
                    "case_id": case_id,
                    "category": category,
                    "content": content,
                    "source_type": "conversation",
                    "source_id": conversation_id,
                    "importance": importance,
                }
                supabase.table("case_memories").insert(record).execute()
            else:
                # No case context — treat as attorney memory
                record = {
                    "attorney_id": attorney_id,
                    "category": category,
                    "content": content,
                    "source_type": "conversation",
                    "source_id": conversation_id,
                    "importance": importance,
                }
                supabase.table("attorney_memories").insert(record).execute()

            saved.append(mem)

        if saved:
            logger.info(f"Extracted {len(saved)} memories from conversation {conversation_id}")
        return saved

    except Exception as e:
        logger.warning(f"Memory extraction failed: {e}")
        return []


async def extract_memories_from_draft(
    session_id: str,
    case_id: str | None,
    attorney_id: str,
    revision_message: str,
    revised_output: str,
) -> list[dict]:
    """Extract memories from a draft revision interaction.

    When the attorney revises a draft, their instructions reveal preferences
    about writing style, legal strategy, and formatting.
    """
    if not revision_message:
        return []

    text = f"ATTORNEY REVISION INSTRUCTION: {revision_message[:3000]}"
    if revised_output:
        text += f"\n\nRESULTING REVISION (first 1000 chars): {revised_output[:1000]}"

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            system=EXTRACTION_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Extract memories from this draft revision:\n\n{text}",
            }],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        memories = json.loads(raw)
        if not isinstance(memories, list):
            return []

        supabase = get_supabase()
        saved = []

        for mem in memories:
            if not mem.get("content"):
                continue

            category = mem.get("category", "preference")
            content = mem["content"]
            importance = min(10, max(1, int(mem.get("importance", 5))))

            # Draft revisions typically reveal preferences
            record = {
                "attorney_id": attorney_id,
                "category": category,
                "content": content,
                "source_type": "draft",
                "source_id": session_id,
                "importance": importance,
            }
            supabase.table("attorney_memories").insert(record).execute()

            if case_id:
                case_record = {
                    "case_id": case_id,
                    "category": category,
                    "content": content,
                    "source_type": "draft",
                    "source_id": session_id,
                    "importance": importance,
                }
                supabase.table("case_memories").insert(case_record).execute()

            saved.append(mem)

        if saved:
            logger.info(f"Extracted {len(saved)} memories from draft revision {session_id}")
        return saved

    except Exception as e:
        logger.warning(f"Memory extraction from draft failed: {e}")
        return []


def get_case_memories(case_id: str, limit: int = 30) -> str:
    """Retrieve memories for a specific case, formatted for injection into prompts."""
    if not case_id:
        return ""

    supabase = get_supabase()
    resp = (
        supabase.table("case_memories")
        .select("category, content, importance")
        .eq("case_id", case_id)
        .order("importance", desc=True)
        .limit(limit)
        .execute()
    )

    if not resp.data:
        return ""

    lines = ["## Remembered Context for This Case"]
    for mem in resp.data:
        prefix = {
            "fact": "FACT",
            "decision": "DECISION",
            "strategy": "STRATEGY",
            "preference": "PREFERENCE",
            "instruction": "INSTRUCTION",
        }.get(mem["category"], "NOTE")
        lines.append(f"- [{prefix}] {mem['content']}")

    return "\n".join(lines)


def get_attorney_memories(attorney_id: str, limit: int = 20) -> str:
    """Retrieve global attorney preferences, formatted for injection into prompts."""
    if not attorney_id:
        return ""

    supabase = get_supabase()
    resp = (
        supabase.table("attorney_memories")
        .select("category, content, importance")
        .eq("attorney_id", attorney_id)
        .order("importance", desc=True)
        .limit(limit)
        .execute()
    )

    if not resp.data:
        return ""

    lines = ["## Attorney Preferences & Instructions (Apply to All Cases)"]
    for mem in resp.data:
        prefix = {
            "preference": "PREFERENCE",
            "instruction": "INSTRUCTION",
            "strategy": "STRATEGY",
            "style": "STYLE",
        }.get(mem["category"], "NOTE")
        lines.append(f"- [{prefix}] {mem['content']}")

    return "\n".join(lines)


def get_full_memory_context(case_id: str | None, attorney_id: str) -> str:
    """Get combined memory context (attorney prefs + case-specific) for prompt injection."""
    parts = []

    attorney_mem = get_attorney_memories(attorney_id)
    if attorney_mem:
        parts.append(attorney_mem)

    if case_id:
        case_mem = get_case_memories(case_id)
        if case_mem:
            parts.append(case_mem)

    if not parts:
        return ""

    return "\n\n".join(parts)
