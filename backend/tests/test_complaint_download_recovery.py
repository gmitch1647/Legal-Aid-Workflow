"""Regression coverage for recoverable attorney complaint downloads."""

import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import cases


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.update_payload = None

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def update(self, payload):
        self.update_payload = dict(payload)
        return self

    def execute(self):
        rows = self.rows
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        if self.update_payload is not None:
            for row in rows:
                row.update(self.update_payload)
            self.update_payload = None
        return SimpleNamespace(data=rows)


class _Bucket:
    def __init__(self):
        self.uploads = []
        self.signed_requests = []

    def upload(self, path, contents, options):
        self.uploads.append((path, contents, options))
        return {"path": path}

    def create_signed_url(self, path, expires_in):
        self.signed_requests.append((path, expires_in))
        return {"signedURL": f"https://storage.example.test/{path}?expires={expires_in}"}


class _Storage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, name):
        assert name == "documents"
        return self.bucket


class _Supabase:
    def __init__(self, complaint):
        self.tables = {
            "complaints": _Query([complaint]),
            "case_defendants": _Query([]),
            "defendants": _Query([]),
        }
        self.bucket = _Bucket()
        self.storage = _Storage(self.bucket)

    def table(self, name):
        return self.tables[name]


class ComplaintDownloadRecoveryTests(unittest.TestCase):
    def test_legacy_signed_url_becomes_its_storage_object_path(self):
        reference = "https://project.supabase.co/storage/v1/object/sign/documents/cases/a/complaint.docx?token=expired"
        self.assertEqual(
            cases._documents_storage_path_from_reference(reference),
            "cases/a/complaint.docx",
        )

    def test_plaintiff_name_uses_saved_case_value_before_legacy_facts(self):
        self.assertEqual(
            cases._plaintiff_name_from_case({"plaintiff_name": "Jane Doe", "case_facts": "Name: Old Name"}),
            "Jane Doe",
        )
        self.assertEqual(
            cases._plaintiff_name_from_case({"case_facts": "=== PLAINTIFF ===\nName: Jane Doe\n"}),
            "Jane Doe",
        )

    def test_missing_complaint_file_is_rebuilt_from_preserved_text(self):
        complaint = {
            "id": "complaint-1",
            "case_id": "case-1",
            "is_current": True,
            "version": 2,
            "complaint_text": "COMPLAINT\n1. The facts are preserved.",
            "complaint_docx_url": None,
        }
        supabase = _Supabase(complaint)
        case_row = {
            "id": "case-1",
            "plaintiff_name": "Jane Doe",
            "court": "United States District Court, Northern District of Georgia, Atlanta Division",
            "jury_demand": True,
        }
        with patch.object(cases, "get_supabase", return_value=supabase), \
             patch.object(cases, "get_current_user", new=AsyncMock(return_value={"id": "esther", "role": "staff_attorney"})), \
             patch.object(cases, "_fetch_case", return_value=case_row), \
             patch("utils.docx_formatter.generate_complaint_docx", return_value=io.BytesIO(b"docx-bytes")):
            result = asyncio.run(cases.download_complaint("case-1", "Bearer test-token"))

        expected_path = "cases/case-1/approved_complaint_v2.docx"
        self.assertEqual(supabase.bucket.uploads[0][0], expected_path)
        self.assertEqual(supabase.bucket.signed_requests, [(expected_path, 900)])
        self.assertEqual(complaint["complaint_docx_url"], expected_path)
        self.assertIn(expected_path, result["url"])


if __name__ == "__main__":
    unittest.main()
