import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import referrals


class _Query:
    def __init__(self, supabase, table_name):
        self.supabase = supabase
        self.table_name = table_name
        self.operation = "select"
        self.filters = []
        self.payload = None

    def select(self, _columns):
        self.operation = "select"
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        return self.supabase.execute(self.table_name, self.operation, self.filters, self.payload)


class _Supabase:
    def __init__(self):
        self.orphaned_pipeline = {
            "id": "ethan-pipeline",
            "name": "Ethan Babb Referrals",
            "slug": "ethan-babb-referrals-pipeline",
        }
        self.inserted_partners = []
        self.pipeline_inserted = False
        self.auth = SimpleNamespace(
            admin=SimpleNamespace(
                create_user=lambda _payload: SimpleNamespace(user=SimpleNamespace(id="ethan-portal-user")),
                delete_user=lambda _user_id: None,
            )
        )

    def table(self, table_name):
        return _Query(self, table_name)

    def execute(self, table_name, operation, filters, payload):
        lookup = {column: value for column, value in filters}
        if operation == "select":
            if table_name == "profiles":
                return SimpleNamespace(data=[{"id": "esther-profile", "full_name": "Esther Oise", "role": "staff_attorney"}])
            if table_name == "pipelines":
                return SimpleNamespace(data=[self.orphaned_pipeline] if lookup.get("slug") == self.orphaned_pipeline["slug"] else [])
            if table_name == "referral_partners":
                # The email, slug, and pipeline are all unclaimed, which makes the
                # existing pipeline safe to recover after a prior failed invitation.
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[])
        if operation == "insert":
            if table_name == "pipelines":
                self.pipeline_inserted = True
                return SimpleNamespace(data=[payload])
            if table_name == "referral_partners":
                saved = dict(payload)
                saved["id"] = "ethan-partner"
                self.inserted_partners.append(saved)
                return SimpleNamespace(data=[saved])
            return SimpleNamespace(data=[payload])
        return SimpleNamespace(data=[])


class ReferralAttorneyWorkspaceRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_reuses_orphaned_pipeline_for_new_verified_referral_attorney(self):
        supabase = _Supabase()
        request = referrals.ReferralAttorneyWorkspaceCreate(
            full_name="Ethan Babb",
            email="kwest@babblaw.com",
            assigned_attorney_id="esther-profile",
            submission_slug="ethan-babb-referrals",
        )
        with (
            patch.object(referrals, "get_supabase", return_value=supabase),
            patch.object(referrals, "_get_current_user", new=AsyncMock(return_value={"id": "owner-profile", "role": "attorney"})),
            patch("utils.email_service.send_email", new=AsyncMock(return_value=True)),
        ):
            result = await referrals.create_referral_attorney_workspace(request, authorization="Bearer owner")

        self.assertEqual(result["pipeline"]["id"], "ethan-pipeline")
        self.assertFalse(supabase.pipeline_inserted)
        self.assertEqual(supabase.inserted_partners[0]["pipeline_id"], "ethan-pipeline")
        self.assertEqual(supabase.inserted_partners[0]["assigned_attorney_id"], "esther-profile")
        self.assertEqual(supabase.inserted_partners[0]["submission_slug"], "ethan-babb-referrals")
        self.assertTrue(result["email_sent"])


if __name__ == "__main__":
    unittest.main()
