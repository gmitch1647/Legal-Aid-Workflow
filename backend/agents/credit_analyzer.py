"""
Credit Report Analyzer — uses Claude to extract accounts and findings
from credit report text.
"""

import json
import logging

import anthropic

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """\
You are a credit report analyst. Analyze the following credit report text and extract EVERY account that has negative information.

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

IMPORTANT: Extract ALL negative accounts. Do not skip any. Include collections, charge-offs, late payments, public records, inquiries, everything negative.\
"""


async def analyze_credit_report(report_text: str) -> list:
    """Send credit report text to Claude for analysis.
    Returns a list of structured account dicts."""

    client = anthropic.Anthropic()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=8192,
            system=ANALYSIS_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Analyze this credit report and extract all negative accounts:\n\n{report_text[:30000]}",
            }],
        )

        raw = response.content[0].text.strip()

        # Parse JSON — handle markdown fences
        if raw.startswith("```"):
            first_nl = raw.index("\n")
            raw = raw[first_nl + 1:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        accounts = json.loads(raw)
        if not isinstance(accounts, list):
            accounts = [accounts]

        # Ensure all accounts have required fields
        for i, acc in enumerate(accounts):
            acc.setdefault("id", f"ai-{i+1}-{hash(acc.get('creditor',''))}")
            acc.setdefault("creditor", "Unknown")
            acc.setdefault("accountNumber", "")
            acc.setdefault("category", "adverse-account")
            acc.setdefault("disputeType", "charge-off")
            acc.setdefault("negativeFindings", [])
            acc.setdefault("customFindings", [])
            acc.setdefault("includeConsumerStatement", False)
            acc.setdefault("bureau", "")

        logger.info(f"Credit report analysis: found {len(accounts)} negative accounts")
        return accounts

    except Exception as e:
        logger.exception(f"Credit report analysis failed: {e}")
        raise
