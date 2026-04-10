"""
Document reader utility.

Downloads a file from the Supabase Storage ``documents`` bucket and
extracts its text content.  Supports PDF, DOCX, plain-text, and basic
image placeholder handling.
"""

import io
import logging
from typing import Optional

from PyPDF2 import PdfReader
from docx import Document as DocxDocument

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "documents"


def _read_pdf(data: bytes) -> str:
    """Extract text from PDF bytes."""
    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _read_docx(data: bytes) -> str:
    """Extract text from DOCX bytes."""
    doc = DocxDocument(io.BytesIO(data))
    paragraphs: list[str] = []
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text)
    return "\n\n".join(paragraphs)


def _read_txt(data: bytes) -> str:
    """Decode plain-text bytes (UTF-8 with fallback to latin-1)."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1")


_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"}


def read_document(storage_path: str, file_type: str) -> str:
    """Download a file from Supabase Storage and return its text content.

    Parameters
    ----------
    storage_path:
        Path within the ``documents`` bucket (e.g. ``cases/<id>/file.pdf``).
    file_type:
        MIME type **or** file extension (e.g. ``application/pdf``, ``pdf``).

    Returns
    -------
    str
        Extracted text, or a placeholder message for unsupported types.
    """
    supabase = get_supabase()

    # Normalise file_type to a simple lowercase extension-style string
    ft = file_type.lower().strip()

    # Download file bytes from storage
    try:
        response = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
        if response is None:
            logger.error("Download returned None for path: %s", storage_path)
            return ""
        data: bytes = response
    except Exception:
        logger.exception("Failed to download %s from bucket '%s'", storage_path, STORAGE_BUCKET)
        raise

    # Route to the appropriate reader
    if ft in ("pdf", "application/pdf"):
        return _read_pdf(data)

    if ft in ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"):
        return _read_docx(data)

    if ft in ("txt", "text/plain", "text", "csv", "text/csv"):
        return _read_txt(data)

    # Check for image types
    ext = ft.split("/")[-1] if "/" in ft else ft
    if ext in _IMAGE_EXTENSIONS:
        return (
            f"[Image file received: {storage_path}] "
            "Image content cannot be extracted as text. "
            "Please review the image directly in the document viewer."
        )

    # Fallback – attempt plain-text decode
    logger.warning(
        "Unrecognised file type '%s' for %s – attempting plain-text decode.",
        file_type,
        storage_path,
    )
    return _read_txt(data)
