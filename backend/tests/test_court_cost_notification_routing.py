"""Regression coverage for Court Costs operational alert recipients."""
import unittest

from routers.court_costs import _court_cost_update_recipients


class CourtCostNotificationRoutingTests(unittest.TestCase):
    def test_owner_submitted_payment_uses_firm_inbox_not_login_email(self):
        recipients = _court_cost_update_recipients(
            {
                "email": "gmitch1647@gmail.com",
                "notification_preferences": {
                    "firm_notification_email": "legalflowservice@gmail.com",
                },
            },
            "legalflowservice@gmail.com",
            "esther@example.test",
            include_esther=True,
        )

        self.assertEqual(recipients, ["legalflowservice@gmail.com", "esther@example.test"])
        self.assertNotIn("gmitch1647@gmail.com", recipients)

    def test_referral_submitter_remains_notified_alongside_firm_and_esther(self):
        recipients = _court_cost_update_recipients(
            {"email": "partner@example.test", "notification_preferences": {}},
            "legalflowservice@gmail.com",
            "esther@example.test",
            include_esther=True,
        )

        self.assertEqual(
            recipients,
            ["partner@example.test", "legalflowservice@gmail.com", "esther@example.test"],
        )


if __name__ == "__main__":
    unittest.main()
