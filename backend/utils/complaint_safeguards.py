"""Deterministic safety and source-grounding controls for LegalFlow complaints.

These controls are deliberately independent of an LLM review.  They are used both
before persistence and before DOCX export so a draft that leaks protected data,
invents venue facts, or contains structurally defective FCRA counts cannot be
silently treated as a filing-ready complaint.
"""

from __future__ import annotations

import copy
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable


class ComplaintValidationError(ValueError):
    """Raised when a blocking complaint safeguard fails."""

    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__("Complaint blocked by safeguards: " + "; ".join(issues))


# Pinned statutory language.  A quoted statutory sentence is accepted only when
# it exactly contains the local corpus language for the cited subsection.
# Source: U.S. House Office of the Law Revision Counsel, Title 15 §§ 1681e,
# 1681g, 1681i, and 1681n (current preliminary edition retrieved 2026-08-10).
FCRA_QUOTE_CORPUS = {
    "1681e(b)": (
        "Whenever a consumer reporting agency prepares a consumer report it shall follow "
        "reasonable procedures to assure maximum possible accuracy of the information "
        "concerning the individual about whom the report relates."
    ),
    "1681g(a)(1)": (
        "Every consumer reporting agency shall, upon request, and subject to section "
        "1681h(a)(1) of this title, clearly and accurately disclose to the consumer: "
        "All information in the consumer's file at the time of the request"
    ),
    "1681i(a)(1)(a)": (
        "Subject to subsection (f) and except as provided in subsection (g), if the "
        "completeness or accuracy of any item of information contained in a consumer's file "
        "at a consumer reporting agency is disputed by the consumer and the consumer notifies "
        "the agency directly, or indirectly through a reseller, of such dispute, the agency "
        "shall, free of charge, conduct a reasonable reinvestigation to determine whether the "
        "disputed information is inaccurate"
    ),
    "1681i(a)(4)": (
        "In conducting any reinvestigation under paragraph (1) with respect to disputed "
        "information in the file of any consumer, the consumer reporting agency shall review "
        "and consider all relevant information submitted by the consumer"
    ),
    "1681i(a)(5)(a)": (
        "If, after any reinvestigation under paragraph (1) of any information disputed by a "
        "consumer, an item of the information is found to be inaccurate or incomplete or cannot "
        "be verified, the consumer reporting agency shall"
    ),
    "1681n(a)": (
        "Any person who willfully fails to comply with any requirement imposed under this "
        "subchapter with respect to any consumer is liable to that consumer"
    ),
}

SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
DATE_RE = re.compile(r"\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12]\d|3[01])/\d{4}\b")
MONEY_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d{2})?")
COURT_HEADER_RE = re.compile(r"IN THE UNITED STATES DISTRICT COURT", re.I)
COUNT_RE = re.compile(r"(?im)^\s*COUNT\s+([IVXLC]+|\d+)\b")
STATUTE_RE = re.compile(r"(?:15\s+U\.S\.C\.\s*)?§?\s*(1681[a-z](?:\([^)]*\))*)", re.I)

SENSITIVE_KEY_FRAGMENTS = (
    "ssn", "social", "social_security", "taxpayer", "tin", "ein",
    "account_number", "account_no", "accountnumber", "bank_account",
    "file_number", "report_number", "reference_number",
)
DOB_KEY_FRAGMENTS = ("date_of_birth", "birth_date", "birthdate", "dob")


# ---------------------------------------------------------------------------
# Fact-sheet redaction and runtime drafting context
# ---------------------------------------------------------------------------

def _key_is_sensitive(key: str) -> bool:
    normalized = key.lower().replace("-", "_").replace(" ", "_")
    return any(fragment in normalized for fragment in SENSITIVE_KEY_FRAGMENTS)


def _key_is_dob(key: str) -> bool:
    normalized = key.lower().replace("-", "_").replace(" ", "_")
    return any(fragment in normalized for fragment in DOB_KEY_FRAGMENTS)


def _last_four(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-4:] if len(digits) >= 4 else digits


def _birth_year(value: Any) -> str:
    match = re.search(r"(?:19|20)\d{2}", str(value or ""))
    return match.group(0) if match else ""


