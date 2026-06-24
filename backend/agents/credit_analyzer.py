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
You are an expert credit report analyst with deep knowledge of the Metro 2 Format (CDIA Credit Reporting Resource Guide 2024). You analyze credit reports to identify EVERY account with negative information AND every Metro 2 compliance violation.

=== METRO 2 REFERENCE KNOWLEDGE ===

ACCOUNT STATUS CODES:
- 11: Current (0-29 days past due)
- 13: Paid/closed/zero balance (FINAL status — balance MUST be zero)
- 61: Paid — was 30-59 days past due
- 62: Paid — was 60-89 days past due
- 63: Paid — was 90-119 days past due
- 64: Paid — was 120-149 days past due (also used for paid charge-offs)
- 65: Paid — was 150-179 days past due
- 71: 30-59 days past due
- 78: 60-89 days past due
- 80: 90-119 days past due
- 82: 120-149 days past due
- 83: 150-179 days past due
- 84: 180+ days past due
- 93: Assigned to collections
- 94: Foreclosure/deed-in-lieu
- 95: Voluntary surrender
- 96: Repossession
- 97: Charge-off (unpaid balance reported as loss)

PAYMENT RATING CODES (only valid with Status 13, 65, 88, 89, 94, 95 — must be BLANK for all others):
- 0: Current | 1: 30-59 | 2: 60-89 | 3: 90-119 | 4: 120-149 | 5: 150-179 | 6: 180+ | G: Collection | L: Charge-off

PAYMENT HISTORY PROFILE (24 months, left=most recent):
- 0: Current | 1-6: Days late (30-180+) | B: No history before this (END only) | D: No history this month | E: Zero balance/current | G: Collection | H: Foreclosure | J: Voluntary surrender | K: Repossession | L: Charge-off

COMPLIANCE CONDITION CODES (Dispute flags):
- XB: Disputed by consumer (FCRA) | XC: Disputed (FCBA) | XF: Disputed (FDCPA) | XG: Disputed (FCRA direct dispute)
- XH: Previously disputed — now resolved | XR: Removes previously reported code
- XA: Closed at consumer request | XD: Closed at consumer request + disputed

CHARGE-OFF RULES:
- Original Charge-off Amount must remain STATIC (never declines as payments received)
- Current Balance should decline as payments received
- When fully paid: Status 13 with Payment Rating L, or Status 64

COLLECTION ACCOUNT RULES:
- Must include Original Creditor Name (K1 Segment)
- Date of First Delinquency must be from ORIGINAL CREDITOR (not date placed for collection)
- Valid statuses: 62, 93, DA, DF ONLY
- Date Opened = date placed/purchased for collection
- Paid collections must be updated to paid status, NOT deleted

RE-AGING RULES (ILLEGAL):
- DOFD must NEVER be moved forward once account is continuously delinquent
- Collection agencies MUST use DOFD from original creditor
- Re-aging = illegally changing DOFD to extend reporting beyond 7 years

OBSOLESCENCE RULES (FCRA §605):
- 7-year rule: Derogatory info removed 7 years from DOFD
- 7-year rule for collections: From DOFD with ORIGINAL creditor
- 10-year rule: Chapter 7/11 bankruptcy from filing date
- 7-year rule: Chapter 13 bankruptcy from filing date
- Charge-offs: 7 years from DOFD (not date of charge-off)

BALANCE RULES:
- If Status 11 (current): Amount Past Due MUST be zero
- If Status 13 (paid/closed): Current Balance MUST be zero
- Credit Limit must be reported for revolving/LOC accounts (suppressing harms score)
- Balance may exceed credit limit (over-limit condition)

DATE RULES:
- Date of First Delinquency: Required for ALL derogatory statuses (61-65, 71, 78, 80, 82-84, 88-89, 93-97)
- DOFD must be zero-filled for Status 11 with no bankruptcy
- Date Opened must NEVER change (always original open date)
- Date of Account Information must be current reporting period

=== COMMON METRO 2 VIOLATIONS TO IDENTIFY ===

