"""Regression coverage for authorization-scoped case document links."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import documents


class _FakeBucket:
    def __init__(self):
        self.requests = []

    def create_signed_url(self, path, expires_in):
        self.requests.append((path, expires_in))
        return {"signedURL": f"https://storage.example.test/{path}?expires={expires_in}"}


class _FakeStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, _bucket_name):
        return self.bucket


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = self.rows
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        return SimpleNamespace(data=rows)


class _FakeSupabase:
    def __init__(self, rows):
        self.bucket = _FakeBucket()
        self.storage = _FakeStorage(self.bucket)
        self.documents = _FakeQuery(rows)

    def table(self, name):
        assert name == "case_documents"
        return self.documents


class DocumentAccessLinkTests(unittest.TestCase):
    def _open(self, document):
        supabase = _FakeSupabase([document])
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value={"id": "attorney-1", "role": "attorney"})), \
             patch.object(documents, "_fetch_case_with_access", return_value={"id": "case-1"}):
            result = asyncio.run(
                documents.get_document_access_url("case-1", document["id"], "Bearer test-token")
            )
        return result, supabase.bucket.requests

    def test_pii_access_reissues_a_short_lived_link_after_authorization(self):
        result, requests = self._open({
            "id": "document-pii",
            "case_id": "case-1",
            "storage_path": "cases/case-1/identity.pdf",
            "document_category": "pii",
            "file_name": "identity.pdf",
        })

        self.assertEqual(requests, [("cases/case-1/identity.pdf", 300)])
        self.assertEqual(result["expires_in"], 300)
        self.assertIn("expires=300", result["url"])

    def test_signed_contract_access_uses_a_new_authorized_link(self):
        result, requests = self._open({
            "id": "document-contract",
            "case_id": "case-1",
            "storage_path": "signing/session-1/signed_Representation_Agreement.pdf",
            "document_category": "signed_contract",
            "file_name": "Client_Signed_Representation_Agreement.pdf",
        })

        self.assertEqual(requests, [("signing/session-1/signed_Representation_Agreement.pdf", 900)])
        self.assertEqual(result["expires_in"], 900)
        self.assertEqual(result["file_name"], "Client_Signed_Representation_Agreement.pdf")


if __name__ == "__main__":
    unittest.main()
