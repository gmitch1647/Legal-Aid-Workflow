"""Generate editable Word derivatives for uploaded PDF complaints.

The source complaint stays byte-for-byte intact in storage.  A separate DOCX
copy is created only for attorney download.
"""

from __future__ import annotations

import tempfile
from pathlib import Path


def pdf_bytes_to_docx(pdf_bytes: bytes) -> bytes:
    """Convert PDF bytes to an editable DOCX byte stream.

    pdf2docx performs layout-aware conversion using PyMuPDF and python-docx.
    Temporary files are confined to the process temporary directory and are
    removed before this function returns.
    """
    if not pdf_bytes:
        raise ValueError("The uploaded complaint PDF is empty.")

    try:
        from pdf2docx import Converter
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("PDF-to-Word conversion is not available on this server.") from exc

    with tempfile.TemporaryDirectory(prefix="legalflow-complaint-") as temporary_directory:
        source_path = Path(temporary_directory) / "complaint.pdf"
        output_path = Path(temporary_directory) / "complaint.docx"
        source_path.write_bytes(pdf_bytes)

        converter = Converter(str(source_path))
        try:
            converter.convert(str(output_path), start=0, end=None)
        finally:
            converter.close()

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("The Word copy of this complaint could not be created.")
        return output_path.read_bytes()


def complaint_word_file_name(file_name: str) -> str:
    """Return a Word filename derived from a source complaint filename."""
    source = Path(file_name or "complaint.pdf")
    stem = source.stem.strip() or "complaint"
    return f"{stem}.docx"
