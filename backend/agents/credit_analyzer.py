"""
Credit Report Analyzer — uses Claude to extract accounts and findings
from credit report text.

Handles long reports by chunking into multiple API calls and merging
the results so no accounts are missed.
"""

import json
import logging

import anthropic

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """\
You are a credit report analyst. Analyze the following credit report text and extract EVERY account that has ANY negative information whatsoever.

For each negative account, return a JSON object with these fields:
- creditor: creditor/company name
- accountNumber: account number (masked is fine)
- category: "public-record" or "adverse-account" or "collection"
- balance: reported balance (number or empty string)
- pastDue: past due amount (number or empty string)
- highBalance: high balance (number or empty string)
- creditLimit: credit limit (number or empty string)
- dateOpened: date opened
- dateClosed: date closed
- lastPaymentMade: last payment date
- payStatus: current pay status (e.g. "Charge-off", "Collection", "Late 60 days")
- originalCreditor: original creditor name if this is a collection
- remarks: any remarks or codes
- disputeType: one of "charge-off", "collection", "late", "duplicate", "outdated", "unknown", "identity", "inquiry", "bankruptcy", "balance"
- negativeFindings: array of objects with {description: string, severity: "high"|"medium"|"low"} for SPECIFIC issues found:
  * Pay status issues (charge-off, collection, bankruptcy)
  * Balance exceeding credit limit (cite exact numbers)
  * Late payment history (list specific months/ratings)
  * Date inconsistencies (payment after closure, etc.)
  * Over-limit reporting (cite balance vs limit)
  * Metro 2 re-aging concerns (consecutive C/O months >12)
  * Payment progression inconsistencies (60→30 without payment)
  * Static balance patterns
  * Prior dispute flags (AID remarks)
  * Obsolete items past removal date
  * Any other FCRA-relevant issues

Be SPECIFIC in findings — cite exact numbers, dates, and account details. Do not use generic descriptions.

Return ONLY a JSON array. No markdown. No explanation. Just the array of account objects.

CRITICAL INSTRUCTIONS:
- Extract EVERY account with ANY negative mark. Do not skip ANY.
- Include: collections, charge-offs, late payments (even one 30-day late), public records, inquiries, bankruptcies, repossessions, judgments, tax liens, and ANY account that is NOT in perfect standing.
- If an account has even ONE late payment in its history, include it.
- If an account is closed with a balance, include it.
- If an account has been transferred to collections, include BOTH the original and the collection.
- Count your accounts at the end and verify you haven't missed any.\
"""


def _parse_json_array(raw: str) -> list:
    """Parse a JSON array from Claude's response, handling markdown fences and truncation."""
    text = raw.strip()

    if text.startswith("```"):
        try:
            first_nl = text.index("\n")
            text = text[first_nl + 1:]
        except ValueError:
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()

    # Try direct parse
    try:
        result = json.loads(text)
        return result if isinstance(result, list) else [result]
    except json.JSONDecodeError:
        pass

    # Find the array start
    bracket_pos = text.find("[")
    if bracket_pos < 0:
        brace_pos = text.find("{")
        if brace_pos >= 0:
            try:
                result = json.loads(text[brace_pos:])
                return [result] if isinstance(result, dict) else []
            except json.JSONDecodeError:
                pass
        return []

    json_text = text[bracket_pos:]

    try:
        result = json.loads(json_text)
        return result if isinstance(result, list) else [result]
    except json.JSONDecodeError:
        pass

    # Truncation recovery: close open structures
    salvaged = json_text
    # Trim any trailing incomplete value
    for trim_char in ['"', "'", ",", ":"]:
        last_pos = salvaged.rfind(trim_char)
        if last_pos > 0 and last_pos > len(salvaged) - 100:
            candidate = salvaged[:last_pos]
            open_b = candidate.count("{") - candidate.count("}")
            open_k = candidate.count("[") - candidate.count("]")
            if open_b >= 0 and open_k >= 0:
                salvaged = candidate
                break

    # If we end mid-string or mid-key, clean up
    if salvaged.rstrip().endswith(":"):
        salvaged += '""'
    if salvaged.rstrip().endswith(","):
        salvaged = salvaged.rstrip()[:-1]

    open_braces = salvaged.count("{") - salvaged.count("}")
    open_brackets = salvaged.count("[") - salvaged.count("]")
    salvaged += "}" * max(0, open_braces)
    salvaged += "]" * max(0, open_brackets)

    try:
        result = json.loads(salvaged)
        if isinstance(result, list):
            logger.warning(f"Recovered {len(result)} accounts from truncated JSON response")
            return result
    except json.JSONDecodeError:
        pass

    logger.error(f"Could not parse credit report JSON. First 500 chars: {raw[:500]}")
    return []


