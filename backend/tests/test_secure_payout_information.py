"""Regression coverage for secure client payout-information requests."""

import asyncio
import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from routers import payout_information


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.mode = "select"
        self.payload = None
        self.inserted = []
        self.updated = []

    def select(self, _columns):
        self.filters = []
        self.mode = "select"
        self.payload = None
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _value):
        return self

    def order(self, _column, desc=False):
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = dict(payload)
        self.inserted.append(dict(payload))
        return self

    def update(self, payload):
        self.mode = "update"
        self.payload = dict(payload)
        self.updated.append(dict(payload))
        return self

    def _matching(self):
        rows = list(self.rows)
        for column, value in self.filters:
            rows = [row for row in rows if str(row.get(column)) == str(value)]
        return rows

    def execute(self):
        if self.mode == "insert":
            row = {**self.payload, "id": self.payload.get("id", f"created-{len(self.rows) + 1}")}
            self.rows.append(row)
            return SimpleNamespace(data=[row])
        if self.mode == "update":
            rows = self._matching()
            for row in rows:
                row.update(self.payload)
            return SimpleNamespace(data=rows)
        return SimpleNamespace(data=self._matching())


class _Supabase:
    def __init__(self):
        self.tables = {
            "cases": _Query([{"id": "case-1", "client_id": "client-1", "case_number": "1:26-cv-1", "plaintiff_name": "Client"}]),
            "profiles": _Query([
                {"id": "client-1", "full_name": "Client", "email": "client@example.test", "assigned_attorney_id": "attorney-1"},
                {"id": "attorney-1", "full_name": "Attorney", "email": "attorney@example.test"},
                {"id": "attorney-2", "full_name": "Other Attorney", "email": "other@example.test"},
            ]),
            "client_payout_information_requests": _Query([{
                "id": "request-1", "case_id": "case-1", "client_id": "client-1", "requested_by": "attorney-1",
                "message": "Provide ACH information", "status": "requested", "token": "private-payout-token", "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "created_at": "2026-08-11T12:00:00+00:00",
            }]),
            "client_payout_information_submissions": _Query([]),
            "payout_information_access_audit": _Query([]),
        }

    def table(self, name):
        return self.tables[name]


def _request():
    return Request({
        "type": "http",
        "method": "POST",
        "scheme": "https",
        "path": "/",
        "query_string": b"",
        "headers": [(b"x-forwarded-for", b"203.0.113.9"), (b"user-agent", b"LegalFlow test")],
        "client": ("203.0.113.9", 5000),
    })


