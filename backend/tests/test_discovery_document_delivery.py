import asyncio
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import documents


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self._update = None
        self._insert = None

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _value):
        return self

    def insert(self, value):
        self._insert = value
        return self

    def update(self, value):
        self._update = value
        return self

    def execute(self):
        if self._insert is not None:
            inserted = deepcopy(self._insert)
            if isinstance(inserted, list):
                self.rows.extend(inserted)
                return SimpleNamespace(data=inserted)
            self.rows.append(inserted)
            return SimpleNamespace(data=[inserted])
        matched = self.rows
        for kind, column, value in self.filters:
            if kind == "eq":
                matched = [row for row in matched if str(row.get(column)) == str(value)]
            else:
                matched = [row for row in matched if str(row.get(column)) in value]
        if self._update is not None:
            for row in matched:
                row.update(deepcopy(self._update))
        return SimpleNamespace(data=deepcopy(matched))


class _Bucket:
    def __init__(self):
        self.downloads = []

    def download(self, path):
        self.downloads.append(path)
        return f"contents:{path}".encode()


class _Storage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, _name):
        return self.bucket


class _Supabase:
    def __init__(self):
        self.rows = {
            "profiles": [
                {"id": "client-1", "full_name": "Jada Wiggins", "assigned_attorney_id": "attorney-2"},
                {"id": "attorney-2", "full_name": "Esther Oise", "email": "oiselaw@example.test", "role": "staff_attorney"},
            ],
            "case_documents": [
                {"id": "discovery-1", "case_id": "case-1", "file_name": "Responses.pdf", "file_type": "application/pdf", "file_size": 500, "storage_path": "cases/case-1/Responses.pdf", "document_category": "discovery"},
                {"id": "pii-1", "case_id": "case-1", "file_name": "SSN.pdf", "file_type": "application/pdf", "file_size": 500, "storage_path": "cases/case-1/SSN.pdf", "document_category": "pii"},
            ],
            "discovery_document_deliveries": [],
            "discovery_document_delivery_items": [],
        }
        self.bucket = _Bucket()
        self.storage = _Storage(self.bucket)

    def table(self, name):
        return _Query(self.rows[name])


class DiscoveryDocumentDeliveryTests(unittest.TestCase):
    def _run_delivery(self, document_ids):
        supabase = _Supabase()
        send = AsyncMock(return_value=True)
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value={"id": "owner-1", "role": "attorney", "full_name": "Gary Mitchell"})), \
             patch.object(documents, "_fetch_case_with_access", return_value={"id": "case-1", "client_id": "client-1", "case_number": "LF-2026-CASE"}), \
             patch.object(documents, "send_email", new=send):
            result = asyncio.run(documents.deliver_discovery_documents_to_assigned_attorney(
                "case-1",
                documents.DiscoveryDocumentDeliveryPayload(document_ids=document_ids, message="Please review these responses."),
                "Bearer test-token",
            ))
        return result, supabase, send

    def test_selected_discovery_document_is_attached_and_audited(self):
        result, supabase, send = self._run_delivery(["discovery-1"])

        self.assertEqual(result["status"], "sent")
        self.assertEqual(result["recipient_email"], "oiselaw@example.test")
        self.assertEqual(supabase.bucket.downloads, ["cases/case-1/Responses.pdf"])
        self.assertEqual(len(supabase.rows["discovery_document_deliveries"]), 1)
        self.assertEqual(supabase.rows["discovery_document_deliveries"][0]["status"], "sent")
        self.assertEqual(len(supabase.rows["discovery_document_delivery_items"]), 1)
        send.assert_awaited_once()
        kwargs = send.await_args.kwargs
        self.assertEqual(kwargs["to"], "oiselaw@example.test")
        self.assertEqual(kwargs["attachments"][0]["filename"], "Responses.pdf")
        self.assertEqual(kwargs["attachments"][0]["content"], b"contents:cases/case-1/Responses.pdf")
        self.assertNotIn("SSN.pdf", kwargs["body"])

    def test_non_discovery_document_cannot_be_sent(self):
        supabase = _Supabase()
        send = AsyncMock(return_value=True)
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value={"id": "owner-1", "role": "attorney", "full_name": "Gary Mitchell"})), \
             patch.object(documents, "_fetch_case_with_access", return_value={"id": "case-1", "client_id": "client-1", "case_number": "LF-2026-CASE"}), \
             patch.object(documents, "send_email", new=send):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(documents.deliver_discovery_documents_to_assigned_attorney(
                    "case-1",
                    documents.DiscoveryDocumentDeliveryPayload(document_ids=["pii-1"]),
                    "Bearer test-token",
                ))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Only documents uploaded with the Discovery category", raised.exception.detail)
        send.assert_not_awaited()
        self.assertEqual(supabase.rows["discovery_document_deliveries"], [])


if __name__ == "__main__":
    unittest.main()
