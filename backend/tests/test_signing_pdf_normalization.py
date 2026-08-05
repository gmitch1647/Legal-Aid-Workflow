"""Regression tests for immutable source attachments and signing-PDF derivatives."""

import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import fitz
from starlette.requests import Request
from docx import Document
from PIL import Image

from routers import signing


class _FakeSigningBucket:
    def __init__(self, downloads=None):
        self.downloaded_paths = []
        self.downloads = downloads or {}
        self.uploads = []
        self.removed_paths = []

    def download(self, path):
        self.downloaded_paths.append(path)
        if path in self.downloads:
            return self.downloads[path]
        raise RuntimeError("Object not found")

    def upload(self, **kwargs):
        self.uploads.append(kwargs)

    def remove(self, paths):
        self.removed_paths.extend(paths)


class _FakeSigningStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, _bucket_name):
        return self.bucket


class _FakeSigningQuery:
    def __init__(self):
        self.update_payload = None
        self.insert_payloads = []
        self.eq_args = None

    def update(self, payload):
        self.update_payload = payload
        return self

    def insert(self, payload):
        self.insert_payloads.append(payload)
        return self

    def eq(self, column, value):
        self.eq_args = (column, value)
        return self

    def execute(self):
        return SimpleNamespace(data=[])


class _FakeSigningSupabase:
    def __init__(self, downloads=None):
        self.bucket = _FakeSigningBucket(downloads)
        self.storage = _FakeSigningStorage(self.bucket)
        self.queries = {
            "signing_sessions": _FakeSigningQuery(),
            "signature_requests": _FakeSigningQuery(),
        }

    def table(self, table_name):
        return self.queries[table_name]


class _FakeUpload:
    def __init__(self, file_bytes, filename, content_type):
        self._file_bytes = file_bytes
        self.filename = filename
        self.content_type = content_type

    async def read(self):
        return self._file_bytes


async def _attorney_user(_authorization):
    return {"id": "attorney-1", "full_name": "Attorney Example", "role": "attorney"}