class SecurePayoutInformationTests(unittest.TestCase):
    key = Fernet.generate_key().decode("utf-8")

    def _submit_body(self):
        return payout_information.PayoutInformationSubmission(
            account_holder_name="Alex Client",
            account_ownership="personal",
            account_type="checking",
            bank_name="Example Bank",
            routing_number="021000021",
            account_number="123456789012",
            authorized=True,
        )

    def _patches(self, supabase, profile):
        return (
            patch.object(payout_information, "get_supabase", return_value=supabase),
            patch.object(payout_information, "_current_profile", new=AsyncMock(return_value=profile)),
            patch.dict(os.environ, {"PAYOUT_ENCRYPTION_KEY": self.key}, clear=False),
        )

    def test_client_submission_encrypts_account_and_routing_numbers_before_persistence(self):
        supabase = _Supabase()
        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "client-1", "role": "client"})
        with get_supabase, current_profile, encryption:
            result = asyncio.run(payout_information.submit_payout_information(
                "request-1", self._submit_body(), _request(), "Bearer test"
            ))

        stored = supabase.tables["client_payout_information_submissions"].inserted[0]
        self.assertEqual(result["status"], "completed")
        self.assertEqual(stored["account_number_last4"], "9012")
        self.assertEqual(stored["account_holder_name"], "Alex Client")
        self.assertEqual(stored["account_ownership"], "personal")
        self.assertNotEqual(stored["routing_number_encrypted"], "021000021")
        self.assertNotEqual(stored["account_number_encrypted"], "123456789012")
        self.assertNotIn("routing_number", stored)
        self.assertNotIn("account_number", stored)
        self.assertEqual(supabase.tables["client_payout_information_requests"].rows[0]["status"], "completed")
        self.assertEqual(supabase.tables["payout_information_access_audit"].inserted[0]["action"], "submitted")

    def test_account_holder_and_account_ownership_are_required(self):
        with self.assertRaises(ValidationError):
            payout_information.PayoutInformationSubmission(
                account_holder_name="   ",
                account_type="checking",
                routing_number="021000021",
                account_number="123456789012",
                authorized=True,
            )
        with self.assertRaises(ValidationError):
            payout_information.PayoutInformationSubmission(
                account_holder_name="Alex Client",
                account_type="checking",
                routing_number="021000021",
                account_number="123456789012",
                authorized=True,
            )

    def test_authorized_attorney_reveal_decrypts_values_and_creates_audit_row(self):
        supabase = _Supabase()
        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "client-1", "role": "client"})
        with get_supabase, current_profile, encryption:
            asyncio.run(payout_information.submit_payout_information("request-1", self._submit_body(), _request(), "Bearer client"))

        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "attorney-1", "role": "attorney"})
        with get_supabase, current_profile, encryption:
            revealed = asyncio.run(payout_information.reveal_payout_information("request-1", _request(), "Bearer attorney"))

        self.assertEqual(revealed["account_ownership"], "personal")
        self.assertEqual(revealed["routing_number"], "021000021")
        self.assertEqual(revealed["account_number"], "123456789012")
        self.assertEqual(supabase.tables["payout_information_access_audit"].inserted[-1]["action"], "revealed")

    def test_other_attorney_cannot_reveal_or_get_submission_details(self):
        supabase = _Supabase()
        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "client-1", "role": "client"})
        with get_supabase, current_profile, encryption:
            asyncio.run(payout_information.submit_payout_information("request-1", self._submit_body(), _request(), "Bearer client"))

        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "attorney-2", "role": "attorney"})
        with get_supabase, current_profile, encryption:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(payout_information.reveal_payout_information("request-1", _request(), "Bearer other"))

        self.assertEqual(raised.exception.status_code, 403)
        audits = supabase.tables["payout_information_access_audit"].inserted
        self.assertEqual([row["action"] for row in audits], ["submitted"])

    def test_public_token_form_submits_without_client_account_and_persists_only_encrypted_values(self):
        supabase = _Supabase()
        with patch.object(payout_information, "get_supabase", return_value=supabase), patch.dict(os.environ, {"PAYOUT_ENCRYPTION_KEY": self.key}, clear=False):
            form_data = asyncio.run(payout_information.get_public_payout_information_form("private-payout-token"))
            result = asyncio.run(payout_information.submit_public_payout_information(
                "private-payout-token", self._submit_body(), _request()
            ))

        stored = supabase.tables["client_payout_information_submissions"].inserted[0]
        self.assertEqual(form_data["status"], "requested")
        self.assertEqual(result["status"], "completed")
        self.assertIsNone(supabase.tables["payout_information_access_audit"].inserted[0]["actor_id"])
        self.assertNotEqual(stored["routing_number_encrypted"], "021000021")
        self.assertNotEqual(stored["account_number_encrypted"], "123456789012")
        self.assertEqual(stored["account_ownership"], "personal")

    def test_expired_public_token_cannot_load_or_submit(self):
        supabase = _Supabase()
        supabase.tables["client_payout_information_requests"].rows[0]["expires_at"] = "2020-01-01T00:00:00+00:00"
        with patch.object(payout_information, "get_supabase", return_value=supabase), patch.dict(os.environ, {"PAYOUT_ENCRYPTION_KEY": self.key}, clear=False):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(payout_information.get_public_payout_information_form("private-payout-token"))

        self.assertEqual(raised.exception.status_code, 410)
        self.assertEqual(supabase.tables["client_payout_information_submissions"].rows, [])

    def test_client_request_list_never_returns_encrypted_or_plaintext_ach_values(self):
        supabase = _Supabase()
        get_supabase, current_profile, encryption = self._patches(supabase, {"id": "client-1", "role": "client"})
        with get_supabase, current_profile, encryption:
            asyncio.run(payout_information.submit_payout_information("request-1", self._submit_body(), _request(), "Bearer client"))
            result = asyncio.run(payout_information.list_payout_information_requests("case-1", "Bearer client"))

        encoded = str(result)
        self.assertNotIn("021000021", encoded)
        self.assertNotIn("123456789012", encoded)
        self.assertNotIn("routing_number_encrypted", encoded)
        self.assertNotIn("account_number_encrypted", encoded)


if __name__ == "__main__":
    unittest.main()
