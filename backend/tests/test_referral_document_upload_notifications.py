"""Regression coverage for referral-portal document upload alerts."""
import asyncio
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import documents


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, str(value)))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        matched = self.rows
        for kind, column, value in self.filters:
            if kind == "eq":
                matched = [row for row in matched if str(row.get(column)) == value]
            else:
                matched = [row for row in matched if str(row.get(column)) in value]
        return SimpleNamespace(data=deepcopy(matched))


class _Supabase:
    def __init__(self, active=True):
        self.rows = {
            "referral_partners": [
                {
                    "id": "partner-babb",
                    "full_name": "Ethan Babb's Lawfirm Referrals",
                    "email": "kwest@babblaw.com",
                    "portal_user_id": "kanija-profile",
                    "portal_active": active,
                }
            ],
            "referral_portal_team_members": [
                {
                    "referral_partner_id": "partner-babb",
                    "profile_id": "ethan-profile",
                    "status": "active",
                },
                {
                    "referral_partner_id": "partner-babb",
                    "profile_id": "kanija-profile",
                    "status": "active",
                },
                {
                    "referral_partner_id": "partner-babb",
                    "profile_id": "former-profile",
                    "status": "revoked",
                },
            ],
            "profiles": [
                {"id": "ethan-profile", "full_name": "Ethan Babb", "email": "ebabb@babblaw.com"},
                {"id": "kanija-profile", "full_name": "Kanija West", "email": "kwest@babblaw.com"},
                {"id": "former-profile", "full_name": "Former Team Member", "email": "former@example.test"},
            ],
        }

    def table(self, name):
        return _Query(self.rows[name])


class ReferralDocumentUploadNotificationTests(unittest.TestCase):
    def test_active_portal_owner_and_co_owner_receive_one_unique_notification_each(self):
        supabase = _Supabase()
        case = {"referral_partner_id": "partner-babb", "plaintiff_name": "Shannon Cholko"}
        document = {
            "id": "stamped-document",
            "file_name": "Shannon complaint.pdf",
            "document_category": "stamped_complaint",
        }
        uploaded_by = {"id": "esther-profile", "full_name": "Esther Oise"}

        with patch.object(documents, "send_email", new=AsyncMock(return_value=True)) as send_email:
            sent_to = asyncio.run(
                documents._notify_referral_portal_document_upload(
                    supabase,
                    case,
                    document,
                    uploaded_by,
                )
            )

        self.assertEqual(set(sent_to), {"ebabb@babblaw.com", "kwest@babblaw.com"})
        self.assertEqual(send_email.await_count, 2)
        calls_by_recipient = {call.kwargs["to"]: call.kwargs for call in send_email.await_args_list}
        self.assertIn("New Stamped Complaint: Shannon Cholko", calls_by_recipient["ebabb@babblaw.com"]["subject"])
        self.assertIn("Shannon complaint.pdf", calls_by_recipient["ebabb@babblaw.com"]["body"])
        self.assertIn("Esther Oise", calls_by_recipient["ebabb@babblaw.com"]["body"])
        self.assertEqual(
            calls_by_recipient["ebabb@babblaw.com"]["idempotency_key"],
            "referral-document-upload:stamped-document:ebabb@babblaw.com",
        )

    def test_inactive_portal_does_not_receive_document_notification(self):
        partner, recipients = documents._referral_portal_document_recipients(
            _Supabase(active=False),
            "partner-babb",
        )

        self.assertIsNone(partner)
        self.assertEqual(recipients, [])


if __name__ == "__main__":
    unittest.main()
