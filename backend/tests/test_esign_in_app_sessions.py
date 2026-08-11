"""Regression tests for LegalFlow-managed signing sessions in shared e-sign routes."""

import asyncio
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
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

    def test_credit_disclosure_detail_is_review_only_and_complete_after_view(self):
        disclosure = {
            **self.session,
            "document_type": "credit_disclosure",
            "status": "awaiting_review",
            "signed_path": None,
        }
        pending_detail = esign._in_app_request_detail(disclosure)
        self.assertTrue(pending_detail["review_only"])
        self.assertFalse(pending_detail["is_complete"])
        self.assertEqual(pending_detail["signatures"][0]["status"], "awaiting_review")

        reviewed_detail = esign._in_app_request_detail({**disclosure, "status": "viewed"})
        self.assertTrue(reviewed_detail["review_only"])
        self.assertTrue(reviewed_detail["is_complete"])
        self.assertEqual(reviewed_detail["signatures"][0]["status"], "reviewed")
        self.assertFalse(reviewed_detail["has_signed_document"])

    def test_credit_disclosure_cannot_be_completed_as_signature(self):
        from routers import signing

        disclosure = {
            **self.session,
            "document_type": "credit_disclosure",
            "status": "awaiting_review",
        }
        supabase = _FakeSupabase(disclosure)
        with patch.object(signing, "get_supabase", return_value=supabase):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(signing.complete_signing("token-123", None))

        self.assertIn("view-only", raised.exception.detail)

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


class _DashboardQuery:
    def __init__(self, rows):
        self.rows = [dict(row) for row in rows]
        self.filters = []
        self.in_filters = []
        self.or_filters = []

    def select(self, _fields):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.in_filters.append((column, {str(value) for value in values}))
        return self

    def or_(self, expression):
        for clause in str(expression).split(','):
            column, operator, value = clause.split('.', 2)
            if operator == 'eq':
                self.or_filters.append((column, value))
        return self

    def order(self, _column, desc=False):
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = self.rows
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        for column, values in self.in_filters:
            rows = [row for row in rows if str(row.get(column)) in values]
        if self.or_filters:
            rows = [
                row for row in rows
                if any(str(row.get(column)) == value for column, value in self.or_filters)
            ]
        return SimpleNamespace(data=rows)


class _DashboardSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, table_name):
        return _DashboardQuery(self.tables.get(table_name, []))


