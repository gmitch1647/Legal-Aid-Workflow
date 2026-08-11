"""Regression tests for durable Closing Statement persistence behavior."""

from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from routers import closing_statements


class _Storage:
    def __init__(self):
        self.uploads = []
        self.removed = []

    def from_(self, _bucket):
        return self

    def upload(self, **kwargs):
        self.uploads.append(kwargs)

    def remove(self, paths):
        self.removed.extend(paths)


class _Query:
    def __init__(self, database, table_name):
        self.database = database
        self.table_name = table_name
        self.operation = "select"
        self.payload = None

    def select(self, *_fields):
        return self

    def eq(self, *_filter):
        return self

    def limit(self, *_limit):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.table_name == "case_documents":
            if self.operation == "select":
                return SimpleNamespace(data=[{"id": "settlement-1", "storage_path": "cases/case-1/settlement.pdf"}])
            if self.operation == "insert":
                if self.database.fail_case_document_index:
                    raise RuntimeError("temporary case document index failure")
                self.database.indexed_documents.append(self.payload)
                return SimpleNamespace(data=[self.payload])
        if self.table_name == "closing_statements":
            if self.operation == "insert":
                self.database.closing_insert_attempts += 1
                if self.database.fail_first_version_insert and self.database.closing_insert_attempts == 1:
                    raise RuntimeError("duplicate key value violates unique constraint idx_closing_statements_case_version")
                self.database.saved_statement = dict(self.payload)
                return SimpleNamespace(data=[self.database.saved_statement])
            if self.operation == "select":
                return SimpleNamespace(data=[self.database.saved_statement] if self.database.saved_statement else [])
        if self.table_name == "cases":
            return SimpleNamespace(data=[])
        raise AssertionError(f"Unexpected query: {self.table_name} {self.operation}")


class _Database:
    def __init__(self, *, fail_case_document_index=False, fail_first_version_insert=False):
        self.storage = _Storage()
        self.fail_case_document_index = fail_case_document_index
        self.fail_first_version_insert = fail_first_version_insert
        self.closing_insert_attempts = 0
        self.saved_statement = None
        self.indexed_documents = []

    def table(self, table_name):
        return _Query(self, table_name)


async def _attorney(_authorization):
    return {"id": "attorney-1", "full_name": "Attorney Example", "role": "attorney"}


class ClosingStatementPersistenceTests(unittest.TestCase):
    def _payload(self):
        return closing_statements.ClosingStatementCreate(
            case_id="case-1",
            settlement_document_id="settlement-1",
            case_number="25-CV-1001",
            adverse_party="Acme Collections LLC",
            account_reference="Account 1234",
            gross_settlement_amount="1000.00",
            client_payout_amount="300.00",
            paralegal_fee_amount="100.00",
            court_cost_amount="50.00",
            service_of_process_cost_amount="50.00",
            attorney_id="letterhead-1",
            signer_name="Client Example",
            signer_email="client@example.com",
        )

    def _patches(self, database):
        return (
            patch.object(closing_statements, "get_supabase", return_value=database),
            patch.object(closing_statements, "_get_current_user", _attorney),
            patch.object(
                closing_statements,
                "_fetch_case_for_attorney",
                return_value=(
                    {"id": "case-1", "client_id": "client-1", "case_number": "25-CV-1001"},
                    {"id": "client-1", "full_name": "Client Example", "email": "client@example.com"},
                ),
            ),
            patch.object(
                closing_statements,
                "_selected_attorney",
                return_value={
                    "id": "letterhead-1",
                    "firm_name": "Example Law Firm",
                    "address": "123 Main Street",
                    "phone": "(404) 555-0100",
                    "email": "attorney@example.com",
                },
            ),
            patch.object(closing_statements, "_next_closing_statement_version", return_value=1),
            patch.object(closing_statements, "render_closing_statement", return_value=b"%PDF-1.7\nclosing-statement"),
            patch.object(closing_statements.uuid, "uuid4", return_value="statement-1"),
        )

    def test_saved_statement_survives_case_document_index_failure(self):
        database = _Database(fail_case_document_index=True)
        patches = self._patches(database)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
            result = asyncio.run(
                closing_statements.create_closing_statement(self._payload(), authorization="Bearer token")
            )

        self.assertEqual(result["statement"]["id"], "statement-1")
        self.assertEqual(result["statement"]["status"], "draft")
        self.assertIsNone(result["case_document"])
        self.assertEqual(len(database.storage.uploads), 1)
        self.assertEqual(database.storage.removed, [])

    def test_duplicate_version_retries_and_saves_next_version(self):
        database = _Database(fail_first_version_insert=True)
        patches = self._patches(database)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
            result = asyncio.run(
                closing_statements.create_closing_statement(self._payload(), authorization="Bearer token")
            )

        self.assertEqual(database.closing_insert_attempts, 2)
        self.assertEqual(result["statement"]["version"], 2)
        self.assertEqual(result["statement"]["statement_file_name"], "Closing_Statement_Client_Example_v2.pdf")
        self.assertTrue(result["statement"]["draft_storage_path"].endswith("Closing_Statement_Client_Example_v2.pdf"))
        self.assertEqual(len(database.storage.uploads), 2)
        self.assertTrue(database.storage.removed[0].endswith("Closing_Statement_Client_Example_v1.pdf"))
        self.assertEqual(result["case_document"]["document_category"], "closing_statement")


if __name__ == "__main__":
    unittest.main()
