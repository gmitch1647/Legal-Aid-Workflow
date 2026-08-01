"""Regression tests for the custom signer’s PDF normalization path."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from docx import Document

from routers import signing


class _FakeSigningBucket:
    def __init__(self):
        self.downloaded_paths = []
        self.uploads = []

    def download(self, path):
        self.downloaded_paths.append(path)
        return b"legacy-docx-content"

    def upload(self, **kwargs):
        self.uploads.append(kwargs)


class _FakeSigningStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, _bucket_name):
        return self.bucket


class _FakeSigningQuery:
    def __init__(self):
        self.update_payload = None
        self.eq_args = None

    def update(self, payload):
        self.update_payload = payload
        return self

    def eq(self, column, value):
        self.eq_args = (column, value)
        return self

    def execute(self):
        return None


class _FakeSigningSupabase:
    def __init__(self):
        self.bucket = _FakeSigningBucket()
        self.storage = _FakeSigningStorage(self.bucket)
        self.query = _FakeSigningQuery()

    def table(self, table_name):
        if table_name != "signing_sessions":
            raise AssertionError(f"Unexpected table: {table_name}")
        return self.query


class SigningPdfNormalizationTests(unittest.TestCase):
    def test_pdf_upload_is_preserved_and_canonicalized(self):
        pdf_bytes = b"%PDF-1.7\nminimal-pdf-content"

        normalized_bytes, filename = signing._normalize_upload_to_pdf(
            pdf_bytes,
            "Settlement Agreement.pdf",
            "application/pdf",
        )

        self.assertEqual(normalized_bytes, pdf_bytes)
        self.assertEqual(filename, "Settlement Agreement.pdf")

    def test_docx_upload_is_converted_before_creating_session(self):
        converted_pdf = b"%PDF-1.7\nconverted-content"

        with patch.object(signing, "_convert_docx_to_pdf", return_value=converted_pdf) as converter:
            normalized_bytes, filename = signing._normalize_upload_to_pdf(
                b"docx-content",
                "Settlement Agreement.docx",
                signing.DOCX_MIME_TYPE,
            )

        converter.assert_called_once_with(b"docx-content")
        self.assertEqual(normalized_bytes, converted_pdf)
        self.assertEqual(filename, "Settlement Agreement.pdf")

    def test_legacy_docx_session_is_upgraded_to_pdf_before_preview(self):
        supabase = _FakeSigningSupabase()
        session = {
            "id": "session-123",
            "original_path": "signing/session-123/original_agreement.docx",
        }
        converted_pdf = b"%PDF-1.7\nlegacy-converted"

        with patch.object(signing, "_convert_docx_to_pdf", return_value=converted_pdf):
            pdf_path = signing._ensure_session_pdf(supabase, session)

        self.assertEqual(pdf_path, "signing/session-123/original_agreement.pdf")
        self.assertEqual(session["original_path"], pdf_path)
        self.assertEqual(supabase.bucket.downloaded_paths, ["signing/session-123/original_agreement.docx"])
        self.assertEqual(supabase.bucket.uploads[0]["path"], pdf_path)
        self.assertEqual(supabase.bucket.uploads[0]["file"], converted_pdf)
        self.assertEqual(supabase.query.eq_args, ("id", "session-123"))

    def test_real_docx_is_converted_to_valid_pdf(self):
        document = Document()
        document.add_paragraph("LegalFlow signature test document")

        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "agreement.docx"
            document.save(docx_path)
            pdf_bytes = signing._convert_docx_to_pdf(docx_path.read_bytes())

        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 100)

    def test_non_pdf_non_docx_upload_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Only valid PDF and DOCX"):
            signing._normalize_upload_to_pdf(
                b"plain text",
                "notes.txt",
                "text/plain",
            )

    def test_path_is_reduced_to_safe_basename(self):
        self.assertEqual(signing._safe_filename("../../private.docx"), "private.docx")


if __name__ == "__main__":
    unittest.main()
