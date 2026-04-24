"""
Legal Document Formatter — generates court-ready .docx files.

Exact specifications:
- Times New Roman 12pt, black text, on every run
- 480-twip line spacing (true double spacing via LineRuleType.AUTO)
- Pt(12) space before AND after every paragraph
- 1-inch margins, US Letter page size
- Proper caption table with borders
- Centered bold section headers
- Three-line centered bold count headers
- Numbered paragraphs with hanging indent
- Justified body text
"""

import io
import re
import logging
from pathlib import Path

from docx import Document
from docx.shared import Pt, Inches, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Core formatting helpers
# ---------------------------------------------------------------------------

def _set_line_spacing_480(paragraph):
    """Set 480 twip line spacing (true double spacing) on a paragraph."""
    pPr = paragraph._element.get_or_add_pPr()
    spacing = pPr.find(qn("w:spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing")
        pPr.append(spacing)
    spacing.set(qn("w:line"), "480")
    spacing.set(qn("w:lineRule"), "auto")


def _format_paragraph(p, bold=False, centered=False, justified=False,
                      space_before=Pt(12), space_after=Pt(12),
                      indent_left=None, hanging=None,
                      underline=False):
    """Apply standard formatting to a paragraph."""
    _set_line_spacing_480(p)
    p.paragraph_format.space_before = space_before
    p.paragraph_format.space_after = space_after

    if centered:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif justified:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    if indent_left:
        p.paragraph_format.left_indent = indent_left
    if hanging:
        p.paragraph_format.first_line_indent = -hanging

    return p


def _add_run(paragraph, text, bold=False, underline=False):
    """Add a formatted run to a paragraph."""
    run = paragraph.add_run(text)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(0, 0, 0)
    run.bold = bold
    run.underline = underline
    return run


def _set_cell_borders(cell, top=True, bottom=True, left=True, right=True):
    """Set single black borders on a table cell."""
    tc = cell._element
    tcPr = tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for side in ["top", "bottom", "left", "right"]:
        if (side == "top" and not top) or (side == "bottom" and not bottom) or \
           (side == "left" and not left) or (side == "right" and not right):
            continue
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "8")
        el.set(qn("w:color"), "000000")
        el.set(qn("w:space"), "0")
        borders.append(el)
    tcPr.append(borders)


def _set_cell_margins(cell, top=120, bottom=120, left=120, right=120):
    """Set cell margins in twips."""
    tc = cell._element
    tcPr = tc.get_or_add_tcPr()
    margins = OxmlElement("w:tcMar")
    for side, val in [("top", top), ("bottom", bottom), ("start", left), ("end", right)]:
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        margins.append(el)
    tcPr.append(margins)


def _set_cell_width(cell, width_dxa):
    """Set cell width in DXA units."""
    tc = cell._element
    tcPr = tc.get_or_add_tcPr()
    tcW = OxmlElement("w:tcW")
    tcW.set(qn("w:w"), str(width_dxa))
    tcW.set(qn("w:type"), "dxa")
    tcPr.append(tcW)


def _add_cell_paragraph(cell, text, bold=False, space_before=Pt(6), space_after=Pt(6)):
    """Add a formatted paragraph to a table cell."""
    # Remove default empty paragraph if first call
    if len(cell.paragraphs) == 1 and not cell.paragraphs[0].text:
        p = cell.paragraphs[0]
    else:
        p = cell.add_paragraph()

    _set_line_spacing_480(p)
    p.paragraph_format.space_before = space_before
    p.paragraph_format.space_after = space_after

    run = p.add_run(text)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(0, 0, 0)
    run.bold = bold
    return p


# ---------------------------------------------------------------------------
# Main document generator
# ---------------------------------------------------------------------------

