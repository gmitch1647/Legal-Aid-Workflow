import io
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

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
        tin_box_text = first_page.get_text("text", clip=fitz.Rect(420, 380, 550, 408))
        document.close()

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn("Test Taxpayer", text)
        self.assertIn("123 Main Street", text)
        self.assertEqual(tin_box_text.count("0"), 9)
        self.assertNotIn("203.0.113.10", text)

    def test_service_role_w9_lookup_is_scoped_to_creating_attorney(self):
        supabase = _FakeOwnedW9Supabase([{"id": "request-1", "sent_by": "attorney-1"}])

        row = w9._owned_w9_request(supabase, "request-1", {"id": "attorney-1"})

        self.assertEqual(row["id"], "request-1")
        self.assertIn(("id", "request-1"), supabase.query.filters)
        self.assertIn(("sent_by", "attorney-1"), supabase.query.filters)

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
