"""Regression coverage for E-Signature alerts, reminders, and signed filenames."""

import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import esign, signing
from utils.esign_notifications import (
    normalize_esign_preferences,
    notify_attorney_of_esign_event,
    signed_document_filename,
)


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []
        self.filters = []
        self.in_filters = []

    def select(self, _fields):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.in_filters.append((column, set(values)))
        return self

    def limit(self, _value):
        return self

    def update(self, payload):
        self.updates.append(dict(payload))
        return self

    def execute(self):
        rows = list(self.rows)
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        for column, values in self.in_filters:
            rows = [row for row in rows if row.get(column) in values]
        if self.updates:
            for row in rows:
                row.update(self.updates[-1])
        return SimpleNamespace(data=rows)


class _Supabase:
    def __init__(self, tables):
        self.queries = {name: _Query(rows) for name, rows in tables.items()}

    def table(self, name):
        if name not in self.queries:
            self.queries[name] = _Query([])
        return self.queries[name]


class SignedFilenameTests(unittest.TestCase):
    def test_settlement_filename_uses_client_and_document_type(self):
        self.assertEqual(
            signed_document_filename({
                "signer_name": "Keshaun Wiggins",
                "document_type": "settlement",
                "title": "Unrelated upload title",
            }),
            "Keshaun_Wiggins_Signed_Settlement_Agreement.pdf",
        )

    def test_general_filename_uses_safe_document_title(self):
        self.assertEqual(
            signed_document_filename({
                "signer_name": "A. Client / Test",
                "document_type": "general",
                "title": "Notice: Final Review (v2)",
            }),
            "A_Client_Test_Signed_Notice_Final_Review_v2.pdf",
        )

    def test_preference_defaults_include_sent_alert_and_fixed_six_hour_cadence(self):
        preferences = normalize_esign_preferences({
            "esign_document_sent": False,
            "esign_document_viewed": False,
            "esign_reminder_interval_hours": 48,
        })
        self.assertFalse(preferences["esign_document_sent"])
        self.assertFalse(preferences["esign_document_viewed"])
        self.assertTrue(preferences["esign_document_signed"])
        self.assertEqual(preferences["esign_reminder_interval_hours"], 6)


class SentNotificationTests(unittest.TestCase):
    def test_attorney_sent_alert_is_recorded_once_after_delivery(self):
        record = {
            "id": "session-1",
            "title": "Settlement Agreement",
            "document_type": "settlement",
            "signer_name": "Client Example",
            "sent_by": "attorney-1",
            "notification_recipient_id": "sender-1",
            "notification_recipient_email": "owner@example.com",
            "sent_notification_sent_at": None,
        }
        supabase = _Supabase({
            "signing_sessions": [record],
            "profiles": [{
                "id": "sender-1",
                "email": "owner@example.com",
                "full_name": "Sender Example",
                "notification_preferences": {"esign_document_sent": True},
            }],
        })
        with patch("utils.esign_notifications.send_email", new=AsyncMock(return_value=True)) as send_email:
            first = asyncio.run(notify_attorney_of_esign_event(
                supabase=supabase,
                record=record,
                event="sent",
                source_table="signing_sessions",
            ))
            second = asyncio.run(notify_attorney_of_esign_event(
                supabase=supabase,
                record=record,
                event="sent",
                source_table="signing_sessions",
            ))

        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(send_email.await_count, 1)
        self.assertEqual(send_email.await_args.kwargs["to"], "owner@example.com")
        self.assertIsNotNone(record["sent_notification_sent_at"])