def generate_complaint_docx(
    complaint_text: str,
    plaintiff_name: str = "",
    defendant_names: list = None,
    court: str = "United States District Court, Northern District of Georgia, Atlanta Division",
    jury_demand: bool = True,
) -> io.BytesIO:
    """Generate a court-ready .docx complaint.

    Returns a BytesIO buffer containing the .docx file.
    """
    if defendant_names is None:
        defendant_names = []

    doc = Document()

    # ── Page setup ──────────────────────────────────────────────────────
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)

    # Default style
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    style.font.color.rgb = RGBColor(0, 0, 0)

    # ── Court header ────────────────────────────────────────────────────
    court_parts = court.split(",")
    court_lines = [p.strip() for p in court_parts] if court_parts else [
        "UNITED STATES DISTRICT COURT",
        "NORTHERN DISTRICT OF GEORGIA",
        "ATLANTA DIVISION",
    ]
    for i, line in enumerate(court_lines):
        p = doc.add_paragraph()
        _format_paragraph(p, centered=True,
                         space_before=Pt(0),
                         space_after=Pt(5) if i < len(court_lines) - 1 else Pt(15))
        _add_run(p, line.upper(), bold=True)

    # ── Caption table ───────────────────────────────────────────────────
    if plaintiff_name or defendant_names:
        table = doc.add_table(rows=1, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Set total table width
        tbl = table._tbl
        tblPr = tbl.tblPr if tbl.tblPr is not None else OxmlElement("w:tblPr")
        tblW = OxmlElement("w:tblW")
        tblW.set(qn("w:w"), "9360")
        tblW.set(qn("w:type"), "dxa")
        tblPr.append(tblW)

        left_cell = table.cell(0, 0)
        right_cell = table.cell(0, 1)

        # Set cell widths
        _set_cell_width(left_cell, 5200)
        _set_cell_width(right_cell, 4160)

        # Set borders and margins
        for cell in [left_cell, right_cell]:
            _set_cell_borders(cell)
            _set_cell_margins(cell)

        # Left cell — parties
        _add_cell_paragraph(left_cell, plaintiff_name.upper() if plaintiff_name else "PLAINTIFF NAME", bold=True)
        _add_cell_paragraph(left_cell, "Plaintiff,")
        _add_cell_paragraph(left_cell, "v.")
        for dname in defendant_names:
            _add_cell_paragraph(left_cell, dname.upper(), bold=True)
        _add_cell_paragraph(left_cell, "Defendants." if len(defendant_names) != 1 else "Defendant.")

        # Right cell — case info
        _add_cell_paragraph(right_cell, "CASE NO. _____________________")
        _add_cell_paragraph(right_cell, "")
        _add_cell_paragraph(right_cell, "Complaint for a civil case")
        _add_cell_paragraph(right_cell, "")
        if jury_demand:
            _add_cell_paragraph(right_cell, "Jury Trial:  ☒ Yes   ☐  No")
        else:
            _add_cell_paragraph(right_cell, "Jury Trial:  ☐ Yes   ☒  No")

        # Add spacing after table
        p = doc.add_paragraph()
        _format_paragraph(p, space_before=Pt(0), space_after=Pt(0))

    # ── Parse complaint text into formatted paragraphs ──────────────────
    lines = complaint_text.split("\n")

    for line in lines:
        stripped = line.strip()

        if not stripped:
            # Blank line
            p = doc.add_paragraph()
            _format_paragraph(p, space_before=Pt(0), space_after=Pt(0))
            continue

        upper = stripped.upper()

        # Detect TRIAL BY JURY
        if "TRIAL BY JURY" in upper and "DEMANDED" in upper:
            p = doc.add_paragraph()
            _format_paragraph(p, centered=True, space_before=Pt(16), space_after=Pt(20))
            _add_run(p, stripped, bold=True)
            continue

        # Detect section headers (all caps, known keywords)
        is_section_header = (
            stripped == upper
            and len(stripped) > 3
            and not stripped[0].isdigit()
            and any(kw in upper for kw in [
                "INTRODUCTION", "JURISDICTION", "PARTIES",
                "FACTUAL ALLEGATIONS", "PRAYER", "RELIEF",
                "FINDINGS", "EXHIBIT LIST", "JURY DEMAND",
            ])
        )

        # Detect count headers
        is_count_header = (
            upper.startswith("COUNT ") or
            "VIOLATION OF" in upper or
            (stripped.startswith("(") and stripped.endswith(")") and len(stripped) < 200)
        )

        # Detect numbered paragraphs
        numbered_match = re.match(r"^(\d+)\.\s*(.*)", stripped)

        # Detect prayer items (bold label: text)
        prayer_match = re.match(
            r"^(Declaratory Relief|Actual Damages|Statutory Damages|Punitive Damages|"
            r"Treble Damages|Attorney.s Fees|Other Relief|Pre.+Judgment):\s*(.*)",
            stripped, re.IGNORECASE
        )

        if is_section_header:
            p = doc.add_paragraph()
            _format_paragraph(p, centered=True, space_before=Pt(16), space_after=Pt(12))
            _add_run(p, stripped, bold=True, underline=True)

        elif is_count_header:
            p = doc.add_paragraph()
            # Determine spacing based on position in 3-line header
            sb = Pt(16) if upper.startswith("COUNT ") else Pt(4)
            sa = Pt(4) if not (stripped.startswith("(") and stripped.endswith(")")) else Pt(12)
            _format_paragraph(p, centered=True, space_before=sb, space_after=sa)
            _add_run(p, stripped, bold=True)

        elif numbered_match:
            num = numbered_match.group(1)
            text = numbered_match.group(2)
            p = doc.add_paragraph()
            _format_paragraph(p, justified=True,
                             indent_left=Inches(0.5), hanging=Inches(0.25))
            _add_run(p, f"{num}.\t{text}")

        elif prayer_match:
            label = prayer_match.group(1)
            text = prayer_match.group(2)
            p = doc.add_paragraph()
            _format_paragraph(p, justified=True)
            _add_run(p, f"{label}: ", bold=True)
            _add_run(p, text)

        elif upper.startswith("WHEREFORE"):
            p = doc.add_paragraph()
            _format_paragraph(p, justified=True, space_before=Pt(16))
            _add_run(p, stripped)

        elif stripped.startswith("Date:") or stripped.startswith("Plaintiff:") or \
             stripped.startswith("Address:") or stripped.startswith("Phone:") or \
             stripped.startswith("Email:"):
            # Signature block
            p = doc.add_paragraph()
            _format_paragraph(p, justified=True)
            _add_run(p, stripped)

        else:
            # Regular body paragraph
            p = doc.add_paragraph()
            _format_paragraph(p, justified=True)
            _add_run(p, stripped)

    # ── Save to buffer ──────────────────────────────────────────────────
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    # Validation
    logger.info(
        f"Generated complaint: {section.page_width.inches}x{section.page_height.inches} inches, "
        f"{len(doc.paragraphs)} paragraphs, "
        f"{'caption table present' if doc.tables else 'no caption table'}"
    )

    return buffer