def _redact_inline_pii(value: str) -> str:
    value = SSN_RE.sub(lambda match: f"Social Security number ending in {match.group(0)[-4:]}", value)
    # Labeled long identifiers are reduced to their last four digits.  This is
    # intentionally limited to labels so dispute dates and report figures remain usable.
    def labeled_identifier(match: re.Match) -> str:
        label = match.group(1)
        raw = match.group(2)
        return f"{label} ending in {_last_four(raw)}"

    return re.sub(
        r"(?i)\b((?:account|acct|file|report|reference)\s*(?:number|no\.?|#)?\s*(?:is|:)?\s*)([\d\- ]{5,})",
        labeled_identifier,
        value,
    )


def redact_for_complaint(value: Any, key: str = "") -> Any:
    """Return a deep copy safe to give to the complaint drafter.

    The audit process may retain the raw worksheet elsewhere, but the pleading
    prompt only receives this redacted view.  Date-of-birth values retain only a
    year; identifiers retain only a last four reference.
    """
    if isinstance(value, dict):
        return {str(k): redact_for_complaint(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_for_complaint(item, key) for item in value]
    if value is None:
        return None
    if _key_is_dob(key):
        year = _birth_year(value)
        return f"Plaintiff was born in {year}" if year else "[birth year unavailable]"
    if _key_is_sensitive(key):
        suffix = _last_four(value)
        label = "file number" if "file" in key.lower() or "report" in key.lower() else "number"
        return f"{label} ending in {suffix}" if suffix else "[redacted]"
    if isinstance(value, str):
        return _redact_inline_pii(value)
    return copy.deepcopy(value)


def _walk_strings(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_strings(item)
    elif value is not None:
        yield str(value)


def _first_value(value: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = str(key).lower().replace(" ", "_")
            if normalized in keys and item not in (None, ""):
                return item
            nested = _first_value(item, keys)
            if nested not in (None, ""):
                return nested
    elif isinstance(value, list):
        for item in value:
            nested = _first_value(item, keys)
            if nested not in (None, ""):
                return nested
    return None


def _district_state(classification: dict) -> str:
    district = str(
        classification.get("district")
        or classification.get("filing_district")
        or classification.get("court")
        or ""
    ).upper()
    for state in ("GEORGIA", "FLORIDA", "ALABAMA", "TENNESSEE", "SOUTH CAROLINA", "TEXAS"):
        if state in district:
            return state
    return ""


def _address_state(fact_sheet: dict) -> str:
    state = _first_value(fact_sheet, ("state", "consumer_state", "plaintiff_state", "address_state"))
    if state:
        abbreviations = {"GA": "GEORGIA", "FL": "FLORIDA", "AL": "ALABAMA", "SC": "SOUTH CAROLINA", "TN": "TENNESSEE", "TX": "TEXAS"}
        return abbreviations.get(str(state).strip().upper(), str(state).strip().upper())
    for value in _walk_strings(fact_sheet):
        match = re.search(r"\b(GA|FL|AL|SC|TN|TX)\b", value.upper())
        if match:
            return {"GA": "GEORGIA", "FL": "FLORIDA", "AL": "ALABAMA", "SC": "SOUTH CAROLINA", "TN": "TENNESSEE", "TX": "TEXAS"}[match.group(1)]
    return ""


def _find_named_values(value: Any, keys: set[str]) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = str(key).lower().replace(" ", "_")
            if normalized in keys:
                found.append(item)
            found.extend(_find_named_values(item, keys))
    elif isinstance(value, list):
        for item in value:
            found.extend(_find_named_values(item, keys))
    return found


def _normalized_party_names(value: Any) -> set[str]:
    names: set[str] = set()
    for item in _find_named_values(value, {"plaintiff_name", "client_name", "full_name", "defendant_name", "creditor", "furnisher", "cra_name"}):
        if isinstance(item, str) and item.strip():
            names.add(item.strip().lower())
    for defendant_list in _find_named_values(value, {"defendants", "adverse_parties", "creditors"}):
        if isinstance(defendant_list, list):
            for defendant in defendant_list:
                name = defendant.get("name") if isinstance(defendant, dict) else defendant
                if isinstance(name, str) and name.strip():
                    names.add(name.strip().lower())
    return names


def _dispute_timeline(fact_sheet: dict) -> list[dict]:
    disclosures = _find_named_values(fact_sheet, {"post_dispute_disclosure_date", "disclosure_date", "report_date"})
    disclosure_date = next((_parse_date(value) for value in disclosures if _parse_date(value)), None)
    rows: list[dict] = []
    for dispute_list in _find_named_values(fact_sheet, {"disputes", "dispute_history", "written_disputes", "online_disputes"}):
        candidates = dispute_list if isinstance(dispute_list, list) else [dispute_list]
        for dispute in candidates:
            if not isinstance(dispute, dict):
                continue
            receipt = _parse_date(dispute.get("receipt_date") or dispute.get("received_date") or dispute.get("sent_date") or dispute.get("date"))
            if not receipt:
                continue
            deadline = receipt + timedelta(days=30)
            rows.append({
                "receipt_date": receipt.isoformat(),
                "deadline": deadline.isoformat(),
                "expired_before_disclosure": bool(disclosure_date and deadline <= disclosure_date),
            })
    return rows


def build_drafting_context(fact_sheet: dict, classification: dict) -> dict:
    """Build redacted, source-grounded context for a complaint draft."""
    redacted = redact_for_complaint(fact_sheet)
    filing_state = _district_state(classification)
    report_state = _address_state(fact_sheet)
    venue_conflict = bool(filing_state and report_state and filing_state != report_state)
    source_text = "\n".join(_walk_strings(redacted))
    state_law_claims = _find_named_values(fact_sheet, {"state_law_claim"})
    state_law_claim = next((claim for claim in state_law_claims if isinstance(claim, dict)), {})
    state_law_authorized = bool(state_law_claim.get("pre_suit_notice_date") or state_law_claim.get("notice_date"))
    party_names = _normalized_party_names(fact_sheet)
    party_names.update(_normalized_party_names(classification))
    is_cra_case = bool(re.search(r"trans\s*union|equifax|experian|consumer reporting agency|\bcra\b", source_text, re.I))
    return {
        "redacted_fact_sheet": redacted,
        "source_text": source_text,
        "source_money": {item.replace(" ", "") for item in MONEY_RE.findall(source_text)},
        "source_dates": set(DATE_RE.findall(source_text)),
        "source_counties": {match.group(1).lower() for match in re.finditer(r"\b([A-Za-z]+)\s+County\b", source_text)},
        "party_names": party_names,
        "is_cra_case": is_cra_case,
        "state_law_authorized": state_law_authorized,
        "dispute_timeline": _dispute_timeline(fact_sheet),
        "filing_state": filing_state,
        "report_state": report_state,
        "venue_conflict": venue_conflict,
        "venue_note": (
            "[ATTORNEY NOTE — VENUE CONFLICT] The available consumer address is in "
            f"{report_state.title()}, while the selected filing district is in {filing_state.title()}. "
            "Do not invent a county or residence. Verify personal jurisdiction and venue, including "
            "the defendant entity-residence theory under 28 U.S.C. § 1391(c)(2)."
            if venue_conflict else ""
        ),
        "has_adverse_action_document": bool(re.search(r"adverse[ -]?action|denied credit|notice of action", source_text, re.I)),
    }


# ---------------------------------------------------------------------------
# Credit-report audit engine
# ---------------------------------------------------------------------------

def _decimal(value: Any) -> Decimal | None:
    if value in (None, "", "N/A", "Unknown"):
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", str(value))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    raw = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%Y", "%b %Y", "%B %Y"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return date(parsed.year, parsed.month, parsed.day)
        except ValueError:
            continue
    return None


def _value(row: dict, *names: str) -> Any:
    lowered = {str(key).lower().replace(" ", "_"): item for key, item in row.items()}
    for name in names:
        if name in lowered:
            return lowered[name]
    return None


def _severity(value: Any) -> int:
    text = str(value or "").upper()
    if "CHARGE" in text or "C/O" in text or "CO" == text:
        return 180
    if "COL" in text:
        return 180
    if "RPO" in text or "REPO" in text:
        return 150
    match = re.search(r"(30|60|90|120|150|180)", text)
    return int(match.group(1)) if match else 0


def _history_items(row: dict) -> list[dict]:
    history = _value(row, "payment_history", "history", "payment_grid", "grid")
    if isinstance(history, list):
        return [item for item in history if isinstance(item, dict)]
    if isinstance(history, dict):
        return [{"month": key, "rating": value} for key, value in history.items()]
    return []


def _finding(identifier: str, account: str, detail: str, **fields: Any) -> dict:
    return {"id": identifier, "account": account, "detail": detail, **fields}


def audit_credit_report(fact_sheet: dict) -> list[dict]:
    """Produce mechanically observable tradeline findings from structured intake data.

    The intake analyst is instructed to produce ``credit_report.tradelines`` with
    report literals and a month-labelled payment history.  When a legacy fact
    sheet does not contain that structure, this function safely returns no
    findings rather than inventing data.
    """
    credit = fact_sheet.get("credit_report", {}) if isinstance(fact_sheet, dict) else {}
    tradelines = credit.get("tradelines") if isinstance(credit, dict) else None
    if not isinstance(tradelines, list):
        tradelines = fact_sheet.get("tradelines") if isinstance(fact_sheet, dict) else []
    if not isinstance(tradelines, list):
        return []

    findings: list[dict] = []
    for row in tradelines:
        if not isinstance(row, dict):
            continue
        account = str(_value(row, "name", "creditor", "account_name", "furnisher") or "Unnamed tradeline")
        balance = _decimal(_value(row, "balance"))
        high_balance = _decimal(_value(row, "high_balance"))
        payment_received = _decimal(_value(row, "payment_received", "payment"))
        last_payment = _value(row, "last_payment_made", "last_payment_date")
        pay_status = str(_value(row, "pay_status", "payment_status", "status") or "")
        terms = str(_value(row, "terms") or "")
        open_date = _parse_date(_value(row, "date_opened", "opened"))
        close_date = _parse_date(_value(row, "date_closed", "closed", "updated_date", "date_updated"))
        removal_date = _parse_date(_value(row, "removal_date", "estimated_removal_date"))
        history = _history_items(row)
        ratings = [str(item.get("rating") or item.get("status") or "") for item in history]
        severities = [_severity(rating) for rating in ratings]
        worst_grid = max(severities, default=0)
        status_severity = _severity(pay_status)

        if balance is not None and high_balance is not None and balance > high_balance:
            findings.append(_finding("C-01", account, f"Balance {balance} exceeds High Balance {high_balance}.", balance=str(balance), high_balance=str(high_balance)))
        if re.search(r"paid(?:\s+in\s+full)?|paid as agreed", pay_status, re.I) and payment_received == 0:
            findings.append(_finding("C-02", account, f"Pay Status is '{pay_status}' while Payment Received is $0."))
        if payment_received == 0 and last_payment:
            findings.append(_finding("C-03", account, f"Payment Received is $0 while Last Payment Made is '{last_payment}'."))
        if status_severity > worst_grid and worst_grid:
            findings.append(_finding("C-04", account, f"Pay Status '{pay_status}' is more severe than the worst grid rating."))
        if status_severity < worst_grid and re.search(r"paid|current", pay_status, re.I):
            findings.append(_finding("C-05", account, f"Pay Status '{pay_status}' is less severe than the worst grid rating."))
        if re.search(r"current account|paid as agreed", pay_status, re.I) and history and _severity(ratings[-1]) >= 30:
            findings.append(_finding("C-06", account, f"Pay Status '{pay_status}' conflicts with the most recent grid rating '{ratings[-1]}'."))
        if re.search(r"charge[ -]?off", pay_status, re.I) and not any("C/O" in rating.upper() or "CHARGE" in rating.upper() for rating in ratings):
            findings.append(_finding("C-07", account, "Charge-off status is shown without a C/O rating in the payment grid."))
        for item in history:
            rating = str(item.get("rating") or item.get("status") or "")
            paid = _decimal(item.get("payment") or item.get("amount_paid"))
            if _severity(rating) >= 30 and paid is not None and paid > 0:
                findings.append(_finding("C-08", account, f"Grid month {item.get('month', '[month]')} shows rating '{rating}' with reported payment {paid}."))
                break
        for earlier, later in zip(history, history[1:]):
            if _severity(earlier.get("rating") or earlier.get("status")) >= 120 and _severity(later.get("rating") or later.get("status")) == 0:
                paid = _decimal(later.get("payment") or later.get("amount_paid"))
                if paid == 0:
                    findings.append(_finding("C-09", account, f"Grid improves from '{earlier.get('rating')}' to '{later.get('rating')}' with Amount Paid $0."))
                    break
        rpo_index = next((idx for idx, rating in enumerate(ratings) if "RPO" in rating.upper() or "REPO" in rating.upper()), None)
        if rpo_index is not None and any(_severity(rating) == 0 for rating in ratings[rpo_index + 1:]):
            findings.append(_finding("C-10", account, "Payment grid contains an OK rating after a repossession rating."))
        if re.search(r"\$?0(?:\.00)?\s*(?:per|/)\s*month", terms, re.I) and high_balance is not None and high_balance > 0:
            findings.append(_finding("C-11", account, f"Terms '{terms}' state $0 per month although High Balance is {high_balance}."))
        if "per month" in terms.lower() and "semi-monthly" in terms.lower():
            findings.append(_finding("C-12", account, f"Terms frequency is internally inconsistent: '{terms}'."))
        months_match = re.search(r"\b(\d+)\s*(?:month|mo)\b", terms, re.I)
        if months_match and open_date and close_date:
            stated = int(months_match.group(1))
            elapsed = (close_date.year - open_date.year) * 12 + close_date.month - open_date.month
            if abs(stated - elapsed) > 1:
                findings.append(_finding("C-13", account, f"Terms state {stated} months, while open-to-closed span is approximately {elapsed} months."))
        if open_date and close_date and history:
            elapsed = max(0, (close_date.year - open_date.year) * 12 + close_date.month - open_date.month)
            if len(history) < elapsed:
                findings.append(_finding("C-14", account, f"Payment grid has {len(history)} months for an approximately {elapsed}-month reporting span."))
        if any(str(rating).strip().upper() == "X" for rating in ratings):
            findings.append(_finding("C-15", account, "Payment grid contains an unknown X rating in an otherwise-rated span."))
        if re.search(r"charge[ -]?off", pay_status, re.I) and any("COL" in rating.upper() for rating in ratings) and not bool(_value(row, "matching_collection_tradeline", "collection_tradeline")):
            findings.append(_finding("C-16", account, "Charge-off account contains COL ratings without a corresponding collection tradeline."))
        adverse = bool(_value(row, "adverse_information", "is_adverse")) or "adverse" in str(_value(row, "section", "report_section") or "").lower()
        if adverse and not removal_date:
            findings.append(_finding("C-17", account, "Adverse tradeline has no disclosed removal date."))
        if re.search(r"AID|disputed by consumer", str(_value(row, "remarks", "remark") or ""), re.I) and close_date and (date.today().year - close_date.year) >= 3:
            findings.append(_finding("C-18", account, "Long-closed account retains an AID/disputed-by-consumer remark."))

        if removal_date:
            implied_dofd = removal_date - timedelta(days=(7 * 365 + 180))
            first_terminal = next((item for item in history if _severity(item.get("rating") or item.get("status")) >= 30), None)
            grid_dofd = _parse_date(first_terminal.get("month")) if first_terminal else None
            if open_date and implied_dofd < open_date:
                findings.append(_finding("IMPOSSIBLE_DOFD", account, "Removal date implies a first delinquency date before the account was opened."))
            elif grid_dofd and implied_dofd > grid_dofd:
                findings.append(_finding("RE_AGED", account, "Removal date implies a later first delinquency date than the terminal delinquency chain."))
            elif grid_dofd and implied_dofd < grid_dofd:
                findings.append(_finding("EARLY_PURGE", account, "Removal date implies an earlier first delinquency date than the terminal delinquency chain."))
        elif adverse:
            findings.append(_finding("NO_DOFD_DISCLOSED", account, "No removal date / first delinquency date is disclosed for an adverse tradeline."))
    return findings


def findings_for_prompt(findings: list[dict]) -> str:
    if not findings:
        return "No structured credit-report audit findings are available; do not invent account-level findings."
    lines = []
    for finding in findings:
        lines.append(f"- {finding['id']} | {finding['account']}: {finding['detail']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Deterministic complaint validators
# ---------------------------------------------------------------------------

def _count_blocks(text: str) -> list[str]:
    """Return live count text only, excluding the downstream prayer/signature."""
    matches = list(COUNT_RE.finditer(text))
    if not matches:
        return []
    blocks: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start():end]
        end_marker = re.search(r"(?im)^\s*(?:JURY DEMAND|PRAYER FOR RELIEF|WHEREFORE|SIGNATURE BLOCK|DATED:)\b", block)
        blocks.append(block[:end_marker.start()] if end_marker else block)
    return blocks


def _count_statutes(block: str) -> set[str]:
    return {match.group(1).lower().replace(" ", "") for match in STATUTE_RE.finditer(block)}


def _normalize_statute_key(value: str) -> str:
    return value.lower().replace(" ", "")


def _final_factual_paragraph(text: str) -> int | None:
    first_count = COUNT_RE.search(text)
    prefix = text[:first_count.start()] if first_count else text
    numbers = [int(match.group(1)) for match in re.finditer(r"(?m)^\s*(\d+)\.\s+", prefix)]
    return max(numbers) if numbers else None


def _known_party_issues(text: str) -> list[str]:
    issues: list[str] = []
    if re.search(r"\bTransUnion(?:\s+LLC)?\b", text, re.I):
        issues.append("V-13: Use the byte-identical legal party name 'Trans Union, LLC' everywhere; do not use 'TransUnion'.")
    return issues


def _citation_present(sentence: str) -> bool:
    return bool(re.search(r"\b\d{1,4}\s+F\.(?:2d|3d|4th)|\bNo\.\s*[\w:.-]+|\b\d{4}\s+WL\s+\d+", sentence))


def validate_complaint_text(text: str, context: dict | None = None, findings: list[dict] | None = None) -> list[str]:
    """Return blocking V-01 through V-15 violations for draft plaintext."""
    context = context or {}
    findings = findings or []
    issues: list[str] = []
    normalized = text or ""

    # V-01 — PII never belongs in a federal complaint.
    if SSN_RE.search(normalized):
        issues.append("V-01: Complaint contains an unredacted Social Security number.")
    if re.search(r"(?i)(?:date of birth|dob)\s*[:\-]?\s*" + DATE_RE.pattern, normalized):
        issues.append("V-01: Complaint contains a full date of birth; use only a year if needed.")
    if re.search(r"(?i)(?:account|acct|file|report)\s*(?:number|no\.?|#)?\s*[:\-]?\s*\d[\d\- ]{5,}", normalized):
        issues.append("V-01: Complaint contains an unmasked account or file identifier.")

    # V-02 — venue conflict must be surfaced rather than silently reconciled.
    if context.get("venue_conflict") and "[ATTORNEY NOTE — VENUE CONFLICT]" not in normalized:
        issues.append("V-02: The consumer address conflicts with the filing district; the required bracketed venue-conflict note is missing.")
    if context.get("venue_conflict") and re.search(r"resid(?:es|ing)\s+in\s+[^\[]*" + re.escape(str(context.get("filing_state", ""))), normalized, re.I):
        issues.append("V-02: Complaint appears to state a filing-state residence despite the source-address venue conflict.")

    # V-03 — literal source grounding for dates, dollars, and counties.
    source_text = str(context.get("source_text") or "")
    source_money = set(context.get("source_money") or {item.replace(" ", "") for item in MONEY_RE.findall(source_text)})
    source_dates = set(context.get("source_dates") or DATE_RE.findall(source_text))
    source_counties = {str(item).lower() for item in (context.get("source_counties") or set())}
    allowed_money = {"$100", "$1,000", "$1000"}
    for amount in MONEY_RE.findall(normalized):
        if amount.replace(" ", "") not in source_money and amount.replace(" ", "") not in allowed_money:
            issues.append(f"V-03: Dollar amount {amount} is not mapped to source material or a permitted statutory range.")
            break
    for alleged_date in DATE_RE.findall(normalized):
        if source_dates and alleged_date not in source_dates:
            issues.append(f"V-03: Date {alleged_date} is not mapped to source material.")
            break
    for county in re.findall(r"\b([A-Za-z]+)\s+County\b", normalized):
        if source_counties and county.lower() not in source_counties:
            issues.append(f"V-03: County {county} County is not mapped to source material.")
            break

    # CRA state-law gate — state-law counts are excluded unless the intake
    # expressly includes the required pre-suit notice evidence.
    if context.get("is_cra_case") and not context.get("state_law_authorized") and re.search(r"O\.C\.G\.A\.|Fair Business Practices Act|\bFBPA\b", normalized, re.I):
        issues.append("V-04: CRA draft contains a state-law claim without an explicit sourced state_law_claim and pre-suit notice date.")

    # V-04 — a statute in the prayer must appear in a live count.
    blocks = _count_blocks(normalized)
    count_statutes = set().union(*(_count_statutes(block) for block in blocks)) if blocks else set()
    prayer_match = re.search(r"(?is)(?:PRAYER FOR RELIEF|WHEREFORE)(.*?)(?:SIGNATURE|DATED:|$)", normalized)
    if prayer_match:
        prayer_statutes = _count_statutes(prayer_match.group(1))
        for statute in prayer_statutes:
            if statute not in count_statutes and statute not in {"1681n", "1681o"}:
                issues.append(f"V-04: Prayer cites § {statute} without a live count.")
                break

    # V-05 — statutory quotation verifier.  Any quotation close to a cited
    # subsection is treated as a statutory quotation and must fail closed unless
    # it byte-matches a pinned local corpus entry for that exact subsection.
    for statute_match in STATUTE_RE.finditer(normalized):
        statute = _normalize_statute_key(statute_match.group(1))
        start = max(0, statute_match.start() - 250)
        end = min(len(normalized), statute_match.end() + 650)
        local_text = normalized[start:end]
        quoted_values = [next((piece for piece in quoted if piece), "") for quoted in re.findall(r'“([^”]+)”|"([^"]+)"', local_text)]
        if not quoted_values:
            continue
        corpus_quote = FCRA_QUOTE_CORPUS.get(statute)
        if not corpus_quote:
            issues.append(f"V-05: § {statute} is quoted without a pinned verified corpus entry.")
            continue
        if any(quoted_text and corpus_quote not in quoted_text for quoted_text in quoted_values):
            issues.append(f"V-05: Quoted language attributed to § {statute} does not match the pinned statute corpus.")

    # V-06 / V-07 — per-section willful and negligent FCRA count pairs.
    willful_targets: set[str] = set()
    negligent_targets: set[str] = set()
    for block in blocks:
        statutes = _count_statutes(block)
        targets = {item for item in statutes if item not in {"1681n", "1681o"}}
        if "1681n" in statutes:
            willful_targets.update(targets)
        if "1681o" in statutes:
            negligent_targets.update(targets)
            if re.search(r"statutory damages|punitive damages", block, re.I):
                issues.append("V-07: A negligent § 1681o count requests statutory or punitive damages.")
    for target in sorted(willful_targets - negligent_targets):
        issues.append(f"V-06: Willful § 1681n count for § {target} lacks a matching negligent § 1681o count.")

    # V-08 — every structured audit finding must be pleaded by identifier,
    # account name, and at least one literal value/month drawn from the report.
    for finding in findings:
        identifier = str(finding.get("id") or "")
        account = str(finding.get("account") or "")
        if identifier and identifier not in normalized:
            issues.append(f"V-08: Audit finding {identifier} for {account or 'a tradeline'} is absent from factual allegations.")
            break
        if account and account.lower() not in normalized.lower():
            issues.append(f"V-08: Audit finding {identifier} does not identify its source tradeline '{account}'.")
            break
        literal_values = [str(value) for key, value in finding.items() if key not in {"id", "account", "detail"} and value not in (None, "")]
        if literal_values and not any(value in normalized for value in literal_values):
            issues.append(f"V-08: Audit finding {identifier} lacks a literal report value or month label.")
            break

    # V-09 — unsupported adverse-action damages cannot be pleaded.
    if not context.get("has_adverse_action_document") and re.search(r"credit denial|denial of credit|higher interest rate|reduced credit limit", normalized, re.I):
        issues.append("V-09: Complaint pleads an adverse credit action without a source adverse-action document.")

    # V-10 — broad court/agency assertions require a reporter or docket citation in the same sentence.
    for sentence in re.split(r"(?<=[.!?])\s+", normalized):
        if re.search(r"\b(?:courts?|CFPB|FTC|agency|agencies)\b.*\b(?:held|consistently|guidance|consent order|enforcement)\b", sentence, re.I) and not _citation_present(sentence):
            issues.append("V-10: Court or agency assertion lacks a reporter or docket citation.")
            break

    # V-11 — renderer emits the court header; plaintext may not duplicate it.
    if len(COURT_HEADER_RE.findall(normalized)) > 0:
        issues.append("V-11: Plaintext complaint includes a court header; the renderer must emit the single caption/header.")

    # V-13 / V-14 / V-15.
    issues.extend(_known_party_issues(normalized))
    known_parties = {str(name).lower() for name in (context.get("party_names") or set())}
    for match in re.finditer(r"(?im)^\s*(?:Defendant|Plaintiff),?\s+([A-Z][A-Za-z .,&'-]{2,80})", normalized):
        name = match.group(1).strip().rstrip(".").lower()
        if known_parties and name not in known_parties and not (name == "trans union, llc" and any("trans" in party for party in known_parties)):
            issues.append(f"V-13: Party name '{match.group(1).strip()}' is not mapped to the supplied party record.")
            break
    final_fact = _final_factual_paragraph(normalized)
    incorporation_refs = re.findall(r"(?i)(?:incorporat(?:es|ing)|realleges).*?(?:paragraphs?|¶¶?)\s*1\s*(?:through|to)\s*(\d+)", normalized)
    if final_fact and incorporation_refs and any(int(ref) != final_fact for ref in incorporation_refs):
        issues.append(f"V-14: Count incorporation must reference factual paragraph {final_fact} consistently.")
    if final_fact and not incorporation_refs and blocks:
        issues.append("V-14: Counts must incorporate the computed final factual paragraph range.")

    # A dispute cannot be pleaded as a missed 30-day deadline when its deadline
    # had not elapsed before the supplied post-dispute disclosure date.
    for dispute in context.get("dispute_timeline") or []:
        if dispute.get("expired_before_disclosure"):
            continue
        receipt = _parse_date(dispute.get("receipt_date"))
        if not receipt:
            continue
        date_forms = {receipt.isoformat(), receipt.strftime("%m/%d/%Y"), receipt.strftime("%-m/%-d/%Y")}
        if any(form in normalized for form in date_forms) and re.search(r"30[ -]?day.{0,100}(?:violation|failed|expired|breach)", normalized, re.I | re.S):
            issues.append(f"V-15: The dispute received {receipt.isoformat()} had not reached its 30-day deadline before the source disclosure date.")
            break

    return list(dict.fromkeys(issues))


def assert_complaint_safe(text: str, context: dict | None = None, findings: list[dict] | None = None) -> None:
    issues = validate_complaint_text(text, context=context, findings=findings)
    if issues:
        raise ComplaintValidationError(issues)


def validate_docx_structure(document: Any) -> list[str]:
    """Validate renderer-visible V-11/V-12 safeguards against a python-docx Document."""
    issues: list[str] = []
    court_headers = sum(1 for paragraph in document.paragraphs if "IN THE UNITED STATES DISTRICT COURT" in paragraph.text.upper())
    if court_headers != 1:
        issues.append(f"V-11: DOCX contains {court_headers} court headers; exactly one is required.")
    for paragraph in document.paragraphs:
        if re.match(r"^\s*\d+\.\s+", paragraph.text):
            if paragraph.runs and all(bool(run.bold) or bool(run.underline) for run in paragraph.runs if run.text.strip()):
                issues.append("V-12: A numbered body paragraph is fully bold or underlined.")
                break
    return issues


def assert_docx_safe(document: Any) -> None:
    issues = validate_docx_structure(document)
    if issues:
        raise ComplaintValidationError(issues)
