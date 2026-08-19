import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from routers import documents


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        result = self.rows
        for column, value in self.filters:
            result = [row for row in result if str(row.get(column)) == str(value)]
        return SimpleNamespace(data=result)


class _Supabase:
    def __init__(self, case, partners):
        self.case = case
        self.partners = partners

    def table(self, table_name):
        if table_name == "cases":
            return _Query([self.case])
        if table_name == "referral_partners":
            return _Query(self.partners)
        raise AssertionError(f"Unexpected table: {table_name}")


class ReferralAttorneyDocumentIsolationTests(unittest.TestCase):
    def test_affiliate_can_access_documents_only_for_its_own_partner_case(self):
        partner_id = "partner-ethan"
        case = {"id": "case-ethan", "referral_partner_id": partner_id}
        profile = {"id": "profile-ethan", "role": "affiliate"}
        with patch.object(documents, "get_supabase", return_value=_Supabase(case, [{"id": partner_id, "portal_user_id": "profile-ethan", "portal_active": True}])):
            result = documents._fetch_case_with_access("case-ethan", profile)
        self.assertEqual(result["id"], "case-ethan")

    def test_affiliate_is_blocked_from_unrelated_case_documents(self):
        case = {"id": "firm-case", "referral_partner_id": "other-partner"}
        profile = {"id": "profile-ethan", "role": "affiliate"}
        with patch.object(documents, "get_supabase", return_value=_Supabase(case, [{"id": "partner-ethan", "portal_user_id": "profile-ethan", "portal_active": True}])):
            with self.assertRaises(HTTPException) as raised:
                documents._fetch_case_with_access("firm-case", profile)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
