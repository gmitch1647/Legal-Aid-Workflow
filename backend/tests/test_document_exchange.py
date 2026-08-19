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
        self._insert = None
        self._update = None

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, str(value)))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _value):
        return self

    def insert(self, value):
        self._insert = deepcopy(value)
        return self

    def update(self, value):
        self._update = deepcopy(value)
        return self

    def _matched(self):
        rows = self.rows
        for kind, column, value in self.filters:
            if kind == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            else:
                rows = [row for row in rows if str(row.get(column)) in value]
        return rows

    def execute(self):
        if self._insert is not None:
            if isinstance(self._insert, list):
                self.rows.extend(self._insert)
                return SimpleNamespace(data=deepcopy(self._insert))
            self.rows.append(self._insert)
            return SimpleNamespace(data=[deepcopy(self._insert)])
        matched = self._matched()
        if self._update is not None:
            for row in matched:
                row.update(self._update)
        return SimpleNamespace(data=deepcopy(matched))


class _Supabase:
    def __init__(self):
        self.rows = {
            "cases": [{"id": "case-1", "client_id": "client-1", "case_number": "LF-2026-001", "plaintiff_name": "Jada Wiggins", "referral_partner_id": "partner-1"}],
            "profiles": [
                {"id": "client-1", "full_name": "Jada Wiggins", "assigned_attorney_id": "attorney-1", "role": "client"},
                {"id": "owner-1", "full_name": "Gary Mitchell", "email": "gary@example.test", "role": "attorney"},
                {"id": "attorney-1", "full_name": "Esther Oise", "email": "esther@example.test", "role": "staff_attorney"},
                {"id": "attorney-2", "full_name": "Other Attorney", "email": "other@example.test", "role": "staff_attorney"},
            ],
            "settlement_package_reviewers": [{"owner_profile_id": "owner-1", "active": True}],
            "referral_partners": [{"id": "partner-1", "portal_user_id": "affiliate-1", "portal_active": True}],
            "case_documents": [
                {"id": "doc-1", "case_id": "case-1", "file_name": "Interrogatories Draft.docx", "document_category": "other", "storage_path": "cases/case-1/interrogatories.docx"},
                {"id": "doc-2", "case_id": "case-1", "file_name": "Interrogatories Completed.docx", "document_category": "other", "storage_path": "cases/case-1/interrogatories-completed.docx"},
                {"id": "pii-1", "case_id": "case-1", "file_name": "Client ID.pdf", "document_category": "pii", "storage_path": "cases/case-1/id.pdf"},
            ],
            "case_document_exchange_threads": [],
            "case_document_exchange_packages": [],
            "case_document_exchange_items": [],
            "case_document_exchange_comments": [],
        }

    def table(self, name):
        return _Query(self.rows[name])


CASE = {"id": "case-1", "client_id": "client-1", "case_number": "LF-2026-001", "plaintiff_name": "Jada Wiggins", "referral_partner_id": "partner-1"}
OWNER = {"id": "owner-1", "role": "attorney", "full_name": "Gary Mitchell"}
ATTORNEY = {"id": "attorney-1", "role": "staff_attorney", "full_name": "Esther Oise"}
OTHER_ATTORNEY = {"id": "attorney-2", "role": "staff_attorney", "full_name": "Other Attorney"}
AFFILIATE = {"id": "affiliate-1", "role": "affiliate", "full_name": "Ethan Babb"}


