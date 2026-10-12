"""Render LegalFlow's unpaid court-cost ledger as a compact printable PDF."""
from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = letter
LEFT = 0.62 * inch
RIGHT = PAGE_WIDTH - LEFT
CONTENT_WIDTH = RIGHT - LEFT
HEADER_COLOR = HexColor("#0F172A")
ACCENT_COLOR = HexColor("#4F46E5")
MUTED_COLOR = HexColor("#64748B")
ROW_FILL = HexColor("#F8FAFC")


def _clean(value: object, fallback: str = "") -> str:
    """Normalize PDF text and remove control characters from stored records."""
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or fallback))
    return re.sub(r"\s+", " ", text).strip()


def _cents(value: object) -> int:
    try:
        return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except Exception:
        return 0


def _money(value: object) -> str:
    cents = _cents(value)
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


def _trim(value: object, font: str, size: float, width: float) -> str:
    text = _clean(value, "—")
    if stringWidth(text, font, size) <= width:
        return text
    ellipsis = "…"
    while text and stringWidth(text + ellipsis, font, size) > width:
        text = text[:-1]
    return f"{text.rstrip()}{ellipsis}"


def _draw_report_header(pdf: canvas.Canvas, generated_for: str, page_number: int) -> float:
    """Draw a repeated ledger header and return the first row baseline."""
    top = PAGE_HEIGHT - 0.58 * inch
    pdf.setFillColor(HEADER_COLOR)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(LEFT, top, "LegalFlow")
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(MUTED_COLOR)
    pdf.drawString(LEFT, top - 15, "Court Costs · Unpaid Matters Ledger")

    pdf.setFillColor(MUTED_COLOR)
    pdf.setFont("Helvetica", 8)
    prepared_for = _trim(generated_for or "Authorized LegalFlow user", "Helvetica", 8, 180)
    pdf.drawRightString(RIGHT, top, f"Prepared for: {prepared_for}")
    pdf.drawRightString(RIGHT, top - 12, datetime.now(timezone.utc).strftime("Generated %b %d, %Y %I:%M %p UTC"))
    pdf.drawRightString(RIGHT, top - 24, f"Page {page_number}")

    summary_y = top - 52
    pdf.setFillColor(ACCENT_COLOR)
    pdf.roundRect(LEFT, summary_y - 28, CONTENT_WIDTH, 35, 6, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(LEFT + 12, summary_y - 7, "Outstanding reimbursement requests")

    header_y = summary_y - 49
    pdf.setFillColor(HEADER_COLOR)
    pdf.setFont("Helvetica-Bold", 7.5)
    for label, x in (("MATTER / CLIENT", LEFT + 6), ("COURT / DESCRIPTION", LEFT + 182), ("DATE", LEFT + 342), ("STATUS", LEFT + 402), ("AMOUNT", RIGHT - 5)):
        if label == "AMOUNT":
            pdf.drawRightString(x, header_y, label)
        else:
            pdf.drawString(x, header_y, label)
    pdf.setStrokeColor(HexColor("#CBD5E1"))
    pdf.line(LEFT, header_y - 6, RIGHT, header_y - 6)
    return header_y - 22


def render_unpaid_court_costs_pdf(rows: Iterable[dict], generated_for: str = "") -> bytes:
    """Return a printable, multi-page PDF for authorized unpaid cost rows."""
    items = list(rows)
    total_cents = sum(_cents(item.get("amount")) for item in items)
    stream = io.BytesIO()
    pdf = canvas.Canvas(stream, pagesize=letter, pageCompression=1)
    pdf.setTitle("LegalFlow Unpaid Court Costs")
    pdf.setAuthor("LegalFlow")

    page_number = 1
    y = _draw_report_header(pdf, generated_for, page_number)
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(RIGHT - 12, PAGE_HEIGHT - 0.58 * inch - 59, f"{len(items)} request{'s' if len(items) != 1 else ''} · {_money(Decimal(total_cents) / 100)}")

    for index, item in enumerate(items):
        if y < 0.95 * inch:
            pdf.showPage()
            page_number += 1
            y = _draw_report_header(pdf, generated_for, page_number)

        if index % 2 == 0:
            pdf.setFillColor(ROW_FILL)
            pdf.rect(LEFT, y - 18, CONTENT_WIDTH, 25, fill=1, stroke=0)

        matter = _clean(item.get("case_label") or item.get("client_name"), "Unassigned matter")
        client = _clean(item.get("client_name"))
        court = _clean(item.get("court_name"), "Court not specified")
        description = _clean(item.get("description"), "No description")
        status = _clean(item.get("status"), "unpaid").replace("_", " ").title()
        expense_date = _clean(item.get("expense_date"), "—")

        pdf.setFillColor(HEADER_COLOR)
        pdf.setFont("Helvetica-Bold", 8.2)
        pdf.drawString(LEFT + 6, y, _trim(matter, "Helvetica-Bold", 8.2, 164))
        pdf.setFont("Helvetica", 7.2)
        pdf.setFillColor(MUTED_COLOR)
        pdf.drawString(LEFT + 6, y - 10, _trim(client, "Helvetica", 7.2, 164))

        pdf.setFillColor(HEADER_COLOR)
        pdf.setFont("Helvetica", 7.5)
        pdf.drawString(LEFT + 182, y, _trim(court, "Helvetica", 7.5, 148))
        pdf.setFillColor(MUTED_COLOR)
        pdf.drawString(LEFT + 182, y - 10, _trim(description, "Helvetica", 7.2, 148))

        pdf.setFillColor(HEADER_COLOR)
        pdf.setFont("Helvetica", 7.5)
        pdf.drawString(LEFT + 342, y - 2, _trim(expense_date, "Helvetica", 7.5, 50))
        pdf.drawString(LEFT + 402, y - 2, _trim(status, "Helvetica", 7.5, 64))
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawRightString(RIGHT - 5, y - 2, _money(item.get("amount")))
        y -= 27

    footer_y = max(0.6 * inch, y - 3)
    pdf.setStrokeColor(HexColor("#94A3B8"))
    pdf.line(LEFT, footer_y + 12, RIGHT, footer_y + 12)
    pdf.setFillColor(HEADER_COLOR)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(LEFT, footer_y, "Total outstanding")
    pdf.drawRightString(RIGHT, footer_y, _money(Decimal(total_cents) / 100))
    pdf.setFillColor(MUTED_COLOR)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(LEFT, footer_y - 13, "This report is an unpaid court-cost ledger and does not alter payment records.")

    pdf.save()
    return stream.getvalue()
