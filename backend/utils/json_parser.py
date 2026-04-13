"""
Shared JSON response parser for all agents.

Handles:
- Raw JSON responses
- Markdown-wrapped JSON (```json ... ```)
- Truncated JSON (closes open braces/brackets)
- Empty responses
- Non-JSON responses (returns raw text in a dict)
"""

import json
import logging

logger = logging.getLogger(__name__)


def parse_agent_json(text: str, agent_name: str = "unknown") -> dict:
    """Parse a Claude response that should contain JSON.

    Tries multiple strategies in order:
    1. Direct JSON parse
    2. Strip markdown fences, then parse
    3. Salvage truncated JSON by closing open braces
    4. Return raw text wrapped in a dict as last resort
    """
    if not text or not text.strip():
        logger.warning(f"[{agent_name}] Empty response from Claude")
        return {"raw_text": "", "parse_error": "empty_response"}

    cleaned = text.strip()

    # Strip markdown code fences
    if cleaned.startswith("```"):
        try:
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1:]
        except ValueError:
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    # Attempt 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: find the first { or [ and parse from there
    first_brace = -1
    for i, c in enumerate(cleaned):
        if c in "{[":
            first_brace = i
            break

    if first_brace >= 0:
        json_text = cleaned[first_brace:]

        # Attempt 2a: parse as-is
        try:
            return json.loads(json_text)
        except json.JSONDecodeError:
            pass

        # Attempt 2b: close open braces/brackets (truncated response)
        salvaged = json_text
        # Remove any trailing incomplete string or key
        for trim_char in ['"', "'", ",", ":"]:
            last_pos = salvaged.rfind(trim_char)
            if last_pos > 0 and last_pos > len(salvaged) - 50:
                candidate = salvaged[:last_pos]
                open_b = candidate.count("{") - candidate.count("}")
                open_k = candidate.count("[") - candidate.count("]")
                if open_b >= 0 and open_k >= 0:
                    salvaged = candidate
                    break

        open_brackets = salvaged.count("[") - salvaged.count("]")
        open_braces = salvaged.count("{") - salvaged.count("}")
        salvaged += '""' if salvaged.rstrip().endswith(":") else ""
        salvaged += "]" * max(0, open_brackets)
        salvaged += "}" * max(0, open_braces)

        try:
            return json.loads(salvaged)
        except json.JSONDecodeError:
            pass

    # Attempt 3: return raw text as a dict
    logger.warning(
        f"[{agent_name}] Could not parse JSON — returning raw text "
        f"(first 200 chars: {cleaned[:200]})"
    )
    return {"raw_text": text.strip(), "parse_error": True}
