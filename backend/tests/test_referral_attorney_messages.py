import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from routers import messages


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = self.rows
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == value]
        return SimpleNamespace(data=deepcopy(rows))


class _Supabase:
    def __init__(self):
        self.rows = {
            "cases": [
                {"id": "ethan-case", "client_id": "client-ethan", "referral_partner_id": "partner-ethan"},
                {"id": "firm-case", "client_id": "client-firm", "referral_partner_id": None},
            ],
            "referral_partners": [
                {"id": "partner-ethan", "portal_user_id": "ethan-profile", "portal_active": True},
            ],
        }

    def table(self, name):
        return _Query(self.rows[name])


class ReferralAttorneyMessageIsolationTests(unittest.TestCase):
    def setUp(self):
        self.profile = {"id": "ethan-profile", "role": "affiliate", "full_name": "Ethan Babb"}

    def test_referral_attorney_can_open_message_thread_for_own_referral_case(self):
        with patch.object(messages, "get_supabase", return_value=_Supabase()):
            case = messages._fetch_case_and_verify("ethan-case", self.profile)
        self.assertEqual(case["id"], "ethan-case")

    def test_referral_attorney_cannot_open_message_thread_for_firm_case(self):
        with patch.object(messages, "get_supabase", return_value=_Supabase()):
            with self.assertRaises(HTTPException) as raised:
                messages._fetch_case_and_verify("firm-case", self.profile)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("referral case", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
