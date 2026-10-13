"""Regression coverage for the separate LegalFlow firm-alert inbox."""
import unittest

from utils.firm_notifications import notification_email_for_profile


class FirmNotificationRecipientTests(unittest.TestCase):
    def test_configured_firm_inbox_overrides_profile_login_email(self):
        self.assertEqual(
            notification_email_for_profile({
                "email": "owner-login@example.test",
                "notification_preferences": {
                    "firm_notification_email": "legalflowservice@example.test",
                },
            }),
            "legalflowservice@example.test",
        )

    def test_profile_email_remains_the_fallback_when_no_firm_inbox_is_configured(self):
        self.assertEqual(
            notification_email_for_profile({
                "email": "owner-login@example.test",
                "notification_preferences": {"esign_document_signed": True},
            }),
            "owner-login@example.test",
        )

    def test_invalid_firm_inbox_does_not_block_profile_email_fallback(self):
        self.assertEqual(
            notification_email_for_profile({
                "email": "owner-login@example.test",
                "notification_preferences": {"firm_notification_email": "not-an-email"},
            }),
            "owner-login@example.test",
        )
