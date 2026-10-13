"""Extract a court case number from a filed or stamped complaint."""

from __future__ import annotations

import io
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Courts use several labels, but all reliable detections are tied to one of
# these labels. Requiring a number avoids accepting a blank line, a generic
# "Case No." placeholder, or a party name as a docket number.
_CASE_NUMBER_PATTERNS = (
    re.compile(
        r"(?im)\b(?:civil\s+action|case)\s+(?:number|no\.?|#)\s*[:#\-]?\s*"
        r"([A-Z0-9][A-Z0-9._:/\- ]{1,100})"
    ),
    re.compile(
        r"(?im)\b(?:docket|file)\s+(?:number|no\.?|#)\s*[:#\-]?\s*"
        r"([A-Z0-9][A-Z0-9._:/\- ]{1,100})"
    ),
    re.compile(
        r"(?im)\b(?:civil\s+action|case|docket|file)\s*[:#]\s*"
        r"([A-Z0-9][A-Z0-9._:/\- ]{1,100})"
    ),
)

_STOP_WORDS = re.compile(
    r"\s+(?:judge|division|court|filed|plaintiff|defendant|vs?\.?|v\.?|in\s+the)\b",
    re.IGNORECASE,
)


def _clean_candidate(value: str) -> Optional[str]:
    """Return a conservative docket-number candidate or ``None``."""
    candidate = re.sub(r"\s+", " ", str(value or "")).strip()
    candidate = _STOP_WORDS.split(candidate, maxsplit=1)[0].strip(" .,:;#-–—")
    candidate = re.sub(r"\s*[-–—]\s*$", "", candidate).strip()

    if not candidate or not re.search(r"\d", candidate):
        return None
    if len(candidate) < 3 or len(candidate) > 80:
        return None
    # Docket numbers can contain a colon, slash, period, hyphen and spaces,
    # but should not contain prose or arbitrary punctuation.
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._:/\-]*", candidate):
        return None
    return candidate


def case_number_from_text(text: str) -> Optional[str]:
    """Extract the first confidently labeled court case number from text."""
    for pattern in _CASE_NUMBER_PATTERNS:
        for match in pattern.finditer(text or ""):
            candidate = _clean_candidate(match.group(1))
            if candidate:
                return candidate
    return None


def _pdf_text(data: bytes) -> str:
    import fitz

    document = fitz.open(stream=data, filetype="pdf")
    try:
        # The caption is ordinarily on page one; four pages permits courts that
        # place filing headers after a cover sheet without scanning large files.
        return "\n".join(page.get_text("text") or "" for page in document[:4])
    finally:
        document.close()


def _ocr_pdf_text(data: bytes) -> str:
    """OCR the first two PDF pages only when their embedded text is unusable."""
    import fitz
    import pytesseract
    from PIL import Image

    document = fitz.open(stream=data, filetype="pdf")
    try:
        pages: list[str] = []
        for page in document[:2]:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.open(io.BytesIO(pixmap.tobytes("png")))
            pages.append(pytesseract.image_to_string(image, config="--psm 6"))
        return "\n".join(pages)
    finally:
        document.close()


def extract_case_number_from_stamped_complaint(
    data: bytes,
    file_name: str = "stamped-complaint",
    file_type: str = "",
) -> tuple[Optional[str], Optional[str]]:
    """Return ``(case_number, source)`` for a readable filed complaint.

    Embedded PDF text is preferred. If the filing is a scan, a bounded OCR
    fallback reads its first two pages. Word files use the shared LegalFlow
    document reader. Extraction failures are deliberately non-fatal: the
    attorney can always enter or correct the number manually.
    """
    extension = Path(file_name or "").suffix.lower()
    normalized_type = str(file_type or "").lower().strip()

    try:
        if extension == ".pdf" or normalized_type == "application/pdf":
            embedded_text = _pdf_text(data)
            detected = case_number_from_text(embedded_text)
            if detected:
                return detected, "embedded_text"
            try:
                ocr_text = _ocr_pdf_text(data)
                detected = case_number_from_text(ocr_text)
                if detected:
                    return detected, "ocr"
            except Exception as exc:
                logger.info("Stamped complaint OCR unavailable for %s: %s", file_name, exc)
            return None, None

        if extension in {".doc", ".docx"}:
            from utils.document_reader import extract_document_text

            text = extract_document_text(data, extension.lstrip("."), file_name)
            detected = case_number_from_text(text)
            return (detected, "embedded_text") if detected else (None, None)
    except Exception as exc:
        logger.warning("Could not extract case number from stamped complaint %s: %s", file_name, exc)

    return None, None
