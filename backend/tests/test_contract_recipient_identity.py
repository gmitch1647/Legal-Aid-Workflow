import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import integrations, signing


class _ProfileQuery:
    def __init__(self, supabase):
        self.supabase = supabase
        self.operation = "select"
        self.filters = []
        self.payload = None

    def select(self, _columns):
        self.operation = "select"
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def ilike(self, column, value):
        self.filters.append((column, str(value).casefold()))
        return self

    def limit(self, _value):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.operation == "insert":
            self.supabase.inserted_profiles.append(dict(self.payload))
            return SimpleNamespace(data=[dict(self.payload)])
        rows = list(self.supabase.profiles)
        for column, value in self.filters:
            if column == "email":
                rows = [row for row in rows if str(row.get(column, "")).casefold() == value]
            else:
                rows = [row for row in rows if str(row.get(column)) == value]
        return SimpleNamespace(data=rows)


class _IdentitySupabase:
    def __init__(self, *, users, profiles=None, create_error=None):
        self.users = users
        self.profiles = profiles or []
        self.create_error = create_error
        self.inserted_profiles = []
        self.auth = SimpleNamespace(
            admin=SimpleNamespace(
                create_user=self.create_user,
                list_users=self.list_users,
            )
        )

    def create_user(self, _payload):
        if self.create_error:
            raise self.create_error
        return SimpleNamespace(user=SimpleNamespace(id="new-client-id"))

    def list_users(self, page=None, per_page=None):
        self.list_page = page
        self.list_per_page = per_page
        return list(self.users)

    def table(self, table_name):
        self.last_table = table_name
        if table_name != "profiles":
            raise AssertionError(f"Unexpected table: {table_name}")
        return _ProfileQuery(self)


class _SigningQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        self.filters = []
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        rows = list(self.rows)
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == value]
        return SimpleNamespace(data=rows)


class _SigningSupabase:
    def __init__(self):
        self.rows = {
            "cases": [{
                "id": "lonya-case",
                "client_id": "gary-profile",
                "plaintiff_name": "Lonya Roberson v. Transunion",
                "case_facts": '{"client_name":"Lonya Roberson","email":"lyn_roberson@yahoo.com"}',
                "status": "attorney_review",
            }],
            "profiles": [{
                "id": "gary-profile",
                "full_name": "Gary Mitchell",
                "email": "gmitch1647@gmail.com",
                "assigned_attorney_id": "esther-profile",
            }],
        }

    def table(self, table_name):
        return _SigningQuery(self.rows[table_name])


class ContractRecipientIdentityTests(unittest.TestCase):
    def test_existing_auth_user_without_profile_becomes_client_profile(self):
        supabase = _IdentitySupabase(
            users=[SimpleNamespace(id="lonya-auth-id", email="lyn_roberson@yahoo.com")],
            create_error=RuntimeError("User already registered"),
        )

        client_id = integrations._find_or_create_client(
            supabase,
            name="Lonya Roberson",
            email="lyn_roberson@yahoo.com",
            phone="2485550100",
            address="10 Client Lane",
            state="MI",
        )

        self.assertEqual(client_id, "lonya-auth-id")
        self.assertEqual(supabase.inserted_profiles[0]["id"], "lonya-auth-id")
        self.assertEqual(supabase.inserted_profiles[0]["role"], "client")
        self.assertEqual(supabase.inserted_profiles[0]["email"], "lyn_roberson@yahoo.com")
        self.assertEqual(supabase.list_page, 1)
        self.assertEqual(supabase.list_per_page, 1000)

    def test_unresolved_client_identity_never_falls_back_to_owner(self):
        supabase = _IdentitySupabase(
            users=[],
            create_error=RuntimeError("User already registered"),
        )

        with self.assertRaises(integrations.ClientIdentityResolutionError):
            integrations._find_or_create_client(
                supabase,
                name="Lonya Roberson",
                email="lyn_roberson@yahoo.com",
            )

        self.assertEqual(supabase.inserted_profiles, [])

    def test_oise_contract_blocks_mismatched_case_client_before_email(self):
        supabase = _SigningSupabase()

        with (
            patch.object(signing, "get_supabase", return_value=supabase),
            patch.object(
                signing,
                "_get_current_user",
                new=AsyncMock(return_value={"id": "owner", "role": "attorney"}),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(
                    signing.send_oise_engagement_contract(
                        signing.EngagementContractSendRequest(case_id="lonya-case", confirmed=True),
                        authorization="Bearer token",
                    )
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Lonya Roberson", error.exception.detail)
        self.assertIn("Gary Mitchell", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
