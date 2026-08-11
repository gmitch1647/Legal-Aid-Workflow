"""Regression tests for the reusable Supporting Documents library."""

import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

from routers import supporting_documents


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.mode = "select"
        self.payload = None
        self.inserted = []
        self.upserted = []

    def select(self, _columns):
        self.filters = []
        self.mode = "select"
        self.payload = None
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, set(values)))
        return self

    def limit(self, _value):
        return self

    def order(self, _column, desc=False):
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = dict(payload)
        self.inserted.append(dict(payload))
        return self

    def upsert(self, payload, on_conflict=None):
        self.mode = "upsert"
        self.payload = [dict(item) for item in payload]
        self.upserted.append({"payload": self.payload, "on_conflict": on_conflict})
        return self

    def delete(self):
        self.mode = "delete"
        return self

    def _filtered_rows(self):
        rows = list(self.rows)
        for kind, column, value in self.filters:
            if kind == "eq":
                rows = [row for row in rows if str(row.get(column)) == str(value)]
            elif kind == "in":
                rows = [row for row in rows if row.get(column) in value]
        return rows

    def execute(self):
        if self.mode == "insert":
            row = {**self.payload, "id": self.payload.get("id", "supporting-new")}
            self.rows.append(row)
            return SimpleNamespace(data=[row])
        if self.mode == "upsert":
            for row in self.payload:
                if not any(
                    existing.get("case_id") == row.get("case_id")
                    and existing.get("supporting_document_id") == row.get("supporting_document_id")
                    for existing in self.rows
                ):
                    self.rows.append({**row, "id": f"case-link-{len(self.rows) + 1}"})
            return SimpleNamespace(data=self.payload)
        if self.mode == "delete":
            matching = self._filtered_rows()
            self.rows[:] = [row for row in self.rows if row not in matching]
            return SimpleNamespace(data=matching)
        return SimpleNamespace(data=self._filtered_rows())


class _Bucket:
    def __init__(self):
        self.uploads = []
        self.removals = []

    def upload(self, path, file, file_options=None):
        self.uploads.append((path, file, file_options or {}))
        return {"path": path}

    def remove(self, paths):
        self.removals.append(list(paths))

    def create_signed_url(self, path, _expiry):
        return {"signedURL": f"https://example.test/{path}?signed=1"}


class _Storage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, name):
        assert name == "documents"
        return self.bucket


class _Supabase:
    def __init__(self, library_rows=None, attachment_rows=None):
        self.library = _Query(library_rows or [])
        self.attachments = _Query(attachment_rows or [])
        self.bucket = _Bucket()
        self.storage = _Storage(self.bucket)

    def table(self, name):
        tables = {
            "supporting_documents": self.library,
            "case_supporting_documents": self.attachments,
        }
        return tables[name]


class SupportingDocumentsLibraryTests(unittest.TestCase):
    profile = {"id": "attorney-1", "role": "attorney"}

    def _upload(self, filename, content):
        return UploadFile(filename=filename, file=io.BytesIO(content))

    def _patches(self, supabase):
        return (
            patch.object(supporting_documents, "get_supabase", return_value=supabase),
            patch.object(supporting_documents, "_get_current_user", new=AsyncMock(return_value=self.profile)),
            patch.object(supporting_documents, "_require_case_access", return_value={"id": "case-1"}),
        )

    def test_upload_creates_one_library_file_owned_by_current_attorney(self):
        supabase = _Supabase()
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            result = asyncio.run(supporting_documents.upload_supporting_document(
                self._upload("Equifax_Report.pdf", b"report"),
                "Frequently used Equifax report",
                "Bearer test",
            ))

        self.assertEqual(result["owner_id"], "attorney-1")
        self.assertEqual(result["storage_path"], "supporting/attorney-1/Equifax_Report.pdf")
        self.assertEqual(len(supabase.bucket.uploads), 1)
        self.assertEqual(supabase.library.inserted[0]["description"], "Frequently used Equifax report")

    def test_multiple_selected_library_documents_link_to_case_without_storage_copy(self):
        supabase = _Supabase(library_rows=[
            {"id": "supporting-1", "owner_id": "attorney-1", "file_name": "Report.pdf"},
            {"id": "supporting-2", "owner_id": "attorney-1", "file_name": "Letter.docx"},
        ])
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            result = asyncio.run(supporting_documents.attach_supporting_documents_to_case(
                "case-1", ["supporting-1", "supporting-2"], "Bearer test"
            ))

        self.assertEqual(result["attached_count"], 2)
        self.assertEqual(len(supabase.attachments.upserted), 1)
        self.assertEqual(supabase.attachments.upserted[0]["on_conflict"], "case_id,supporting_document_id")
        self.assertEqual(supabase.bucket.uploads, [])
        self.assertEqual(
            [row["supporting_document_id"] for row in supabase.attachments.upserted[0]["payload"]],
            ["supporting-1", "supporting-2"],
        )

    def test_access_url_cannot_be_created_for_another_attorneys_library_file(self):
        supabase = _Supabase(library_rows=[{
            "id": "other-document",
            "owner_id": "attorney-2",
            "storage_path": "supporting/attorney-2/private.pdf",
        }])
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(supporting_documents.get_supporting_document_access("other-document", "Bearer test"))

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(supabase.bucket.uploads, [])

    def test_delete_removes_metadata_and_library_storage_path(self):
        path = "supporting/attorney-1/Old_Template.pdf"
        supabase = _Supabase(library_rows=[{
            "id": "supporting-1",
            "owner_id": "attorney-1",
            "storage_path": path,
            "file_name": "Old_Template.pdf",
        }])
        get_supabase, current_user, case_access = self._patches(supabase)
        with get_supabase, current_user, case_access:
            result = asyncio.run(supporting_documents.delete_supporting_document("supporting-1", "Bearer test"))

        self.assertEqual(result["message"], "Supporting document deleted.")
        self.assertEqual(supabase.bucket.removals, [[path]])
        self.assertEqual(supabase.library.rows, [])


if __name__ == "__main__":
    unittest.main()