class GroupedEsignDashboardTests(unittest.TestCase):
    def setUp(self):
        self.attorney = {"id": "attorney-1", "role": "attorney"}
        self.settlement = {
            "id": "settlement-session",
            "token": "settlement-token",
            "title": "Settlement Agreement — Client Example",
            "document_type": "settlement",
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "status": "signed",
            "original_path": "signing/settlement/source_agreement.pdf",
            "signed_path": "signing/settlement/signed_agreement.pdf",
            "signed_at": "2026-08-02T14:01:45+00:00",
            "audit_trail": {},
            "case_id": "case-123",
            "client_id": "client-123",
            "sent_by": "attorney-1",
            "created_at": "2026-08-02T11:54:55+00:00",
            "updated_at": "2026-08-02T14:01:45+00:00",
        }

    def _supabase(self, *, include_legacy=False, include_sender_owned_oise=False):
        sessions = [self.settlement]
        if include_sender_owned_oise:
            sessions.append({
                **self.settlement,
                "id": "oise-engagement-session",
                "title": "Oise Law Group PC Representation Agreement",
                "document_type": "oise_engagement_agreement",
                "sent_by": "esther-oise-profile",
                "notification_recipient_id": "attorney-1",
                "status": "signed",
                "signed_path": "signing/oise/signed_agreement.pdf",
            })
        if include_legacy:
            sessions.append({
                **self.settlement,
                "id": "legacy-session",
                "title": "Legacy Agreement",
                "case_id": None,
                "client_id": None,
                "signed_at": "2026-08-01T10:00:00+00:00",
            })
        return _DashboardSupabase({
            "signing_sessions": sessions,
            # This row mirrors the in-app settlement session and must not create
            # a duplicate dashboard item. The external request must be retained.
            "signature_requests": [
                {
                    "id": "settlement-session",
                    "title": "Stale mirrored settlement",
                    "document_type": "settlement",
                    "signer_name": "Client Example",
                    "signer_email": "client@example.test",
                    "case_id": "case-123",
                    "client_id": "client-123",
                    "sent_by": "attorney-1",
                    "status": "complete",
                    "sent_at": "2026-08-02T11:54:55+00:00",
                    "completed_at": "2026-08-02T14:01:45+00:00",
                    "created_at": "2026-08-02T11:54:55+00:00",
                },
                {
                    "id": "closing-provider-request",
                    "title": "Settlement Closing Statement",
                    "document_type": "closing_statement",
                    "signer_name": "Client Example",
                    "signer_email": "client@example.test",
                    "case_id": "case-123",
                    "client_id": "client-123",
                    "sent_by": "attorney-1",
                    "status": "awaiting_signature",
                    "sent_at": "2026-08-02T15:00:00+00:00",
                    "created_at": "2026-08-02T15:00:00+00:00",
                },
            ],
            "w9_requests": [
                {
                    "id": "w9-request",
                    "title": "Form W-9 — Client Example",
                    "signer_name": "Client Example",
                    "signer_email": "client@example.test",
                    "case_id": "case-123",
                    "client_id": "client-123",
                    "sent_by": "attorney-1",
                    "status": "complete",
                    "submitted_at": "2026-08-02T13:00:00+00:00",
                    "created_at": "2026-08-02T12:00:00+00:00",
                },
            ],
            "cases": [{
                "id": "case-123",
                "client_id": "client-123",
                "case_number": "LF-42",
            }],
            "profiles": [{
                "id": "client-123",
                "full_name": "Client Example",
                "email": "client@example.test",
            }],
        })

    def test_request_list_uses_authoritative_in_app_session_before_legacy_mirror(self):
        pending_settlement = {**self.settlement, "status": "awaiting_signature", "signed_path": None}
        supabase = _DashboardSupabase({
            "signing_sessions": [pending_settlement],
            # This deliberately simulates the short period immediately after a
            # successful first send, before the non-authoritative mirror exists.
            "signature_requests": [],
        })
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            requests = asyncio.run(
                esign.list_signature_requests("case-123", authorization="Bearer token")
            )

        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["id"], "settlement-session")
        self.assertEqual(requests[0]["provider"], "legalflow")
        self.assertEqual(requests[0]["document_type"], "settlement")
        self.assertEqual(requests[0]["status"], "awaiting_signature")

    def test_request_list_deduplicates_in_app_session_and_legacy_mirror(self):
        supabase = self._supabase()
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            requests = asyncio.run(
                esign.list_signature_requests("case-123", authorization="Bearer token")
            )

        request_ids = [request["id"] for request in requests]
        self.assertEqual(request_ids.count("settlement-session"), 1)
        self.assertIn("closing-provider-request", request_ids)

    def test_grouped_dashboard_includes_sender_owned_oise_agreement(self):
        supabase = self._supabase(include_sender_owned_oise=True)
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            dashboard = asyncio.run(esign.grouped_signature_dashboard(authorization="Bearer token"))

        documents = dashboard["groups"][0]["documents"]
        oise_document = next(document for document in documents if document["id"] == "oise-engagement-session")
        self.assertEqual(oise_document["document_label"], "Oise Law Representation Agreement")
        self.assertEqual(oise_document["status"], "signed")

    def test_grouped_dashboard_uses_signed_session_and_groups_workflow_documents(self):
        supabase = self._supabase()
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            dashboard = asyncio.run(esign.grouped_signature_dashboard(authorization="Bearer token"))

        self.assertEqual(dashboard["summary"]["documents"], 3)
        self.assertEqual(dashboard["summary"]["groups"], 1)
        self.assertEqual(dashboard["summary"]["complete"], 2)
        self.assertEqual(dashboard["summary"]["pending"], 1)

        group = dashboard["groups"][0]
        self.assertEqual(group["client"]["name"], "Client Example")
        self.assertEqual(group["case"]["label"], "LF-42 — Client Example")
        self.assertEqual(len(group["documents"]), 3)

        by_id = {document["id"]: document for document in group["documents"]}
        self.assertEqual(by_id["settlement-session"]["status"], "signed")
        self.assertTrue(by_id["settlement-session"]["has_signed_document"])
        self.assertEqual(by_id["closing-provider-request"]["document_label"], "Closing Statement")
        self.assertTrue(by_id["w9-request"]["secure_only"])
        self.assertTrue(by_id["w9-request"]["has_signed_document"])

    def test_grouped_dashboard_keeps_legacy_unlinked_documents_visible(self):
        supabase = self._supabase(include_legacy=True)
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign, "_get_current_user", _attorney_user
        ):
            dashboard = asyncio.run(esign.grouped_signature_dashboard(authorization="Bearer token"))

        unassigned = next(group for group in dashboard["groups"] if group["id"] == "unassigned")
        self.assertEqual(unassigned["case"]["label"], "Unassigned case")
        self.assertEqual(unassigned["documents"][0]["id"], "legacy-session")


if __name__ == "__main__":
    unittest.main()
