"""Regression tests for LegalFlow-managed signing sessions in shared e-sign routes."""

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from routers import esign


class _FakeQuery:
    def __init__(self, data=None):
        self.data = data or []
        self.insert_payload = None
        self.update_payload = None
        self.filters = []

    def select(self, _fields):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class _FakeBucket:
    def __init__(self, payload, payloads=None):
        self.payload = payload
        self.payloads = payloads or {}
        self.downloaded_path = None

    def download(self, path):
        self.downloaded_path = path
        return self.payloads.get(path, self.payload)


class _FakeStorage:
    def __init__(self, bucket):
        self.bucket = bucket

    def from_(self, bucket_name):
        if bucket_name != "documents":
            raise AssertionError(f"Unexpected bucket: {bucket_name}")
        return self.bucket


class _FakeSupabase:
    def __init__(self, session, signed_pdf=b"%PDF-1.7\ncompleted", source_bytes=None):
        self.session_query = _FakeQuery([session])
        self.case_documents_query = _FakeQuery([])
        payloads = {session["original_path"]: source_bytes} if source_bytes is not None else {}
        self.storage = _FakeStorage(_FakeBucket(signed_pdf, payloads))

    def table(self, table_name):
        if table_name == "signing_sessions":
            return self.session_query
        if table_name == "case_documents":
            return self.case_documents_query
        raise AssertionError(f"Unexpected table: {table_name}")


async def _attorney_user(_authorization):
    return {"id": "attorney-1", "role": "attorney"}


class InAppEsignRouteTests(unittest.TestCase):
    def setUp(self):
        self.session = {
            "id": "session-123",
            "token": "token-123",
            "title": "Settlement Agreement",
            "document_type": "settlement",
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "status": "signed",
            "original_path": "signing/session-123/original_agreement.pdf",
            "signed_path": "signing/session-123/signed_agreement.pdf",
            "signed_at": "2026-08-01T18:16:44+00:00",
            "audit_trail": {
                "ip_address": "198.51.100.18",
                "ip_source": "x-forwarded-for",
                "signed_at": "2026-08-01T18:16:44+00:00",
                "signature_placement": {"strategy": "detected_execution_block"},
            },
            "case_id": "case-123",
            "client_id": "client-123",
            "sent_by": "attorney-1",
            "created_at": "2026-08-01T18:00:00+00:00",
            "updated_at": "2026-08-01T18:16:44+00:00",
        }

    def test_in_app_detail_uses_shared_dashboard_shape(self):
        detail = esign._in_app_request_detail(self.session)

        self.assertEqual(detail["provider"], "legalflow")
        self.assertTrue(detail["is_complete"])
        self.assertTrue(detail["has_signed_document"])
        self.assertTrue(detail["has_source_attachment"])
        self.assertEqual(detail["source_file_name"], "agreement.pdf")
        self.assertEqual(detail["signatures"][0]["status"], "signed")
        self.assertEqual(detail["created_at"], self.session["created_at"])
        self.assertEqual(detail["signing_audit"]["ip_address"], "198.51.100.18")
        self.assertEqual(detail["signing_audit"]["ip_source"], "x-forwarded-for")

    def test_shared_detail_route_uses_in_app_session_before_provider_lookup(self):
        supabase = _FakeSupabase(self.session)
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ), patch.object(esign, "_is_configured", return_value=False):
            result = asyncio.run(esign.get_signature_request("session-123", "Bearer token"))

        self.assertEqual(result["provider"], "legalflow")
        self.assertTrue(result["is_complete"])

    def test_shared_download_route_returns_in_app_signed_pdf(self):
        supabase = _FakeSupabase(self.session)
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ), patch.object(esign, "_is_configured", return_value=False):
            response = asyncio.run(esign.download_signed_document("session-123", "Bearer token"))

        self.assertEqual(response.media_type, "application/pdf")
        self.assertTrue(response.body.startswith(b"%PDF"))
        self.assertEqual(supabase.storage.bucket.downloaded_path, self.session["signed_path"])

    def test_source_download_returns_unmodified_docx_attachment(self):
        source_session = {**self.session, "original_path": "signing/session-123/source_agreement.docx"}
        original_docx = b"PK\x03\x04same-original-docx-bytes"
        supabase = _FakeSupabase(source_session, source_bytes=original_docx)
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            response = asyncio.run(esign.download_original_attachment("session-123", "Bearer token"))

        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(response.body, original_docx)
        self.assertEqual(supabase.storage.bucket.downloaded_path, source_session["original_path"])

    def test_signed_pdf_is_added_to_linked_case_document_list(self):
        supabase = _FakeSupabase(self.session)
        esign_pdf = b"%PDF-1.7\ncompleted"

        from routers import signing

        signing._link_signed_pdf_to_case(
            supabase,
            self.session,
            self.session["signed_path"],
            esign_pdf,
        )

        payload = supabase.case_documents_query.insert_payload
        self.assertEqual(payload["case_id"], "case-123")
        self.assertEqual(payload["storage_path"], self.session["signed_path"])
        self.assertEqual(payload["file_type"], "pdf")
        self.assertEqual(payload["document_category"], "other")


if __name__ == "__main__":
    unittest.main()
