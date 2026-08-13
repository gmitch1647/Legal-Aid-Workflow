import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import referrals


class _Result:
    def __init__(self, data=None):
        self.data = data or []


class _Query:
    def __init__(self, store, table_name):
        self.store = store
        self.table_name = table_name
        self.filters = {}
        self.inserted = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.inserted = payload
        return self

    def execute(self):
        if self.table_name == "referral_partners":
            partner_id = self.filters.get("id")
            partner = self.store.partner if self.store.partner["id"] == partner_id else None
            return _Result([partner] if partner else [])
        if self.table_name == "referral_partner_messages":
            if self.inserted is not None:
                self.store.messages.append(self.inserted)
                return _Result([self.inserted])
            partner_id = self.filters.get("referral_partner_id")
            rows = [row for row in self.store.messages if row["referral_partner_id"] == partner_id]
            return _Result(list(reversed(rows)))
        return _Result([])


class _FakeSupabase:
    def __init__(self):
        self.partner = {
            "id": "partner-1",
            "full_name": "Example Referral Partner",
            "email": "partner@example.test",
            "phone": "+15555550123",
        }
        self.messages = []

    def table(self, table_name):
        return _Query(self, table_name)


class ReferralPartnerMessageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.supabase = _FakeSupabase()
        self.attorney = {"id": "attorney-1", "role": "attorney"}
        self.staff_attorney = {"id": "staff-1", "role": "staff_attorney"}

    async def test_email_message_uses_partner_recipient_and_audits_success(self):
        payload = referrals.ReferralPartnerMessageCreate(
            channel="email",
            subject="Case update",
            body="Thank you for the referral.",
        )
        with patch.object(referrals, "_get_current_user", AsyncMock(return_value=self.attorney)), \
             patch.object(referrals, "get_supabase", return_value=self.supabase), \
             patch("utils.email_service.send_email", AsyncMock(return_value=True)) as send_email:
            result = await referrals.send_referral_partner_message("partner-1", payload)

        self.assertEqual(result["status"], "sent")
        send_email.assert_awaited_once()
        self.assertEqual(self.supabase.messages[0]["referral_partner_id"], "partner-1")
        self.assertEqual(self.supabase.messages[0]["recipient"], "partner@example.test")
        self.assertEqual(self.supabase.messages[0]["channel"], "email")
        self.assertEqual(self.supabase.messages[0]["body"], "Thank you for the referral.")
        self.assertEqual(self.supabase.messages[0]["sent_by"], "attorney-1")
        self.assertEqual(self.supabase.messages[0]["direction"], "outbound")
        self.assertEqual(self.supabase.messages[0]["thread_key"], "email:partner-1")

    async def test_partner_email_uses_partner_specific_reply_address_when_receiving_domain_is_configured(self):
        payload = referrals.ReferralPartnerMessageCreate(channel="email", subject="Case update", body="Thank you.")
        with patch.object(referrals, "_get_current_user", AsyncMock(return_value=self.attorney)), \
             patch.object(referrals, "get_supabase", return_value=self.supabase), \
             patch("utils.email_service.send_email", AsyncMock(return_value=True)) as send_email, \
             patch.dict("os.environ", {"RESEND_RECEIVING_DOMAIN": "inbound.legalflow.test"}, clear=False):
            await referrals.send_referral_partner_message("partner-1", payload)

        self.assertEqual(send_email.await_args.kwargs["reply_to"], "partner+partner-1@inbound.legalflow.test")
        self.assertTrue(self.supabase.messages[0]["provider_metadata"]["reply_capture_configured"])

    def test_reply_address_parser_rejects_non_partner_addresses(self):
        self.assertEqual(
            referrals._partner_id_from_reply_addresses(["Partner <partner+12345678-1234-1234-1234-123456789abc@inbound.legalflow.test>"]),
            "12345678-1234-1234-1234-123456789abc",
        )
        self.assertIsNone(referrals._partner_id_from_reply_addresses(["support@inbound.legalflow.test"]))

    async def test_staff_attorney_can_read_partner_message_history(self):
        self.supabase.messages.append({
            "id": "message-1",
            "referral_partner_id": "partner-1",
            "channel": "sms",
            "recipient": "+15555550123",
            "subject": None,
            "body": "Thank you.",
            "status": "sent",
            "error_message": None,
            "created_at": "2026-08-12T00:00:00+00:00",
        })
        with patch.object(referrals, "_get_current_user", AsyncMock(return_value=self.staff_attorney)), \
             patch.object(referrals, "get_supabase", return_value=self.supabase):
            history = await referrals.get_referral_partner_messages("partner-1")

        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], "message-1")

    async def test_missing_twilio_settings_records_failed_sms_attempt(self):
        payload = referrals.ReferralPartnerMessageCreate(channel="sms", body="Please call me when you can.")
        with patch.object(referrals, "_get_current_user", AsyncMock(return_value=self.attorney)), \
             patch.object(referrals, "get_supabase", return_value=self.supabase), \
             patch.dict("os.environ", {}, clear=True):
            result = await referrals.send_referral_partner_message("partner-1", payload)

        self.assertEqual(result["status"], "failed")
        self.assertIn("Text messaging is not configured", result["error"])
        self.assertEqual(self.supabase.messages[0]["channel"], "sms")
        self.assertEqual(self.supabase.messages[0]["status"], "failed")

    async def test_partner_message_requires_attorney_or_staff_attorney(self):
        payload = referrals.ReferralPartnerMessageCreate(channel="sms", body="Hello")
        with patch.object(referrals, "_get_current_user", AsyncMock(return_value={"id": "client-1", "role": "client"})), \
             patch.object(referrals, "get_supabase", return_value=self.supabase):
            with self.assertRaises(HTTPException) as raised:
                await referrals.send_referral_partner_message("partner-1", payload)

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
