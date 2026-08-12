"""Regression tests for immutable source attachments and signing-PDF derivatives."""

import asyncio
import base64
import io
import os
import tempfile
import unittest
from datetime import datetime, timezone
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
        self.downloads[kwargs["path"]] = kwargs["file"]

    def remove(self, paths):
        self.removed_paths.extend(paths)


class _FakeSigningStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, _bucket_name):
        return self.bucket


class _FakeSigningQuery:
    def __init__(self, data=None):
        self.data = data or []
        self.update_payload = None
        self.insert_payloads = []
        self.eq_args = None
        self.filters = []

    def select(self, _fields):
        # Supabase creates a new query chain for every table select. Reset the
        # local filters so sequential lookups of client and attorney rows are
        # independent in this focused fixture.
        self.filters = []
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def insert(self, payload):
        self.insert_payloads.append(payload)
        return self

    def eq(self, column, value):
        self.eq_args = (column, value)
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = self.data
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        return SimpleNamespace(data=rows)


class _FakeSigningSupabase:
    def __init__(self, downloads=None, existing_session=None, table_rows=None):
        self.bucket = _FakeSigningBucket(downloads)
        self.storage = _FakeSigningStorage(self.bucket)
        table_rows = table_rows or {}
        self.queries = {
            "signing_sessions": _FakeSigningQuery(
                table_rows.get("signing_sessions", [existing_session] if existing_session else [])
            ),
            "signature_requests": _FakeSigningQuery(table_rows.get("signature_requests")),
            "case_documents": _FakeSigningQuery(table_rows.get("case_documents")),
            "cases": _FakeSigningQuery(table_rows.get("cases")),
            "profiles": _FakeSigningQuery(table_rows.get("profiles")),
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

    def test_representation_agreement_client_name_is_added_to_separate_signing_copy(self):
        source_doc = fitz.open()
        page = source_doc.new_page(width=612, height=792)
        page.insert_text(
            fitz.Point(56, 185),
            "This Agreement governs legal representation in Client's claims arising under the Fair",
            fontsize=10,
            fontname="helv",
        )
        page.insert_text(
            fitz.Point(56, 200),
            "Credit Reporting Act (“FCRA”), Fair Debt Collection Practices Act (“FDCPA”), and related state or federal consumer protection laws.",
            fontsize=10,
            fontname="helv",
        )
        source_pdf = source_doc.tobytes()
        source_doc.close()
        source_path = "signing/session-123/source_Oise Representation Agreement.pdf"
        supabase = _FakeSigningSupabase({source_path: source_pdf})

        signing_path = signing._ensure_session_pdf(supabase, {
            "id": "session-123",
            "original_path": source_path,
            "signer_name": "Jordan Alexandra Smith",
        })

        self.assertEqual(source_pdf, supabase.bucket.downloads[source_path])
        self.assertEqual(signing_path, "signing/session-123/client_named_Oise Representation Agreement.pdf")
        personalized_upload = supabase.bucket.uploads[-1]
        self.assertEqual(personalized_upload["path"], signing_path)
        rendered_doc = fitz.open(stream=personalized_upload["file"], filetype="pdf")
        rendered_text = rendered_doc[0].get_text()
        rendered_doc.close()
        self.assertIn("Client's Jordan Alexandra Smith claims", rendered_text)
        self.assertNotIn("Client's claims", rendered_text)

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

    def test_first_send_retry_returns_existing_session_without_duplicate_upload(self):
        session_id = "c49b4102-2ce6-422e-8db6-241ac8873ee0"
        existing_session = {
            "id": session_id,
            "token": "existing-token",
            "status": "awaiting_signature",
            "original_path": "signing/c49b4102/source_Settlement Agreement.pdf",
            "document_type": "settlement",
            "sent_by": "attorney-1",
        }
        supabase = _FakeSigningSupabase(existing_session=existing_session)
        upload = _FakeUpload(b"%PDF-1.7\nexisting-source", "Settlement Agreement.pdf", "application/pdf")

        with patch.dict(os.environ, {"FRONTEND_URL": "https://legalflow.example"}), patch.object(
            signing, "get_supabase", return_value=supabase
        ), patch.object(signing, "_get_current_user", _attorney_user):
            result = asyncio.run(
                signing.create_signing_session(
                    file=upload,
                    signer_name="Client Example",
                    signer_email="client@example.test",
                    title="Settlement Agreement",
                    submission_id=session_id,
                    authorization="Bearer token",
                )
            )

        self.assertTrue(result["reused"])
        self.assertEqual(result["session_id"], session_id)
        self.assertEqual(result["signing_url"], "https://legalflow.example/sign/existing-token")
        self.assertEqual(supabase.bucket.uploads, [])
        self.assertEqual(supabase.queries["signing_sessions"].insert_payloads, [])

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

    def _wide_signature_png(self):
        image = Image.new("RGBA", (360, 100), "white")
        for x in range(8, 352):
            y = 42 + ((x * 7) % 28)
            image.putpixel((x, y), (0, 0, 0, 255))
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
            document_type="settlement",
            return_placement=True,
        )

        self.assertTrue(signed_pdf.startswith(b"%PDF"))
        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["layout"], "horizontal")
        self.assertEqual(placement["page"], 4)
        self.assertNotEqual(placement["strategy"], "fallback_last_page")

    def test_uppercase_horizontal_settlement_labels_use_client_execution_line(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((72, 180), "IN WITNESS WHEREOF, this Agreement is executed.", fontsize=11)
        page.insert_text((72, 205), "BY:", fontsize=11)
        page.insert_text((324, 205), "DATE:", fontsize=11)
        page.insert_text((108, 220), "CLIENT EXAMPLE", fontsize=11)
        page.insert_text((72, 275), "COMPANY EXAMPLE, LLC", fontsize=11)
        page.insert_text((72, 322), "BY:", fontsize=11)
        page.insert_text((324, 322), "DATE:", fontsize=11)
        source_pdf = document.tobytes()
        document.close()

        _, placement = signing._embed_signature(
            source_pdf,
            self._signature_png(),
            "Client Example",
            "Client Example",
            document_type="settlement",
            return_placement=True,
        )

        self.assertEqual(placement["strategy"], "detected_execution_block")
        self.assertEqual(placement["page"], 0)
        self.assertEqual(placement["layout"], "horizontal")
        self.assertLess(placement["signature_rect"][3], 210)

    def test_settlement_without_execution_line_is_not_signed_in_footer(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((72, 160), "Settlement Agreement and Release", fontsize=12)
        source_pdf = document.tobytes()
        document.close()

        with self.assertRaisesRegex(ValueError, "could not locate the client By/Date execution line"):
            signing._embed_signature(
                source_pdf,
                self._signature_png(),
                "Client Example",
                "Client Example",
                document_type="settlement",
                return_placement=True,
            )

    def test_vertical_plaintiff_settlement_uses_signature_and_date_lines(self):
        document = fitz.open()
        page = document.new_page(width=612, height=792)
        page.insert_text((72, 420), '“Plaintiff”', fontsize=11)
        page.insert_text((72, 530), 'Alysha F. Davis', fontsize=11)
        page.insert_text((72, 572), 'Date', fontsize=11)
        source_pdf = document.tobytes()
        document.close()

        _, placement = signing._embed_signature(
            source_pdf,
            self._signature_png(),
            'Alysha Davis',
            'Alysha Davis',
            document_type='settlement',
            return_placement=True,
        )

        self.assertEqual(placement['strategy'], 'vertical_plaintiff_execution_block')
        self.assertEqual(placement['page'], 0)
        self.assertEqual(placement['layout'], 'vertical')
        self.assertLess(placement['signature_rect'][3], 530)
        self.assertGreater(placement['signature_rect'][1], 430)
        self.assertLess(placement['date_origin'][1], 572)

    def test_split_page_plaintiff_settlement_uses_execution_line_and_next_page_date(self):
        document = fitz.open()
        execution_page = document.new_page(width=612, height=792)
        execution_page.insert_text((72, 525), "AGREED AND ENTERED INTO AS OF THE EARLIEST DATE INDICATED BELOW.", fontsize=11)
        execution_page.insert_text((72, 570), '“Plaintiff”', fontsize=11)
        execution_page.insert_text((72, 680), 'Channetta Jamela Owens', fontsize=11)
        date_page = document.new_page(width=612, height=792)
        date_page.insert_text((72, 100), "Date", fontsize=11)
        trailing_page = document.new_page(width=612, height=792)
        trailing_page.insert_text((72, 90), "EXHIBIT A", fontsize=11)
        source_pdf = document.tobytes()
        document.close()

        signed_pdf, placement = signing._embed_signature(
            source_pdf,
            self._signature_png(),
            "Channetta Owens",
            "Channetta Owens",
            document_type="settlement",
            return_placement=True,
        )

        self.assertTrue(signed_pdf.startswith(b"%PDF"))
        self.assertEqual(placement["strategy"], "split_page_plaintiff_execution_block")
        self.assertEqual(placement["page"], 0)
        self.assertEqual(placement["date_page"], 1)
        self.assertEqual(placement["layout"], "vertical_split_page")
        self.assertGreater(placement["signature_rect"][1], 570)
        self.assertLess(placement["signature_rect"][3], 680)
        self.assertLessEqual(placement["date_origin"][1], 102)

        signed_document = fitz.open(stream=signed_pdf, filetype="pdf")
        self.assertIn(datetime.now(timezone.utc).strftime("%m/%d/%Y"), signed_document[1].get_text())
        self.assertNotIn(datetime.now(timezone.utc).strftime("%m/%d/%Y"), signed_document[0].get_text())
        signed_document.close()

    def test_horizontal_settlement_signature_stays_in_compact_text_safe_band(self):
        source_pdf = self._horizontal_settlement_execution_pdf()
        source = fitz.open(stream=source_pdf, filetype="pdf")
        execution_page = source[4]
        agreement_body = execution_page.search_for("IN WITNESS WHEREOF")[0]
        client_name = execution_page.search_for("CLIENT EXAMPLE")[0]
        source.close()

        _, placement = signing._embed_signature(
            source_pdf,
            self._wide_signature_png(),
            "Client Example",
            "Client Example",
            return_placement=True,
        )
        signature_rect = fitz.Rect(placement["signature_rect"])
        rendered_rect = fitz.Rect(placement["rendered_signature_rect"])

        self.assertEqual(placement["layout"], "horizontal")
        self.assertLessEqual(signature_rect.width, 160)
        self.assertGreaterEqual(rendered_rect.y0, agreement_body.y1 + 3)
        self.assertLessEqual(rendered_rect.y1, client_name.y0 - 2)
        self.assertLessEqual(rendered_rect.height, 25)

    def test_low_resolution_signature_is_upscaled_for_crisp_pdf_embedding(self):
        image = Image.new("RGBA", (42, 12), "white")
        for x in range(4, 38):
            image.putpixel((x, 4 + (x % 5)), (0, 0, 0, 255))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
        field = fitz.Rect(72, 500, 252, 528)

        fitted_png, fitted_rect = signing._fit_signature_image(payload.getvalue(), field)
        fitted_image = Image.open(io.BytesIO(fitted_png))

        self.assertGreaterEqual(fitted_image.width, round(fitted_rect.width * (300 / 72)))
        self.assertGreaterEqual(fitted_image.height, round(fitted_rect.height * (300 / 72)))
        self.assertGreaterEqual(fitted_rect.x0, field.x0)
        self.assertLessEqual(fitted_rect.x1, field.x1)

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

    def test_confirmed_oise_engagement_send_links_esther_and_updates_stage(self):
        supabase = _FakeSigningSupabase(table_rows={
            "cases": [{
                "id": "case-1",
                "client_id": "client-1",
                "plaintiff_name": "Client Example",
                "status": "attorney_review",
            }],
            "profiles": [
                {
                    "id": "client-1",
                    "full_name": "Client Example",
                    "email": "client@example.test",
                    "assigned_attorney_id": "esther-1",
                },
                {
                    "id": "esther-1",
                    "full_name": "Esther Oise",
                    "email": "oiselaw@example.test",
                    "role": "staff_attorney",
                    "firm_name": "Oise Law Group PC",
                },
            ],
        })

        with patch.object(signing, "get_supabase", return_value=supabase), patch.object(
            signing, "_get_current_user", _attorney_user
        ), patch.object(signing, "_generate_token", return_value="oise-token"), patch.object(
            signing.uuid, "uuid4", return_value="oise-session"
        ), patch("utils.email_service.send_email", new=AsyncMock(return_value=True)) as send_email:
            result = asyncio.run(
                signing.send_oise_engagement_contract(
                    signing.EngagementContractSendRequest(case_id="case-1", confirmed=True),
                    authorization="Bearer token",
                )
            )

        self.assertEqual(result["case_status"], "doc_sent_for_signature")
        self.assertFalse(result["reused"])
        session_record = supabase.queries["signing_sessions"].insert_payloads[0]
        self.assertEqual(session_record["sent_by"], "esther-1")
        self.assertEqual(session_record["attorney_name"], "Esther Oise")
        self.assertEqual(session_record["document_type"], signing.OISE_ENGAGEMENT_DOCUMENT_TYPE)
        self.assertEqual(supabase.queries["cases"].update_payload["status"], "doc_sent_for_signature")
        self.assertEqual(supabase.bucket.uploads[0]["file"], signing.OISE_ENGAGEMENT_TEMPLATE_PATH.read_bytes())
        self.assertEqual(send_email.await_count, 1)

    def test_oise_engagement_template_uses_explicit_client_execution_fields(self):
        template_bytes = signing.OISE_ENGAGEMENT_TEMPLATE_PATH.read_bytes()
        document = fitz.open(stream=template_bytes, filetype="pdf")
        placement = signing._execution_block_placement(document)
        document.close()

        self.assertIsNotNone(placement)
        self.assertEqual(placement["strategy"], "explicit_client_execution_block")
        self.assertEqual(placement["page"], 3)
        self.assertEqual(placement["layout"], "horizontal")
        self.assertLess(placement["signature_rect"][2], placement["date_origin"][0])

    def test_completed_oise_engagement_moves_case_to_documents_signed(self):
        source_path = "signing/engagement-session/source_Oise_Law_Group_Client_Representation_Agreement.pdf"
        session = {
            "id": "engagement-session",
            "token": "engagement-token",
            "status": "awaiting_signature",
            "original_path": source_path,
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "document_type": signing.OISE_ENGAGEMENT_DOCUMENT_TYPE,
            "case_id": "case-1",
            "client_id": "client-1",
            "sent_by": "attorney-1",
        }
        supabase = _FakeSigningSupabase(
            downloads={source_path: signing.OISE_ENGAGEMENT_TEMPLATE_PATH.read_bytes()},
            existing_session=session,
        )

        class _CompletionRequest:
            headers = {"x-forwarded-for": "198.51.100.50", "user-agent": "LegalFlow test"}
            client = SimpleNamespace(host="10.0.0.5")

            async def json(self):
                encoded = base64.b64encode(SigningPdfNormalizationTests()._signature_png()).decode("ascii")
                return {"signature": f"data:image/png;base64,{encoded}", "typed_name": "Client Example"}

        with patch.object(signing, "get_supabase", return_value=supabase), patch.object(
            signing, "notify_attorney_of_esign_event", new=AsyncMock(return_value=True)
        ), patch.object(signing, "_send_client_signed_copy", new=AsyncMock(return_value=True)) as signed_copy:
            result = asyncio.run(signing.complete_signing("engagement-token", _CompletionRequest()))

        self.assertEqual(result["status"], "signed")
        signed_copy.assert_awaited_once()
        self.assertEqual(supabase.queries["cases"].update_payload["status"], "documents_signed")
        self.assertEqual(supabase.queries["cases"].eq_args, ("id", "case-1"))
        self.assertEqual(
            supabase.queries["case_documents"].insert_payloads[0]["document_category"],
            "signed_contract",
        )

    def test_signed_client_copy_attaches_completed_pdf_once(self):
        session = {
            "id": "session-copy-1",
            "title": "Oise Law Group PC Representation Agreement",
            "document_type": signing.OISE_ENGAGEMENT_DOCUMENT_TYPE,
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "client_copy_sent_at": None,
        }
        supabase = _FakeSigningSupabase()
        signed_pdf = b"%PDF-1.7\nsigned-agreement"

        with patch("utils.email_service.send_email", new=AsyncMock(return_value=True)) as send_email:
            delivered = asyncio.run(signing._send_client_signed_copy(
                supabase,
                session,
                "signing/session-copy-1/signed_agreement.pdf",
                signed_pdf,
            ))

        self.assertTrue(delivered)
        self.assertEqual(send_email.await_args.kwargs["to"], "client@example.test")
        self.assertEqual(send_email.await_args.kwargs["attachments"][0]["content"], signed_pdf)
        self.assertTrue(send_email.await_args.kwargs["attachments"][0]["filename"].endswith(".pdf"))
        self.assertIn("client_copy_sent_at", supabase.queries["signing_sessions"].update_payload)

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
