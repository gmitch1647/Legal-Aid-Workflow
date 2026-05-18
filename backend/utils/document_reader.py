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


def _read_image_with_vision(data: bytes, ext: str, storage_path: str) -> str:
    """Use Claude Vision to extract text from an image."""
    import base64
    import anthropic

    b64 = base64.standard_b64encode(data).decode("utf-8")
    media_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"

    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64,
                    },
                },
                {
                    "type": "text",
                    "text": "Extract ALL text from this image. Include every word, number, date, name, and message visible. If this is a screenshot of text messages, include the sender name, timestamp, and full message text for each message. Return ONLY the extracted text, nothing else.",
                },
            ],
        }],
    )

    extracted = response.content[0].text.strip()
    logger.info(f"Vision extracted {len(extracted)} chars from {storage_path}")
    return extracted


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

    # Check for image types — use Claude Vision to extract text
    ext = ft.split("/")[-1] if "/" in ft else ft
    if ext in _IMAGE_EXTENSIONS:
        try:
            return _read_image_with_vision(data, ext, storage_path)
        except Exception as e:
            logger.warning(f"Vision extraction failed for {storage_path}: {e}")
            return f"[Image file: {storage_path}. Could not extract text automatically.]"

    # Fallback – attempt plain-text decode
    logger.warning(
        "Unrecognised file type '%s' for %s – attempting plain-text decode.",
        file_type,
        storage_path,
    )
    return _read_txt(data)
