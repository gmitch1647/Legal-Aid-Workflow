import io
import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import fitz
from cryptography.fernet import Fernet
from PIL import Image
from pydantic import ValidationError
from starlette.requests import Request

from routers import w9


class _FakeOwnedW9Query:
    def __init__(self, data):
        self.data = data
        self.filters = []

    def select(self, _fields):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, _count):
        return self

    def order(self, _field, desc=False):
        self.order_by = (_field, desc)
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class _FakeOwnedW9Supabase:
    def __init__(self, data):
        self.query = _FakeOwnedW9Query(data)

    def table(self, table_name):
        if table_name != "w9_requests":
            raise AssertionError(f"Unexpected table: {table_name}")
        return self.query


class W9WorkflowTests(unittest.TestCase):
    def _submission(self, **overrides):
        values = {
            "legal_name": "Test Taxpayer",
            "business_name": "",
            "tax_classification": "individual",
            "llc_tax_classification": None,
            "address_line1": "123 Main Street",
            "address_line2": "",
            "city": "Austin",
            "state": "TX",
            "zip_code": "78701",
            "tin_type": "ssn",
            "tin": "000-00-0000",
            "typed_name": "Test Taxpayer",
            "signature": "data:image/png;base64,aGVsbG8td29ybGQtaW1hZ2U=",
            "certification_accepted": True,
        }
        values.update(overrides)
        return w9.W9Submission(**values)

    def _signature_png(self):
        image = Image.new("RGBA", (600, 180), "white")
        for x in range(25, 575):
            image.putpixel((x, 36 + (x % 85)), (0, 0, 0, 255))
        image.putpixel((572, 165), (0, 0, 0, 255))
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def test_tin_is_normalized_then_encrypted_with_no_plaintext_storage_value(self):
        submission = self._submission(tin="000-00-0000")
        key = Fernet.generate_key().decode("utf-8")

        with patch.dict(os.environ, {"W9_ENCRYPTION_KEY": key}):
            ciphertext = w9._encrypt_tin(submission.tin_digits)
            decrypted = w9._cipher().decrypt(ciphertext.encode("utf-8")).decode("utf-8")

        self.assertEqual(submission.tin_digits, "000000000")
        self.assertNotIn(submission.tin_digits, ciphertext)
        self.assertEqual(decrypted, "000000000")
        self.assertEqual(w9._mask_tin(submission.tin_digits, "ssn"), "***-**-0000")

    def test_submission_requires_certification_and_valid_llc_classification(self):
        with self.assertRaises(ValidationError):
            self._submission(certification_accepted=False)
        with self.assertRaises(ValidationError):
            self._submission(tax_classification="llc", llc_tax_classification=None)
        llc = self._submission(tax_classification="llc", llc_tax_classification="P", tin_type="ein")
        self.assertEqual(llc.llc_tax_classification, "P")

    def test_signature_fit_preserves_drawing_inside_official_w9_signature_area(self):
        signature = self._signature_png()
        field = fitz.Rect(150, 570, 360, 603)

        fitted_png, fitted_rect = w9._fit_signature_image(signature, field)

        self.assertTrue(fitted_png.startswith(b"\x89PNG"))
        self.assertGreaterEqual(fitted_rect.x0, field.x0)
        self.assertGreaterEqual(fitted_rect.y0, field.y0)
        self.assertLessEqual(fitted_rect.x1, field.x1)
        self.assertLessEqual(fitted_rect.y1, field.y1)
        self.assertGreater(fitted_rect.height, 10)

    def test_official_pdf_contains_completed_fields_but_no_audit_ip(self):
        submission = self._submission()
        pdf = w9._render_official_w9(submission, self._signature_png())
        document = fitz.open(stream=pdf, filetype="pdf")
        first_page = document[0]
        text = "\n".join(page.get_text() for page in document)
        # Each official W-9 TIN cell is a separate text insertion, so validate
        # the bounded box region rather than expecting one contiguous text token.
        tin_box_text = first_page.get_text("text", clip=fitz.Rect(417, 371, 577, 397))
        document.close()

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn("Test Taxpayer", text)
        self.assertIn("123 Main Street", text)
        self.assertEqual(tin_box_text.count("0"), 9)
        self.assertNotIn("203.0.113.10", text)

    def test_official_pdf_places_values_inside_calibrated_fields(self):
        submission = self._submission(
            legal_name="Aligned Taxpayer",
            business_name="Aligned Business",
            address_line1="742 Alignment Street",
            address_line2="Suite 402",
            city="Austin",
            state="TX",
            zip_code="78701",
        )
        pdf = w9._render_official_w9(submission, self._signature_png())
        document = fitz.open(stream=pdf, filetype="pdf")
        first_page = document[0]
        words = first_page.get_text("words")

        def word_rect(word, field):
            field_rect = fitz.Rect(field)
            match = next(
                item for item in words
                if item[4] == word and field_rect.contains(fitz.Rect(item[:4]))
            )
            return fitz.Rect(match[:4])

        self.assertTrue(fitz.Rect(w9.W9_FIELD_RECTS["legal_name"]).contains(word_rect("Aligned", w9.W9_FIELD_RECTS["legal_name"])))
        self.assertTrue(fitz.Rect(w9.W9_FIELD_RECTS["business_name"]).contains(word_rect("Business", w9.W9_FIELD_RECTS["business_name"])))
        self.assertTrue(fitz.Rect(w9.W9_FIELD_RECTS["address"]).contains(word_rect("742", w9.W9_FIELD_RECTS["address"])))
        self.assertTrue(fitz.Rect(w9.W9_FIELD_RECTS["city_state_zip"]).contains(word_rect("Austin,", w9.W9_FIELD_RECTS["city_state_zip"])))

        digit_words = first_page.get_text("words", clip=fitz.Rect(417, 371, 577, 397))
        zero_rects = [fitz.Rect(item[:4]) for item in digit_words if item[4] == "0"]
        self.assertEqual(len(zero_rects), 9)
        for digit_rect, cell in zip(zero_rects, w9.W9_TIN_BOX_RECTS["ssn"]):
            self.assertTrue(fitz.Rect(cell).contains(digit_rect))

        image_rects = []
        for image in first_page.get_images(full=True):
            image_rects.extend(first_page.get_image_rects(image[0]))
        self.assertTrue(any(fitz.Rect(w9.W9_FIELD_RECTS["signature"]).contains(rect) for rect in image_rects))
        document.close()

    def test_pending_w9_notification_reuses_secure_link_without_tin(self):
        request_row = {
            "id": "request-1",
            "token": "existing-secure-token",
            "signer_name": "Signer Test",
            "signer_email": "signer@example.com",
            "title": "Form W-9",
            "message": "Please complete this tax form.",
            "expires_at": "2026-08-30T00:00:00+00:00",
        }
        with patch.dict(os.environ, {"FRONTEND_URL": "https://app.example.test"}):
            with patch("utils.email_service.send_email", new=AsyncMock(return_value=True)) as send_email:
                sent = asyncio.run(w9._send_w9_signing_notification(request_row))

        self.assertTrue(sent)
        kwargs = send_email.await_args.kwargs
        self.assertEqual(kwargs["to"], "signer@example.com")
        self.assertIn("https://app.example.test/w9/existing-secure-token", kwargs["body"])
        self.assertNotIn("123456789", kwargs["body"])
        self.assertNotIn("completed_form_w9.pdf", kwargs["body"])

    def test_pending_w9_notification_requires_existing_token(self):
        sent = asyncio.run(w9._send_w9_signing_notification({"id": "request-1", "signer_email": "signer@example.com"}))
        self.assertFalse(sent)

    def test_completed_copy_email_uses_secure_link_without_tin(self):
        request_row = {
            "id": "request-1",
            "signer_name": "Signer Test",
            "signer_email": "signer@example.com",
            "title": "Form W-9",
        }
        with patch.dict(os.environ, {"FRONTEND_URL": "https://app.example.test"}):
            with patch("utils.email_service.send_email", new=AsyncMock(return_value=True)) as send_email:
                sent = asyncio.run(w9._send_w9_completed_copy_email(request_row, "secure-token"))

        self.assertTrue(sent)
        kwargs = send_email.await_args.kwargs
        self.assertEqual(kwargs["to"], "signer@example.com")
        self.assertIn("https://app.example.test/w9/secure-token", kwargs["body"])
        self.assertNotIn("123456789", kwargs["body"])
        self.assertNotIn("attachment", kwargs["body"].lower())

    def test_completed_copy_download_is_token_gated_and_private(self):
        class CopyQuery:
            def select(self, _fields):
                return self

            def eq(self, _field, _value):
                return self

            def limit(self, _count):
                return self

            def execute(self):
                return SimpleNamespace(data=[{"completed_pdf_path": "w9/request-1/completed_form_w9.pdf"}])

        class CopyStorage:
            def __init__(self):
                self.bucket = None
                self.path = None

            def from_(self, bucket):
                self.bucket = bucket
                return self

            def download(self, path):
                self.path = path
                return b"%PDF-test-copy"

        class CopySupabase:
            def __init__(self):
                self.query = CopyQuery()
                self.storage = CopyStorage()

            def table(self, table_name):
                self.table_name = table_name
                return self.query

        supabase = CopySupabase()
        with patch.object(w9, "get_supabase", return_value=supabase):
            with patch.object(w9, "_validate_token_session", return_value={"id": "request-1", "status": "complete"}):
                response = asyncio.run(w9.download_public_completed_w9_copy("secure-token"))

            self.assertEqual(response.body, b"%PDF-test-copy")
            self.assertEqual(response.headers["content-disposition"], 'attachment; filename="completed_form_w9.pdf"')
            self.assertEqual(response.headers["cache-control"], "private, no-store, max-age=0")
            self.assertEqual(supabase.table_name, "w9_submissions")
            self.assertEqual(supabase.storage.bucket, w9.W9_STORAGE_BUCKET)

            with patch.object(w9, "_validate_token_session", return_value={"id": "request-1", "status": "awaiting_submission"}):
                with self.assertRaises(w9.HTTPException) as raised:
                    asyncio.run(w9.download_public_completed_w9_copy("secure-token"))
            self.assertEqual(raised.exception.status_code, 409)

    def test_case_file_scanner_accepts_only_labeled_taxpayer_ids(self):
        detected_ssn = w9._detect_tin_from_text("Legal Name: Taylor Taxpayer\nSSN: 123-45-6789")
        detected_ein = w9._detect_tin_from_text("Employer Identification Number: 12-3456789")

        self.assertEqual(detected_ssn, {"tin": "123456789", "tin_type": "ssn"})
        self.assertEqual(detected_ein, {"tin": "123456789", "tin_type": "ein"})
        self.assertIsNone(w9._detect_tin_from_text("Account number: 123456789"))
        self.assertEqual(w9._detect_legal_name_from_text("Legal Name: Taylor Taxpayer"), "Taylor Taxpayer")

    def test_public_submission_accepts_blank_non_llc_classification(self):
        payload = w9.W9PublicSubmission(
            legal_name="Test Taxpayer",
            business_name="",
            tax_classification="individual",
            llc_tax_classification="",
            address_line1="123 Main Street",
            address_line2="",
            city="Austin",
            state="TX",
            zip_code="78701",
            tin_type="ssn",
            tin="123-45-6789",
            typed_name="Test Taxpayer",
            signature="data:image/png;base64,aGVsbG8td29ybGQtaW1hZ2U=",
            certification_accepted=True,
        )

        self.assertIsNone(payload.llc_tax_classification)

    def test_server_locked_prefill_overrides_public_name_and_tin(self):
        key = Fernet.generate_key().decode("utf-8")
        public_payload = w9.W9PublicSubmission(
            legal_name="Attempted Replacement",
            business_name="",
            tax_classification="individual",
            address_line1="123 Main Street",
            address_line2="",
            city="Austin",
            state="TX",
            zip_code="78701",
            tin_type="ein",
            tin="12-3456789",
            typed_name="Taylor Taxpayer",
            signature="data:image/png;base64,aGVsbG8td29ybGQtaW1hZ2U=",
            certification_accepted=True,
        )
        with patch.dict(os.environ, {"W9_ENCRYPTION_KEY": key}):
            cipher = w9._cipher()
            request_row = {
                "id": "request-1",
                "prefilled_legal_name": "Taylor Taxpayer",
                "prefilled_tin_ciphertext": cipher.encrypt(b"123456789").decode("utf-8"),
                "prefilled_tin_type": "ssn",
            }
            resolved = w9._resolve_w9_submission(request_row, public_payload, cipher)

        self.assertEqual(resolved.legal_name, "Taylor Taxpayer")
        self.assertEqual(resolved.tin_digits, "123456789")
        self.assertEqual(resolved.tin_type, "ssn")

    def test_unprefilled_public_fields_remain_available_to_signer(self):
        payload = w9.W9PublicSubmission(
            legal_name="Signer Provided Name",
            business_name="",
            tax_classification="individual",
            address_line1="123 Main Street",
            address_line2="",
            city="Austin",
            state="TX",
            zip_code="78701",
            tin_type="ein",
            tin="12-3456789",
            typed_name="Signer Provided Name",
            signature="data:image/png;base64,aGVsbG8td29ybGQtaW1hZ2U=",
            certification_accepted=True,
        )
        resolved = w9._resolve_w9_submission({}, payload, Fernet(Fernet.generate_key()))

        self.assertEqual(resolved.legal_name, "Signer Provided Name")
        self.assertEqual(resolved.tin_type, "ein")
        self.assertEqual(resolved.tin_digits, "123456789")

    def test_service_role_w9_lookup_is_scoped_to_creating_attorney(self):
        supabase = _FakeOwnedW9Supabase([{"id": "request-1", "sent_by": "attorney-1"}])

        row = w9._owned_w9_request(supabase, "request-1", {"id": "attorney-1"})

        self.assertEqual(row["id"], "request-1")
        self.assertIn(("id", "request-1"), supabase.query.filters)
        self.assertIn(("sent_by", "attorney-1"), supabase.query.filters)

    def test_attorney_w9_list_can_be_scoped_to_a_single_case(self):
        supabase = _FakeOwnedW9Supabase([{"id": "request-1", "case_id": "case-1"}])
        profile = {"id": "attorney-1", "role": "attorney"}

        with patch.object(w9, "get_supabase", return_value=supabase):
            with patch.object(w9, "_get_current_user", new=AsyncMock(return_value=profile)):
                rows = asyncio.run(w9.list_w9_requests(case_id="case-1"))

        self.assertEqual(rows, [{"id": "request-1", "case_id": "case-1"}])
        self.assertIn(("sent_by", "attorney-1"), supabase.query.filters)
        self.assertIn(("case_id", "case-1"), supabase.query.filters)
        self.assertEqual(supabase.query.order_by, ("created_at", True))

    def test_service_role_w9_lookup_hides_other_attorney_record(self):
        supabase = _FakeOwnedW9Supabase([])

        with self.assertRaises(w9.HTTPException) as raised:
            w9._owned_w9_request(supabase, "request-1", {"id": "attorney-2"})

        self.assertEqual(raised.exception.status_code, 404)

    def test_audit_prefers_forwarded_client_address(self):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/w9/token/complete",
            "headers": [(b"x-forwarded-for", b"203.0.113.10, 10.0.0.2")],
            "client": ("10.0.0.2", 443),
            "scheme": "https",
        }
        request = Request(scope)

        ip, source = w9._audit_client_ip(request)

        self.assertEqual(ip, "203.0.113.10")
        self.assertEqual(source, "x-forwarded-for")


if __name__ == "__main__":
    unittest.main()
