"""Regression coverage for complaint Word exports and linked exhibit uploads."""

import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

from routers import documents


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.inserted = []
        self.updated = []

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def insert(self, payload):
        self.inserted.append(dict(payload))
        return self

    def update(self, payload):
        self.updated.append(dict(payload))
        return self

    def execute(self):
        if self.inserted:
            latest = {**self.inserted[-1], "id": self.inserted[-1].get("id", "new-document")}
            return SimpleNamespace(data=[latest])
        rows = self.rows
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        return SimpleNamespace(data=rows)


class _Bucket:
    def __init__(self, files=None):
        self.files = dict(files or {})
        self.uploads = []
        self.removals = []

    def upload(self, path, file, file_options=None):
        self.uploads.append((path, file, file_options or {}))
        self.files[path] = file
        return {"path": path}

    def download(self, path):
        return self.files[path]

    def remove(self, paths):
        self.removals.append(list(paths))
        for path in paths:
            self.files.pop(path, None)


class _Storage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, name):
        assert name == "documents"
        return self.bucket


class _Supabase:
    def __init__(self, rows=None, files=None):
        self.documents = _Query(rows or [])
        self.bucket = _Bucket(files)
        self.storage = _Storage(self.bucket)

    def table(self, name):
        assert name == "case_documents"
        return self.documents


class ComplaintExhibitAndWordDownloadTests(unittest.TestCase):
    def _upload(self, filename, payload):
        return UploadFile(filename=filename, file=io.BytesIO(payload))

    def _patches(self, supabase):
        return (
            patch.object(documents, "get_supabase", return_value=supabase),
            patch.object(documents, "_get_current_user", new=AsyncMock(return_value={"id": "attorney-1", "role": "attorney"})),
            patch.object(documents, "_fetch_case_with_access", return_value={"id": "case-1"}),
        )

    def test_pdf_complaint_upload_creates_separate_word_derivative(self):
        supabase = _Supabase()
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access, patch(
            "utils.complaint_word_converter.pdf_bytes_to_docx", return_value=b"PK\\x03\\x04complaint-docx"
        ):
            result = asyncio.run(documents.upload_document(
                "case-1",
                self._upload("Brown_Complaint.pdf", b"%PDF-1.7 complaint source"),
                "complaint",
                None,
                "Bearer test",
            ))

        self.assertEqual(result["document_category"], "complaint")
        self.assertEqual(result["storage_path"], "cases/case-1/Brown_Complaint.pdf")
        self.assertEqual(result["word_document_path"], "cases/case-1/Brown_Complaint.docx")
        uploaded_paths = [entry[0] for entry in supabase.bucket.uploads]
        self.assertEqual(uploaded_paths, ["cases/case-1/Brown_Complaint.pdf", "cases/case-1/Brown_Complaint.docx"])
        self.assertEqual(supabase.documents.inserted[0]["word_document_path"], "cases/case-1/Brown_Complaint.docx")

    def test_exhibit_is_stored_under_its_parent_complaint(self):
        supabase = _Supabase(rows=[{
            "id": "complaint-1", "case_id": "case-1", "document_category": "complaint",
        }])
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            result = asyncio.run(documents.upload_document(
                "case-1",
                self._upload("Credit_Report.pdf", b"%PDF-1.7 exhibit"),
                "complaint_exhibit",
                "complaint-1",
                "Bearer test",
            ))

        self.assertEqual(result["document_category"], "complaint_exhibit")
        self.assertEqual(result["parent_document_id"], "complaint-1")
        self.assertEqual(result["storage_path"], "cases/case-1/complaints/complaint-1/exhibits/Credit_Report.pdf")

    def test_exhibit_requires_uploaded_complaint_parent(self):
        supabase = _Supabase(rows=[{
            "id": "other-1", "case_id": "case-1", "document_category": "other",
        }])
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(documents.upload_document(
                    "case-1",
                    self._upload("Exhibit.pdf", b"%PDF"),
                    "complaint_exhibit",
                    "other-1",
                    "Bearer test",
                ))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("uploaded complaint", raised.exception.detail)

    def test_word_download_streams_docx_attachment_for_uploaded_complaint(self):
        word_path = "cases/case-1/Brown_Complaint.docx"
        supabase = _Supabase(
            rows=[{
                "id": "complaint-1",
                "case_id": "case-1",
                "file_name": "Brown_Complaint.pdf",
                "file_type": "application/pdf",
                "storage_path": "cases/case-1/Brown_Complaint.pdf",
                "word_document_path": word_path,
                "document_category": "complaint",
            }],
            files={word_path: b"PK\\x03\\x04word complaint"},
        )
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            response = asyncio.run(documents.get_uploaded_complaint_word_download(
                "case-1", "complaint-1", "Bearer test"
            ))

        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(response.body, b"PK\\x03\\x04word complaint")
        self.assertEqual(response.headers["content-disposition"], 'attachment; filename="Brown_Complaint.docx"')


if __name__ == "__main__":
    unittest.main()