class FirstViewAndReminderTests(unittest.TestCase):
    def test_first_secure_view_is_recorded_and_notified(self):
        session = {
            "id": "session-1",
            "token": "token-1",
            "title": "Settlement Agreement",
            "document_type": "settlement",
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "status": "awaiting_signature",
            "sent_by": "attorney-1",
            "viewed_at": None,
        }
        supabase = _Supabase({
            "signing_sessions": [session],
            "signature_requests": [],
        })

        with patch.object(signing, "get_supabase", return_value=supabase), patch.object(
            signing,
            "notify_attorney_of_esign_event",
            new=AsyncMock(return_value=True),
        ) as notify:
            result = asyncio.run(signing.get_signing_session("token-1"))

        self.assertEqual(result["status"], "viewed")
        self.assertTrue(supabase.queries["signing_sessions"].updates)
        update = supabase.queries["signing_sessions"].updates[-1]
        self.assertEqual(update["status"], "viewed")
        self.assertIn("viewed_at", update)
        notify.assert_awaited_once()
        self.assertEqual(notify.await_args.kwargs["event"], "viewed")

    def test_reminder_becomes_due_every_six_hours_until_document_leaves_pending(self):
        now = datetime(2026, 8, 5, 15, 0, tzinfo=timezone.utc)
        preferences = normalize_esign_preferences({"esign_auto_reminders": True})
        due_record = {
            "status": "awaiting_signature",
            "created_at": (now - timedelta(hours=6, minutes=1)).isoformat(),
            "last_reminder_at": None,
            "reminder_count": 99,
        }
        recent_reminder = {
            **due_record,
            "last_reminder_at": (now - timedelta(hours=5, minutes=59)).isoformat(),
        }
        completed_record = {**due_record, "status": "signed"}
        self.assertTrue(esign._auto_reminder_is_due(due_record, preferences, now))
        self.assertFalse(esign._auto_reminder_is_due(recent_reminder, preferences, now))
        self.assertFalse(esign._auto_reminder_is_due(completed_record, preferences, now))

    def test_automatic_reminder_updates_history_only_after_email_success(self):
        now = datetime(2026, 8, 5, 15, 0, tzinfo=timezone.utc)
        session = {
            "id": "session-1",
            "token": "token-1",
            "title": "Settlement Agreement",
            "document_type": "settlement",
            "signer_name": "Client Example",
            "signer_email": "client@example.test",
            "status": "awaiting_signature",
            "sent_by": "attorney-1",
            "created_at": (now - timedelta(hours=6, minutes=1)).isoformat(),
            "viewed_at": None,
            "reminder_count": 0,
            "last_reminder_at": None,
        }
        supabase = _Supabase({
            "signing_sessions": [session],
            "signature_requests": [],
        })
        preferences = normalize_esign_preferences({"esign_auto_reminders": True})

        async def fake_preferences(_supabase, _attorney_id):
            return preferences, {"id": "attorney-1"}

        with patch("utils.esign_notifications.get_esign_preferences", new=fake_preferences), patch.object(
            esign,
            "_send_in_app_reminder",
            new=AsyncMock(return_value=True),
        ) as send_reminder:
            result = asyncio.run(
                esign.process_automatic_signature_reminders(supabase=supabase, now=now)
            )

        self.assertEqual(result["sent"], 1)
        send_reminder.assert_awaited_once()
        update = supabase.queries["signing_sessions"].updates[-1]
        self.assertEqual(update["reminder_count"], 1)
        self.assertEqual(update["last_reminder_at"], now.isoformat())


class _WebhookRequest:
    def __init__(self, event_type, request_id):
        self.payload = {
            "event": {
                "event_type": event_type,
                "event_metadata": {"signature_request_id": request_id},
            }
        }

    async def json(self):
        return self.payload


class ExternalWebhookNotificationTests(unittest.TestCase):
    def _supabase(self):
        return _Supabase({
            "signature_requests": [{
                "id": "provider-1",
                "title": "Closing Statement",
                "document_type": "closing_statement",
                "signer_name": "Client Example",
                "signer_email": "client@example.test",
                "sent_by": "attorney-1",
                "status": "awaiting_signature",
                "viewed_at": None,
                "view_notification_sent_at": None,
                "signed_notification_sent_at": None,
            }],
        })

    def test_external_first_view_records_timestamp_and_delivers_view_alert(self):
        supabase = self._supabase()
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign,
            "_notify_external_esign_event",
            new=AsyncMock(),
        ) as notify:
            result = asyncio.run(esign.esign_webhook(_WebhookRequest("signature_request_viewed", "provider-1")))

        self.assertEqual(result["status"], "ok")
        row = supabase.queries["signature_requests"].rows[0]
        self.assertEqual(row["status"], "viewed")
        self.assertIsNotNone(row["viewed_at"])
        notify.assert_awaited_once_with(supabase, "provider-1", "viewed")

    def test_external_completion_delivers_signed_alert(self):
        supabase = self._supabase()
        with patch.object(esign, "get_supabase", return_value=supabase), patch.object(
            esign,
            "_notify_external_esign_event",
            new=AsyncMock(),
        ) as notify:
            result = asyncio.run(esign.esign_webhook(_WebhookRequest("signature_request_all_signed", "provider-1")))

        self.assertEqual(result["status"], "ok")
        row = supabase.queries["signature_requests"].rows[0]
        self.assertEqual(row["status"], "complete")
        self.assertIn("completed_at", row)
        notify.assert_awaited_once_with(supabase, "provider-1", "signed")


if __name__ == "__main__":
    unittest.main()