def _chunk_report(report_text: str, max_chars: int = 60000) -> list[str]:
    """Split a long report into overlapping chunks at natural boundaries."""
    if len(report_text) <= max_chars:
        return [report_text]

    chunks = []
    overlap = 2000
    start = 0

    while start < len(report_text):
        end = start + max_chars
        if end >= len(report_text):
            chunks.append(report_text[start:])
            break

        # Find a natural break point (double newline, section break, etc.)
        search_zone = report_text[end - 1000:end + 1000]
        best_break = -1
        for separator in ["\n\n\n", "\n\n", "\n"]:
            pos = search_zone.rfind(separator)
            if pos >= 0:
                best_break = (end - 1000) + pos + len(separator)
                break

        if best_break > start:
            end = best_break

        chunks.append(report_text[start:end])
        start = end - overlap

    logger.info(f"Split credit report into {len(chunks)} chunks ({len(report_text)} total chars)")
    return chunks


def _deduplicate_accounts(all_accounts: list) -> list:
    """Merge duplicate accounts from multiple chunks based on creditor + account number."""
    seen = {}
    unique = []

    for acc in all_accounts:
        creditor = (acc.get("creditor") or "").strip().lower()
        acct_num = (acc.get("accountNumber") or "").strip().lower().replace("*", "").replace("x", "")

        # Build a dedup key
        if acct_num and len(acct_num) >= 3:
            key = f"{acct_num[-4:]}"
        elif creditor:
            key = creditor
        else:
            key = f"unknown-{len(unique)}"

        composite_key = f"{creditor}:{key}"

        if composite_key in seen:
            # Merge: keep the one with more findings
            existing = seen[composite_key]
            existing_findings = len(existing.get("negativeFindings") or [])
            new_findings = len(acc.get("negativeFindings") or [])
            if new_findings > existing_findings:
                idx = unique.index(existing)
                unique[idx] = acc
                seen[composite_key] = acc
        else:
            seen[composite_key] = acc
            unique.append(acc)

    if len(all_accounts) != len(unique):
        logger.info(f"Deduplicated {len(all_accounts)} → {len(unique)} accounts")
    return unique


async def analyze_credit_report(report_text: str) -> list:
    """Send credit report text to Claude for analysis.
    Returns a list of structured account dicts.

    For long reports (>60k chars), splits into chunks and merges results.
    """

    client = anthropic.Anthropic()
    chunks = _chunk_report(report_text, max_chars=60000)
    all_accounts = []

    for i, chunk in enumerate(chunks):
        chunk_label = f"chunk {i+1}/{len(chunks)}" if len(chunks) > 1 else "full report"
        logger.info(f"Analyzing credit report ({chunk_label}, {len(chunk)} chars)")

        try:
            user_msg = f"Analyze this credit report and extract ALL negative accounts. Do NOT skip any.\n\n{chunk}"
            if len(chunks) > 1:
                user_msg = (
                    f"This is part {i+1} of {len(chunks)} of a credit report. "
                    f"Extract ALL negative accounts from THIS section. Do NOT skip any.\n\n{chunk}"
                )

            response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=16384,
                system=ANALYSIS_PROMPT,
                messages=[{
                    "role": "user",
                    "content": user_msg,
                }],
            )

            raw = response.content[0].text.strip()
            stop_reason = response.stop_reason

            accounts = _parse_json_array(raw)

            # If we hit max tokens, the response was truncated — log it
            if stop_reason == "end_turn":
                logger.info(f"Credit report analysis ({chunk_label}): found {len(accounts)} accounts")
            else:
                logger.warning(
                    f"Credit report analysis ({chunk_label}): response truncated "
                    f"(stop_reason={stop_reason}), recovered {len(accounts)} accounts"
                )

            all_accounts.extend(accounts)

        except Exception as e:
            logger.exception(f"Credit report analysis failed for {chunk_label}: {e}")
            if len(chunks) == 1:
                raise
            # For multi-chunk, continue with other chunks

    # Deduplicate across chunks
    if len(chunks) > 1:
        all_accounts = _deduplicate_accounts(all_accounts)

    # Ensure all accounts have required fields
    for i, acc in enumerate(all_accounts):
        acc.setdefault("id", f"ai-{i+1}-{hash(acc.get('creditor', ''))}")
        acc.setdefault("creditor", "Unknown")
        acc.setdefault("accountNumber", "")
        acc.setdefault("category", "adverse-account")
        acc.setdefault("disputeType", "charge-off")
        acc.setdefault("negativeFindings", [])
        acc.setdefault("customFindings", [])
        acc.setdefault("includeConsumerStatement", False)
        acc.setdefault("bureau", "")

    logger.info(f"Credit report analysis complete: {len(all_accounts)} total negative accounts")
    return all_accounts
