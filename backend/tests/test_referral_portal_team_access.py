import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from routers import cases, pipeline_stages, referrals
from utils.referral_portal_access import get_referral_portal_partner, is_referral_portal_owner


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
    def __init__(self, member_status="active", member_access_level="member"):
        self.rows = {
            "referral_partners": [
                {"id": "partner-ethan", "portal_user_id": "ethan-owner", "portal_active": True, "pipeline_id": "ethan-pipeline"},
            ],
            "referral_portal_team_members": [
                {"id": "member-1", "referral_partner_id": "partner-ethan", "profile_id": "ethan-team", "status": member_status, "access_level": member_access_level},
            ],
            "cases": [
                {"id": "ethan-case", "client_id": "client-ethan", "referral_partner_id": "partner-ethan"},
                {"id": "firm-case", "client_id": "client-firm", "referral_partner_id": None},
            ],
        }

    def table(self, name):
        return _Query(self.rows[name])


class ReferralPortalTeamAccessTests(unittest.TestCase):
    def setUp(self):
        self.team_profile = {"id": "ethan-team", "role": "affiliate"}

    def test_active_team_member_resolves_only_ethan_workspace(self):
        supabase = _Supabase()
        partner = get_referral_portal_partner(supabase, self.team_profile)
        self.assertEqual(partner["id"], "partner-ethan")
        self.assertEqual(pipeline_stages._affiliate_pipeline_id(supabase, self.team_profile), "ethan-pipeline")
        self.assertFalse(is_referral_portal_owner(supabase, partner, self.team_profile))

    def test_active_team_member_can_open_own_partner_case_but_not_firm_case(self):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase):
            found = cases._fetch_case("ethan-case", profile=self.team_profile)
            self.assertEqual(found["id"], "ethan-case")
            with self.assertRaises(HTTPException) as raised:
                cases._fetch_case("firm-case", profile=self.team_profile)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("referral case", raised.exception.detail)

    def test_only_portal_owner_can_manage_team_members(self):
        supabase = _Supabase()
        partner = get_referral_portal_partner(supabase, self.team_profile)
        with self.assertRaises(HTTPException) as raised:
            referrals._require_portal_owner(supabase, partner, self.team_profile)
        self.assertEqual(raised.exception.status_code, 403)

        owner_profile = {"id": "ethan-owner", "role": "affiliate"}
        owner_partner = get_referral_portal_partner(supabase, owner_profile)
        referrals._require_portal_owner(supabase, owner_partner, owner_profile)

    def test_co_owner_can_manage_only_ethan_workspace(self):
        supabase = _Supabase(member_access_level="co_owner")
        partner = get_referral_portal_partner(supabase, self.team_profile)
        self.assertTrue(is_referral_portal_owner(supabase, partner, self.team_profile))
        referrals._require_portal_owner(supabase, partner, self.team_profile)
        self.assertEqual(pipeline_stages._affiliate_pipeline_id(supabase, self.team_profile), "ethan-pipeline")

    def test_password_policy_requires_uppercase_lowercase_and_number(self):
        with self.assertRaises(ValueError):
            referrals.ReferralPortalPasswordUpdate(current_password="CurrentPassword1", new_password="alllowercase12")
        accepted = referrals.ReferralPortalPasswordUpdate(current_password="CurrentPassword1", new_password="NewPortalPassword2")
        self.assertEqual(accepted.new_password, "NewPortalPassword2")

    def test_revoked_team_member_has_no_workspace_or_case_access(self):
        supabase = _Supabase(member_status="revoked")
        self.assertIsNone(get_referral_portal_partner(supabase, self.team_profile))
        with patch.object(cases, "get_supabase", return_value=supabase):
            with self.assertRaises(HTTPException) as raised:
                cases._fetch_case("ethan-case", profile=self.team_profile)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
