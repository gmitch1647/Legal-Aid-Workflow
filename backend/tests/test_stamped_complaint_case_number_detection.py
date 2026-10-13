import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import fitz
from fastapi import UploadFile

from routers import documents
from utils.case_number_extractor import (
    case_number_from_text,
    extract_case_number_from_stamped_complaint,
)


class _Query:
    def __init__(self, rows, on_insert=None):
        self.rows = rows
        self.on_insert = on_insert
        self.filters = []
        self.insert_payload = None
        self.update_payload = None

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.filters.append((key, str(value)))
        return self

    def limit(self, _value):
        return self

    def insert(self, payload):
        self.insert_payload = dict(payload)
        return self

    def update(self, payload):
        self.update_payload = dict(payload)
        return self

    def execute(self):
        matches = self.rows
        for key, value in self.filters:
            matches = [row for row in matches if str(row.get(key)) == value]
        if self.insert_payload is not None:
            row = {**self.insert_payload, "id": "stamped-document-1"}
            self.rows.append(row)
            if self.on_insert:
                self.on_insert(row)
            return SimpleNamespace(data=[row])
        if self.update_payload is not None:
            for row in matches:
                row.update(self.update_payload)
            return SimpleNamespace(data=matches)
        return SimpleNamespace(data=matches)


class _Bucket:
    def __init__(self):
        self.uploads = []

    def upload(self, path, file, file_options=None):
        self.uploads.append((path, file, file_options or {}))

    def remove(self, _paths):
        return None


class _Supabase:
    def __init__(self):
        self.documents = []
        self.cases = [{"id": "case-1", "case_number": None}]
        self.bucket = _Bucket()
        self.storage = SimpleNamespace(from_=lambda _bucket: self.bucket)

    def table(self, name):
        if name == "case_documents":
            return _Query(self.documents)
        if name == "cases":
            return _Query(self.cases)
        raise AssertionError(f"Unexpected table: {name}")


class StampedComplaintCaseNumberDetectionTests(unittest.TestCase):
    def test_labeled_case_number_is_extracted_from_text(self):
        self.assertEqual(
            case_number_from_text("IN THE SUPERIOR COURT\nCase No.: 25-CV-1042\nPlaintiff v. Defendant"),
            "25-CV-1042",
        )

    def test_unlabeled_numbers_are_not_accepted_as_case_numbers(self):
        self.assertIsNone(case_number_from_text("Client DOB: 01/01/1980\nAccount: 123456789"))

    def test_embedded_pdf_case_number_is_detected(self):
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((72, 72), "Civil Action No. 1:25-cv-01234\nFILED")
        content = pdf.tobytes()
        pdf.close()

        number, source = extract_case_number_from_stamped_complaint(
            content,
            file_name="filed-complaint.pdf",
            file_type="application/pdf",
        )
        self.assertEqual(number, "1:25-cv-01234")
        self.assertEqual(source, "embedded_text")

    def test_upload_saves_detected_case_number_when_case_is_blank(self):
        supabase = _Supabase()
        upload = UploadFile(filename="Stamped Complaint.pdf", file=io.BytesIO(b"pdf bytes"))
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value={"id": "owner-1", "role": "attorney"})), \
             patch.object(documents, "_fetch_case_with_access", return_value={"id": "case-1", "client_id": "client-1", "case_number": None}), \
             patch("utils.case_number_extractor.extract_case_number_from_stamped_complaint", return_value=("25-CV-1042", "embedded_text")):
            result = asyncio.run(
                documents.upload_document("case-1", upload, "stamped_complaint", None, "Bearer test")
            )

        self.assertEqual(result["detected_case_number"], "25-CV-1042")
        self.assertTrue(result["case_number_auto_saved"])
        self.assertEqual(supabase.cases[0]["case_number"], "25-CV-1042")
        self.assertEqual(supabase.documents[0]["document_category"], "stamped_complaint")


if __name__ == "__main__":
    unittest.main()
