"""
Document reader utility.

Downloads a file from the Supabase Storage ``documents`` bucket and extracts
its text content. Supports PDF, modern and legacy Word documents, plain text,
and basic image placeholder handling.
"""

import io
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from PyPDF2 import PdfReader
from docx import Document as DocxDocument

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "documents"
DOC_MIME_TYPE = "application/msword"
DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
OLE_COMPOUND_FILE_HEADER = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


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


def _read_doc(data: bytes) -> str:
    """Extract legacy ``.doc`` text through LibreOffice's headless converter.

    Legacy Word documents use the OLE compound-file format, which
    ``python-docx`` does not support. The source bytes and the temporary DOCX
    derivative are removed immediately after extraction; only the user's
    original document remains in LegalFlow storage.
    """
    if not data.startswith(OLE_COMPOUND_FILE_HEADER):
        raise ValueError("The DOC upload is not a valid legacy Word document.")

    office_binary = shutil.which("libreoffice") or shutil.which("soffice")
    if not office_binary:
        raise RuntimeError("LibreOffice is unavailable for legacy Word document processing.")

    with tempfile.TemporaryDirectory(prefix="legalflow-read-doc-") as temporary_directory:
        workdir = Path(temporary_directory)
        source_path = workdir / "source.doc"
        source_path.write_bytes(data)
        office_profile = (workdir / "office-profile").as_uri()
        completed = subprocess.run(
            [
                office_binary,
                f"-env:UserInstallation={office_profile}",
                "--headless",
                "--nologo",
                "--nodefault",
                "--nofirststartwizard",
                "--convert-to",
                "docx",
                "--outdir",
                str(workdir),
                str(source_path),
            ],
            check=False,
            capture_output=True,
            timeout=60,
        )
        converted_path = workdir / "source.docx"
        if completed.returncode != 0 or not converted_path.exists():
            detail = (completed.stderr or completed.stdout or b"").decode("utf-8", errors="ignore").strip()
            logger.warning("LibreOffice could not convert a legacy Word document: %s", detail[:500])
            raise ValueError("The legacy Word document could not be read.")
        return _read_docx(converted_path.read_bytes())


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
    logger.info("Vision extracted %s chars from %s", len(extracted), storage_path)
    return extracted


def extract_document_text(data: bytes, file_type: str, storage_path: str = "uploaded-document") -> str:
    """Return readable text from document bytes.

    ``file_type`` may be a MIME type or a lower-case extension. This shared
    helper ensures legacy Word documents work consistently wherever LegalFlow
    must inspect a file, including closing statements, drafting, and case-law
    indexing.
    """
    file_kind = str(file_type or "").lower().strip()
    if file_kind in ("pdf", "application/pdf"):
        return _read_pdf(data)
    if file_kind in ("docx", DOCX_MIME_TYPE):
        return _read_docx(data)
    if file_kind in ("doc", DOC_MIME_TYPE):
        return _read_doc(data)
    if file_kind in ("txt", "text/plain", "text", "csv", "text/csv"):
        return _read_txt(data)

    extension = file_kind.split("/")[-1] if "/" in file_kind else file_kind
    if extension in _IMAGE_EXTENSIONS:
        try:
            return _read_image_with_vision(data, extension, storage_path)
        except Exception as exc:
            logger.warning("Vision extraction failed for %s: %s", storage_path, exc)
            return f"[Image file: {storage_path}. Could not extract text automatically.]"

    logger.warning("Unrecognised file type '%s' for %s – attempting plain-text decode.", file_type, storage_path)
    return _read_txt(data)


def read_document(storage_path: str, file_type: str) -> str:
    """Download a file from Supabase Storage and return its text content."""
    supabase = get_supabase()
    try:
        response = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
        if response is None:
            logger.error("Download returned None for path: %s", storage_path)
            return ""
        data: bytes = response
    except Exception:
        logger.exception("Failed to download %s from bucket '%s'", storage_path, STORAGE_BUCKET)
        raise

    return extract_document_text(data, file_type, storage_path)