1. Payment Rating reported with wrong status (must be BLANK unless Status 13/65/88/89/94/95)
2. Amount Past Due > 0 with Status 11 (current accounts must show $0 past due)
3. Non-zero balance with Status 13 (paid/closed must be $0)
4. Missing DOFD on derogatory account
5. DOFD present on current account (should be zero-filled)
6. Re-aging: DOFD moved to later date while continuously delinquent
7. Collection without Original Creditor Name
8. Collection using wrong DOFD (date placed instead of original creditor's DOFD)
9. Reporting beyond 7-year obsolescence from DOFD
10. Payment History Profile inconsistent with status (e.g., showing "0" months during known delinquency)
11. "B" code embedded in Payment History (only valid at END)
12. Missing Credit Limit for revolving accounts (harms utilization calculation)
13. Original Charge-off Amount declining (must stay static)
14. Paid collection deleted instead of updated to paid status
15. Dispute flag (XB) not reported when consumer has disputed
16. Dispute flag not removed after resolution
17. Static balance pattern on charge-off (same balance >12 months with no payments = potential re-aging)
18. Payment progression inconsistency (e.g., 60→30 days without payment received)
19. Date Opened changed (must always be original date)
20. Account reported after it should have been purged per obsolescence rules

=== YOUR TASK ===

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
- remarks: any remarks or codes (include compliance condition codes like XB, AID, etc.)
- disputeType: one of "charge-off", "collection", "late", "duplicate", "outdated", "unknown", "identity", "inquiry", "bankruptcy", "balance"
- negativeFindings: array of objects with {description: string, severity: "high"|"medium"|"low"} for SPECIFIC Metro 2 violations and issues found. CHECK FOR:
  * Metro 2 status code violations (invalid combinations, wrong payment rating)
  * Balance/past due inconsistencies (cite exact dollar amounts)
  * DOFD violations (missing, re-aged, wrong date for collections)
  * Obsolescence violations (calculate from DOFD — is it past 7 years?)
  * Payment history profile inconsistencies (cite specific months)
  * Missing credit limit on revolving accounts (cite balance vs missing limit)
  * Static balance patterns on charge-offs (same balance how many months?)
  * Original charge-off amount declining
  * Missing original creditor on collection accounts
  * Dispute flag issues (AID remark without XB code, or XB without resolution)
  * Over-limit reporting (balance exceeds limit — cite exact numbers)
  * Date inconsistencies (payment after closure, opened date changed, etc.)
  * Late payment history (list specific months/ratings from payment history profile)
  * Any other FCRA/Metro 2 compliance issue

Be EXTREMELY SPECIFIC in findings — cite exact numbers, dates, account details, and the Metro 2 rule being violated.

Return ONLY a JSON array. No markdown. No explanation. Just the array of account objects.

CREDIT REPORT FORMAT GUIDANCE:
Annual credit reports (annualcreditreport.com) use specific formatting:

TransUnion format:
- Accounts listed under "Account Information" or "Trade Lines"
- Each account shows: creditor name, account number, account type, payment status
- Late payments shown in "Payment History" grid or "Payment Pattern"
- Collections listed under "Collection Accounts" or "Adverse Accounts"
- Look for: "30 days late", "60 days late", "90 days late", "120 days late"
- Look for: "Charge-off", "Collection", "Repossession", "Foreclosure"
- Look for: "Account Status: Derogatory" or "Rating: Derogatory"

Equifax format:
- Accounts under "Account Information"
- Payment status shown as codes or text descriptions
- Collections may be listed separately
- Look for payment history grids showing months with late indicators

Experian format:
- Accounts listed with "Status" field showing current condition
- Payment history shown as monthly grid
- "Potentially Negative" section contains all adverse accounts
- Collections under "Collections" section

CRITICAL INSTRUCTIONS:
- Extract EVERY account with ANY negative mark. Do not skip ANY.
- ONLY extract accounts that ACTUALLY EXIST in the text. Do NOT invent, fabricate, or hallucinate accounts.
- If you cannot clearly read a creditor name or account number from the text, do NOT include it.
- Every account you return MUST have a creditor name that appears verbatim in the report text.
- Do NOT guess at account details. If a field is unreadable, use an empty string.
- If the text is garbled or unreadable, return fewer accounts rather than fabricated ones.
- ACCURACY over QUANTITY — it is better to return 5 real accounts than 15 with 10 made up.
- Include: collections, charge-offs, late payments (even one 30-day late), public records, inquiries, bankruptcies, repossessions, judgments, tax liens, and ANY account that is NOT in perfect standing.
- If an account has even ONE late payment in its history, include it.
- If an account is closed with a balance, include it.
- If an account has been transferred to collections, include BOTH the original and the collection.
- Look at the ENTIRE report — negative accounts may appear in different sections.
- Do NOT stop after finding the first few accounts — read through ALL pages.
- Apply Metro 2 knowledge to identify violations that a consumer would not normally catch.
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

    # Inject attorney preferences for dispute analysis
    system_with_memory = ANALYSIS_PROMPT
    try:
        from utils.memory import get_attorney_memories
        from utils.supabase_client import get_supabase
        supabase = get_supabase()
        atty_resp = supabase.table("profiles").select("id").eq("role", "attorney").limit(1).execute()
        if atty_resp.data:
            mem = get_attorney_memories(atty_resp.data[0]["id"], limit=10)
            if mem:
                system_with_memory += f"\n\n--- ATTORNEY PREFERENCES ---\n{mem}"
    except Exception:
        pass

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
                model="claude-sonnet-4-5",
                max_tokens=16384,
                system=system_with_memory,
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
