"""Render LegalFlow settlement closing statements as client-signable PDFs.

The layout intentionally mirrors the supplied one-page closing-statement example:
firm letterhead, a centered title, matter details, a short trust-account
paragraph, a four-line distribution table, settlement terms, and the client's
signature/date block. Monetary calculations use integer cents throughout.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = letter
LEFT = 0.82 * inch
RIGHT = PAGE_WIDTH - (0.82 * inch)
TEXT_WIDTH = RIGHT - LEFT


@dataclass(frozen=True)
class ClosingStatementData:
    firm_name: str
    firm_address: str
    firm_phone: str
    firm_email: str
    statement_date: str
    client_name: str
    case_number: str
    adverse_party: str
    account_reference: str
    gross_settlement_cents: int
    client_payout_cents: int
    paralegal_fee_cents: int
    attorney_fee_cents: int
    non_monetary_terms: str


def _clean(value: object, fallback: str = "") -> str:
    return str(value or fallback).strip()


def _format_money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    cents = abs(int(cents))
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


_ONES = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen",
)
_TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
_SCALES = ((1_000_000_000, "billion"), (1_000_000, "million"), (1_000, "thousand"))


def _whole_number_words(number: int) -> str:
    if number < 20:
        return _ONES[number]
    if number < 100:
        tens, remainder = divmod(number, 10)
        return _TENS[tens] if not remainder else f"{_TENS[tens]}-{_ONES[remainder]}"
    if number < 1_000:
        hundreds, remainder = divmod(number, 100)
        prefix = f"{_ONES[hundreds]} hundred"
        return prefix if not remainder else f"{prefix} {_whole_number_words(remainder)}"
    for value, label in _SCALES:
        if number >= value:
            high, remainder = divmod(number, value)
            prefix = f"{_whole_number_words(high)} {label}"
            return prefix if not remainder else f"{prefix} {_whole_number_words(remainder)}"
    return str(number)


def money_in_words(cents: int) -> str:
    """Return a title-cased monetary phrase suitable for the narrative sentence."""
    cents = int(cents)
    whole, fractional = divmod(abs(cents), 100)
    dollars = _whole_number_words(whole).title()
    dollar_label = "Dollar" if whole == 1 else "Dollars"
    if fractional:
        cents_words = _whole_number_words(fractional).title()
        cent_label = "Cent" if fractional == 1 else "Cents"
        phrase = f"{dollars} {dollar_label} and {cents_words} {cent_label}"
    else:
        phrase = f"{dollars} {dollar_label}"
    return f"Negative {phrase}" if cents < 0 else phrase


def _wrap_text(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    cleaned = re.sub(r"\s+", " ", _clean(text)).strip()
    if not cleaned:
        return []
    words = cleaned.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if stringWidth(candidate, font_name, font_size) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _draw_wrapped(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    *,
    font: str = "Times-Roman",
    size: float = 10,
    leading: float = 13,
) -> float:
    pdf.setFont(font, size)
    for line in _wrap_text(text, font, size, width):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def _draw_label_value(pdf: canvas.Canvas, label: str, value: str, y: float) -> float:
    pdf.setFont("Times-Bold", 10)
    pdf.drawString(LEFT, y, label)
    label_width = stringWidth(label, "Times-Bold", 10)
    pdf.setFont("Times-Roman", 10)
    pdf.drawString(LEFT + label_width + 4, y, value)
    return y - 16


def _trim_to_width(value: str, font: str, size: float, width: float) -> str:
    value = _clean(value)
    if stringWidth(value, font, size) <= width:
        return value
    ellipsis = "…"
    while value and stringWidth(value + ellipsis, font, size) > width:
        value = value[:-1]
    return value.rstrip() + ellipsis


def render_closing_statement(data: ClosingStatementData) -> bytes:
    """Return a one-page closing-statement PDF.

    Callers must validate that the stored attorney-fee remainder equals
    gross settlement minus the client payout and paralegal fee before calling.
    """
    expected_attorney_fee = (
        int(data.gross_settlement_cents)
        - int(data.client_payout_cents)
        - int(data.paralegal_fee_cents)
    )
    if expected_attorney_fee < 0:
        raise ValueError("Client payout and paralegal fee cannot exceed the gross settlement amount.")
    if int(data.attorney_fee_cents) != expected_attorney_fee:
        raise ValueError("Attorney fee must equal the remainder of the settlement distribution.")

    stream = io.BytesIO()
    pdf = canvas.Canvas(stream, pagesize=letter, pageCompression=1)
    pdf.setTitle("Settlement Closing Statement")
    pdf.setAuthor(_clean(data.firm_name, "LegalFlow"))

    # Geometry is anchored to the supplied one-page reference rather than to
    # flowing content.  This preserves its letterhead, divider, centered
    # underlined title, compact matter block, and execution section.
    header_y = 744
    divider_y = 685
    title_y = 640
    metadata_y = 613
    reference_table_left = 1.49 * inch
    reference_table_right = PAGE_WIDTH - (1.42 * inch)

    pdf.setFillColor(HexColor("#111827"))
    pdf.setFont("Times-Bold", 12)
    pdf.drawCentredString(
        PAGE_WIDTH / 2,
        header_y,
        _trim_to_width(_clean(data.firm_name, "LAW FIRM"), "Times-Bold", 12, TEXT_WIDTH),
    )
    pdf.setFont("Times-Roman", 9)
    firm_address = _clean(data.firm_address)
    if firm_address:
        pdf.drawCentredString(
            PAGE_WIDTH / 2,
            header_y - 14,
            _trim_to_width(firm_address, "Times-Roman", 9, TEXT_WIDTH),
        )
    contact = "  |  ".join(part for part in (_clean(data.firm_phone), _clean(data.firm_email)) if part)
    if contact:
        pdf.drawCentredString(
            PAGE_WIDTH / 2,
            header_y - 27,
            _trim_to_width(contact, "Times-Roman", 9, TEXT_WIDTH),
        )

    # Full-width rule beneath firm identity, matching the reference document.
    pdf.setLineWidth(0.75)
    pdf.line(LEFT, divider_y, RIGHT, divider_y)

    title = "SETTLEMENT CLOSING STATEMENT"
    pdf.setFont("Times-Bold", 11)
    pdf.drawCentredString(PAGE_WIDTH / 2, title_y, title)
    title_width = stringWidth(title, "Times-Bold", 11)
    pdf.setLineWidth(0.45)
    pdf.line((PAGE_WIDTH - title_width) / 2, title_y - 2.5, (PAGE_WIDTH + title_width) / 2, title_y - 2.5)

    y = metadata_y
    y = _draw_label_value(pdf, "Date:", _clean(data.statement_date), y)
    y = _draw_label_value(pdf, "Client:", _clean(data.client_name, "Client"), y)
    y = _draw_label_value(pdf, "Case No.:", _clean(data.case_number), y)
    y = _draw_label_value(pdf, "Adverse Party:", _clean(data.adverse_party, "Not specified"), y)
    y = _draw_label_value(pdf, "Re:", _clean(data.account_reference, "Settlement matter"), y)
    y -= 5

    intro = (
        "This Settlement Closing Statement sets forth the disbursement of the gross settlement "
        "proceeds in the above-referenced matter. The total settlement amount of "
        f"{money_in_words(data.gross_settlement_cents)} ({_format_money(data.gross_settlement_cents)}) "
        "has been received and deposited into the Firm’s IOLTA trust account, and is to be disbursed as follows:"
    )
    y = _draw_wrapped(pdf, intro, LEFT, y, TEXT_WIDTH, size=10, leading=12)
    y -= 7

    # Indented two-column distribution table with the total rule and alignment
    # taken directly from the uploaded reference layout.
    row_height = 17
    rows = [
        ("Statutory damages paid to client", int(data.client_payout_cents), False),
        ("Paralegal fees paid to the Firm", int(data.paralegal_fee_cents), False),
        ("Attorney fees paid to the Firm", int(data.attorney_fee_cents), False),
        ("TOTAL", int(data.gross_settlement_cents), True),
    ]
    table_top = y
    for index, (label, value, is_total) in enumerate(rows):
        row_y = table_top - (index * row_height)
        if is_total:
            pdf.setLineWidth(0.7)
            # Keep the rule visibly above, not through, the TOTAL text baseline.
            pdf.line(reference_table_left, row_y + 10, reference_table_right, row_y + 10)
            pdf.setFont("Times-Bold", 10)
        else:
            pdf.setFont("Times-Roman", 10)
        pdf.drawString(reference_table_left, row_y, label)
        pdf.drawRightString(reference_table_right, row_y, _format_money(value))
    y = table_top - (len(rows) * row_height) - 10

    terms = _clean(data.non_monetary_terms)
    if not terms:
        terms = (
            "In addition to the monetary consideration above, the settlement provides for the "
            "elimination and waiver of any and all obligations related to the Debt."
        )
    acknowledgment = (
        f"{terms} The Client acknowledges and approves the disbursement of the settlement "
        "funds as set forth above."
    )
    y = _draw_wrapped(pdf, acknowledgment, LEFT, y, TEXT_WIDTH, size=10, leading=12)
    y -= 15
    # Keep the execution block in the same lower-page position as the supplied
    # form when terms are short, while allowing longer terms to expand safely.
    y = min(y, 311)

    # Reference execution block: heading, approximately three-inch signature
    # line, printed client caption, and a shorter separate date line.
    pdf.setFont("Times-Bold", 10)
    pdf.drawString(LEFT, y, "APPROVED AND ACCEPTED:")
    y -= 39
    signature_line_width = 3.0 * inch
    pdf.setLineWidth(0.6)
    pdf.line(LEFT, y, LEFT + signature_line_width, y)
    y -= 12
    pdf.setFont("Times-Roman", 10)
    client_caption = _trim_to_width(
        f"{_clean(data.client_name, 'Client')}, Client",
        "Times-Roman",
        10,
        signature_line_width,
    )
    pdf.drawString(LEFT, y, client_caption)
    y -= 19
    pdf.drawString(LEFT, y, "Date:")
    pdf.line(LEFT + 33, y - 2, LEFT + (2.0 * inch), y - 2)

    pdf.save()
    return stream.getvalue()


__all__ = ["ClosingStatementData", "money_in_words", "render_closing_statement"]
