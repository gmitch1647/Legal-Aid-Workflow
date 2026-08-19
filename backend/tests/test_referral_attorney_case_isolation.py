import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from routers import cases


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
        matched = self.rows
        for column, value in self.filters:
            matched = [row for row in matched if str(row.get(column)) == value]
        return SimpleNamespace(data=deepcopy(matched))


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


class ReferralAttorneyCaseIsolationTests(unittest.TestCase):
    def setUp(self):
        self.profile = {"id": "ethan-profile", "role": "affiliate"}

    def test_referral_attorney_can_access_own_attributed_case(self):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase):
            found = cases._fetch_case("ethan-case", profile=self.profile)
        self.assertEqual(found["id"], "ethan-case")

    def test_referral_attorney_cannot_access_other_firm_case(self):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase):
            with self.assertRaises(HTTPException) as raised:
                cases._fetch_case("firm-case", profile=self.profile)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("referral case", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