class DocumentExchangeTests(unittest.TestCase):
    def _create(self, supabase, profile=OWNER, document_ids=None):
        email = AsyncMock(return_value=True)
        payload = documents.DocumentExchangeCreatePayload(
            title="Interrogatories — Jada Wiggins",
            document_type="interrogatories",
            document_ids=document_ids or ["doc-1"],
            message="Please complete the draft answers and return it for review.",
            stage="attorney_draft",
        )
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value=profile)), \
             patch.object(documents, "_fetch_case_with_access", return_value=CASE), \
             patch.object(documents, "send_email", new=email):
            result = asyncio.run(documents.create_case_document_exchange("case-1", payload, "Bearer test"))
        return result, email

    def test_owner_can_send_attorney_draft_and_secure_notice_has_no_attachment(self):
        supabase = _Supabase()
        result, email = self._create(supabase)

        thread = result["thread"]
        self.assertEqual(thread["client_id"], "client-1")
        self.assertEqual(thread["case_id"], "case-1")
        self.assertEqual(thread["status"], "awaiting_attorney")
        self.assertEqual(thread["packages"][0]["version_number"], 1)
        self.assertEqual(thread["packages"][0]["recipient_id"], "attorney-1")
        self.assertEqual(thread["packages"][0]["items"][0]["case_document_id"], "doc-1")
        email.assert_awaited_once()
        kwargs = email.await_args.kwargs
        self.assertEqual(kwargs["to"], "esther@example.test")
        self.assertNotIn("attachments", kwargs)
        self.assertIn("Open Document Exchange", kwargs["body"])

    def test_assigned_attorney_can_return_completed_draft_as_new_version(self):
        supabase = _Supabase()
        created, _ = self._create(supabase)
        thread_id = created["thread"]["id"]
        email = AsyncMock(return_value=True)
        reply = documents.DocumentExchangePackagePayload(
            document_ids=["doc-2"],
            message="Completed responses are ready for your review.",
            stage="returned_for_review",
        )
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value=ATTORNEY)), \
             patch.object(documents, "_fetch_case_with_access", return_value=CASE), \
             patch.object(documents, "send_email", new=email):
            result = asyncio.run(documents.add_case_document_exchange_package("case-1", thread_id, reply, "Bearer test"))

        thread = result["thread"]
        self.assertEqual(thread["status"], "awaiting_owner")
        self.assertEqual([package["version_number"] for package in thread["packages"]], [1, 2])
        self.assertEqual(thread["packages"][1]["recipient_id"], "owner-1")
        self.assertEqual(thread["packages"][1]["items"][0]["case_document_id"], "doc-2")
        self.assertEqual(email.await_args.kwargs["to"], "gary@example.test")

    def test_unassigned_attorney_cannot_open_or_send_in_client_case_exchange(self):
        supabase = _Supabase()
        with self.assertRaises(HTTPException) as raised:
            self._create(supabase, profile=OTHER_ATTORNEY)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(supabase.rows["case_document_exchange_threads"], [])

    def test_referral_attorney_can_send_only_to_assigned_attorney_on_own_referral_case(self):
        supabase = _Supabase()
        result, email = self._create(supabase, profile=AFFILIATE)
        thread = result["thread"]
        self.assertEqual(thread["status"], "awaiting_attorney")
        self.assertEqual(thread["packages"][0]["recipient_id"], "attorney-1")
        self.assertEqual(email.await_args.kwargs["to"], "esther@example.test")

    def test_pii_document_is_blocked_from_document_exchange(self):
        supabase = _Supabase()
        with self.assertRaises(HTTPException) as raised:
            self._create(supabase, document_ids=["pii-1"])
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("PII", raised.exception.detail)
        self.assertEqual(supabase.rows["case_document_exchange_threads"], [])

    def test_client_overview_keeps_case_thread_context(self):
        supabase = _Supabase()
        created, _ = self._create(supabase)
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value=OWNER)):
            result = asyncio.run(documents.list_client_document_exchanges("client-1", "Bearer test"))
        self.assertEqual(len(result["threads"]), 1)
        self.assertEqual(result["threads"][0]["id"], created["thread"]["id"])
        self.assertEqual(result["threads"][0]["case_id"], "case-1")
        self.assertEqual(result["threads"][0]["case_label"], "LF-2026-001")

    def test_comments_stay_inside_the_case_thread(self):
        supabase = _Supabase()
        created, _ = self._create(supabase)
        thread_id = created["thread"]["id"]
        with patch.object(documents, "get_supabase", return_value=supabase), \
             patch.object(documents, "_get_current_user", new=AsyncMock(return_value=OWNER)), \
             patch.object(documents, "_fetch_case_with_access", return_value=CASE):
            comment = asyncio.run(documents.add_case_document_exchange_comment(
                "case-1", thread_id, documents.DocumentExchangeCommentPayload(body="Please focus on answers 4 through 8."), "Bearer test"
            ))
        self.assertEqual(comment["thread_id"], thread_id)
        self.assertEqual(comment["author_id"], "owner-1")
        self.assertEqual(len(supabase.rows["case_document_exchange_comments"]), 1)


if __name__ == "__main__":
    unittest.main()