class SigningPdfNormalizationTests(unittest.TestCase):
    def test_pdf_source_is_preserved_without_conversion(self):
        pdf_bytes = b"%PDF-1.7\nminimal-pdf-content"

        file_name, content_type = signing._validate_source_attachment(
            pdf_bytes,
            "Settlement Agreement.pdf",
            "application/pdf",
        )

        self.assertEqual(file_name, "Settlement Agreement.pdf")
        self.assertEqual(content_type, "application/pdf")

    def test_docx_source_is_validated_without_conversion(self):
        docx_bytes = b"PK\x03\x04original-docx-content"

        with patch.object(signing, "_convert_docx_to_pdf") as converter:
            file_name, content_type = signing._validate_source_attachment(
                docx_bytes,
                "Settlement Agreement.docx",
                signing.DOCX_MIME_TYPE,
            )

        converter.assert_not_called()
        self.assertEqual(file_name, "Settlement Agreement.docx")
        self.assertEqual(content_type, signing.DOCX_MIME_TYPE)

    def test_docx_source_is_uploaded_byte_for_byte_when_session_is_created(self):
        source_bytes = b"PK\x03\x04original-docx-content"
        supabase = _FakeSigningSupabase()
        upload = _FakeUpload(source_bytes, "Settlement Agreement.docx", signing.DOCX_MIME_TYPE)

        with patch.object(signing, "get_supabase", return_value=supabase), patch.object(
            signing, "_get_current_user", _attorney_user
        ), patch.object(signing, "_generate_token", return_value="token-123"), patch.object(
            signing.uuid, "uuid4", return_value="session-123"
        ), patch.object(signing, "_convert_docx_to_pdf") as converter, patch(
            "utils.email_service.send_email", new=AsyncMock()
        ):
            asyncio.run(
                signing.create_signing_session(
                    file=upload,
                    signer_name="Client Example",
                    signer_email="client@example.test",
                    title="Settlement Agreement",
                    authorization="Bearer token",
                )
            )

        converter.assert_not_called()
        stored = supabase.bucket.uploads[0]
        self.assertEqual(stored["file"], source_bytes)
        self.assertEqual(stored["path"], "signing/session-123/source_Settlement Agreement.docx")
        self.assertEqual(stored["file_options"]["content-type"], signing.DOCX_MIME_TYPE)
        session_record = supabase.queries["signing_sessions"].insert_payloads[0]
        self.assertEqual(session_record["original_path"], stored["path"])

    def test_docx_session_generates_separate_pdf_without_mutating_source_path(self):
        source_path = "signing/session-123/source_agreement.docx"
        derivative_path = "signing/session-123/signing_agreement.pdf"
        source_bytes = b"PK\x03\x04original-docx-content"
        supabase = _FakeSigningSupabase({source_path: source_bytes})
        session = {"id": "session-123", "original_path": source_path}
        converted_pdf = b"%PDF-1.7\nlegacy-converted"

        with patch.object(signing, "_convert_docx_to_pdf", return_value=converted_pdf):
            pdf_path = signing._ensure_session_pdf(supabase, session)

        self.assertEqual(pdf_path, derivative_path)
        self.assertEqual(session["original_path"], source_path)
        self.assertEqual(supabase.bucket.uploads[0]["path"], derivative_path)
        self.assertEqual(supabase.bucket.uploads[0]["file"], converted_pdf)
        self.assertIsNone(supabase.queries["signing_sessions"].update_payload)

    def test_derivative_and_signed_paths_never_replace_source(self):
        source_path = "signing/session-123/source_agreement.docx"
        preview_path = signing._signing_pdf_path(source_path)
        signed_path = signing._signed_pdf_path(preview_path)

        self.assertEqual(preview_path, "signing/session-123/signing_agreement.pdf")
        self.assertEqual(signed_path, "signing/session-123/signed_agreement.pdf")
        self.assertNotEqual(source_path, preview_path)
        self.assertNotEqual(source_path, signed_path)

    def _two_party_execution_pdf(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((100, 590), "CLIENT EXAMPLE", fontsize=11)
        page.insert_text((100, 625), "By:", fontsize=11)
        page.insert_text((100, 655), "Date:", fontsize=11)
        page.insert_text((380, 590), "COMPANY EXAMPLE, LLC", fontsize=11)
        page.insert_text((380, 625), "By:", fontsize=11)
        page.insert_text((380, 655), "Title:", fontsize=11)
        page.insert_text((380, 685), "Date:", fontsize=11)
        pdf_bytes = document.tobytes()
        document.close()
        return pdf_bytes

    def _horizontal_settlement_execution_pdf(self):
        """Mirror a settlement agreement with a client execution page before Exhibit A."""
        document = fitz.open()
        for page_number in range(4):
            page = document.new_page(width=612, height=792)
            page.insert_text((72, 72), f"Settlement agreement page {page_number + 1}", fontsize=11)

        execution_page = document.new_page(width=612, height=792)
        execution_page.insert_text((72, 180), "IN WITNESS WHEREOF, this Agreement is executed.", fontsize=11)
        execution_page.insert_text((72, 205), "By:", fontsize=11)
        execution_page.insert_text((324, 205), "Date:", fontsize=11)
        execution_page.insert_text((108, 220), "CLIENT EXAMPLE", fontsize=11)
        execution_page.insert_text((72, 275), "COMPANY EXAMPLE, LLC", fontsize=11)
        # Preserve the sub-point x-coordinate variation found in PDFs produced
        # by the source agreement tool; it must still be treated as the same
        # signature column as the client field above.
        execution_page.insert_text((71.999984741, 322), "By:", fontsize=11)
        execution_page.insert_text((324, 322), "Date:", fontsize=11)
        execution_page.insert_text((108, 337), "One of its Attorneys", fontsize=11)

        exhibit_page = document.new_page(width=612, height=792)
        exhibit_page.insert_text((280, 110), "Exhibit A", fontsize=12)
        exhibit_page.insert_text((250, 160), "Click or tap here to enter text.", fontsize=10)

        pdf_bytes = document.tobytes()
        document.close()
        return pdf_bytes

    def _signature_png(self):
        image = Image.new("RGBA", (120, 30), "white")
        image.putpixel((5, 5), (0, 0, 0, 255))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
        return payload.getvalue()

    def test_execution_block_detector_selects_left_client_fields(self):
        document = fitz.open(stream=self._two_party_execution_pdf(), filetype="pdf")
        placement = signing._execution_block_placement(document)
        document.close()

        self.assertIsNotNone(placement)
        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["page"], 0)
        self.assertGreater(placement["signature_rect"][0], 110)
        self.assertLess(placement["signature_rect"][2], 380)
        self.assertLess(placement["date_origin"][0], 380)

    def test_embedding_uses_detected_execution_block_and_returns_audit_metadata(self):
        signed_pdf, placement = signing._embed_signature(
            self._two_party_execution_pdf(),
            self._signature_png(),
            "Client Example",
            "Client Example",
            return_placement=True,
        )

        self.assertTrue(signed_pdf.startswith(b"%PDF"))
        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["page"], 0)
        self.assertIn("rendered_signature_rect", placement)
        self.assertIn("date_style", placement)

    def test_horizontal_settlement_block_is_selected_before_trailing_exhibit(self):
        document = fitz.open(stream=self._horizontal_settlement_execution_pdf(), filetype="pdf")
        placement = signing._execution_block_placement(document)
        document.close()

        self.assertIsNotNone(placement)
        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["layout"], "horizontal")
        self.assertEqual(placement["page"], 4)
        self.assertGreater(placement["signature_rect"][0], 89)
        self.assertLess(placement["signature_rect"][2], 324)
        self.assertLess(placement["signature_rect"][3], 210)
        self.assertGreater(placement["date_origin"][0], 349)

    def test_horizontal_settlement_embedding_never_uses_exhibit_page(self):
        signed_pdf, placement = signing._embed_signature(
            self._horizontal_settlement_execution_pdf(),
            self._signature_png(),
            "Client Example",
            "Client Example",
            return_placement=True,
        )

        self.assertTrue(signed_pdf.startswith(b"%PDF"))
        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["layout"], "horizontal")
        self.assertEqual(placement["page"], 4)
        self.assertNotEqual(placement["strategy"], "fallback_last_page")

    def test_signature_image_is_trimmed_and_fitted_inside_execution_field(self):
        image = Image.new("RGBA", (300, 100), "white")
        # Simulate a signer drawing close to the canvas edges, including a
        # descender at the lower edge that must remain visible.
        for x in range(4, 296):
            image.putpixel((x, 10 + (x % 70)), (0, 0, 0, 255))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
        field = fitz.Rect(110, 590, 265, 640)

        fitted_png, fitted_rect = signing._fit_signature_image(payload.getvalue(), field)

        self.assertTrue(fitted_png.startswith(b"\x89PNG"))
        self.assertGreaterEqual(fitted_rect.x0, field.x0)
        self.assertGreaterEqual(fitted_rect.y0, field.y0)
        self.assertLessEqual(fitted_rect.x1, field.x1)
        self.assertLessEqual(fitted_rect.y1, field.y1)
        self.assertGreater(fitted_rect.height, 20)

    def test_date_style_tracks_nearby_times_style(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((100, 655), "Date:", fontsize=11, fontname="tiro")
        style = signing._nearby_text_style(page, fitz.Rect(100, 643, 130, 658))
        document.close()

        self.assertEqual(style["insert_font"], "tiro")
        self.assertEqual(style["font_size"], 11.0)

    def test_audit_ip_prefers_forwarded_client_address(self):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/signing/token/complete",
            "headers": [(b"x-forwarded-for", b"198.51.100.18, 10.0.0.3")],
            "client": ("10.0.0.3", 443),
            "scheme": "https",
            "server": ("legalflow.example", 443),
        }
        client_ip, source = signing._audit_client_ip(Request(scope))

        self.assertEqual(client_ip, "198.51.100.18")
        self.assertEqual(source, "x-forwarded-for")

    def test_embedding_falls_back_when_no_execution_fields_are_present(self):
        document = fitz.open()
        document.new_page(width=612, height=792).insert_text((72, 72), "No execution block")
        pdf_bytes = document.tobytes()
        document.close()

        _, placement = signing._embed_signature(
            pdf_bytes,
            self._signature_png(),
            "Client Example",
            "Client Example",
            return_placement=True,
        )

        self.assertEqual(placement["strategy"], "fallback_last_page")
        self.assertEqual(placement["page"], 0)

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
            signing._validate_source_attachment(
                b"plain text",
                "notes.txt",
                "text/plain",
            )

    def test_path_is_reduced_to_safe_basename(self):
        self.assertEqual(signing._safe_filename("../../private.docx"), "private.docx")


if __name__ == "__main__":
    unittest.main()
