"""Regression tests for the authorization-scoped unpaid Court Costs PDF export."""
import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from PyPDF2 import PdfReader

from routers import court_costs
from utils.court_costs_pdf import render_unpaid_court_costs_pdf


class _CourtCostQuery:
    def __init__(self, rows):
        self.rows = rows
        self.request_ids = []

    def select(self, _columns):
        return self

    def in_(self, _column, values):
        self.request_ids = [str(value) for value in values]
        return self

    def order(self, _column, desc=False):
        return self

    def limit(self, _count):
        return self

    def execute(self):
        return SimpleNamespace(data=[row for row in self.rows if str(row["id"]) in self.request_ids])


class _FakeSupabase:
    def __init__(self, rows):
        self.court_costs = _CourtCostQuery(rows)

    def table(self, name):
        if name != "court_cost_requests":
            raise AssertionError(f"Unexpected table: {name}")
        return self.court_costs


class CourtCostsUnpaidExportTests(unittest.TestCase):
    def test_renderer_creates_a_readable_unpaid_ledger(self):
        pdf = render_unpaid_court_costs_pdf([
            {
                "case_label": "Dana Client v. Example Bank",
                "client_name": "Dana Client",
                "court_name": "State Court",
                "description": "State court filing plus service",
                "expense_date": "2026-10-12",
                "status": "submitted",
                "amount": 323.35,
            },
        ], generated_for="Ethan Babb")

        self.assertTrue(pdf.startswith(b"%PDF"))
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(pdf)).pages)
        self.assertIn("Unpaid Matters Ledger", text)
        self.assertIn("Dana Client v. Example Bank", text)
        self.assertIn("$323.35", text)
        self.assertIn("Prepared for: Ethan Babb", text)

    def test_export_rejects_paid_or_inaccessible_request_ids(self):
        rows = [{"id": "paid-row", "status": "paid", "amount": 405, "expense_date": "2026-10-12"}]
        supabase = _FakeSupabase(rows)
        with patch.object(court_costs, "get_current_user", new=AsyncMock(return_value={"id": "ethan", "role": "affiliate", "full_name": "Ethan Babb"})), \
             patch.object(court_costs, "get_supabase", return_value=supabase), \
             patch.object(court_costs, "_can_view", return_value=True):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(court_costs.export_unpaid_court_costs(
                    court_costs.CourtCostUnpaidExport(request_ids=["paid-row"]),
                    "Bearer test-token",
                ))

        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("paid", raised.exception.detail)

    def test_export_includes_only_authorized_selected_unpaid_rows(self):
        rows = [{"id": "unpaid-row", "status": "submitted", "amount": 495, "expense_date": "2026-10-12"}]
        supabase = _FakeSupabase(rows)
        enriched = {
            **rows[0],
            "case_label": "Case One",
            "client_name": "Client One",
            "court_name": "Federal Court",
            "description": "Federal court filing plus service",
        }
        with patch.object(court_costs, "get_current_user", new=AsyncMock(return_value={"id": "ethan", "role": "affiliate", "full_name": "Ethan Babb"})), \
             patch.object(court_costs, "get_supabase", return_value=supabase), \
             patch.object(court_costs, "_can_view", return_value=True), \
             patch.object(court_costs, "_is_owner", return_value=False), \
             patch.object(court_costs, "_enrich", return_value=enriched):
            response = asyncio.run(court_costs.export_unpaid_court_costs(
                court_costs.CourtCostUnpaidExport(request_ids=["unpaid-row"]),
                "Bearer test-token",
            ))

        self.assertEqual(response.media_type, "application/pdf")
        self.assertIn("LegalFlow-unpaid-court-costs-", response.headers["content-disposition"])
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(response.body)).pages)
        self.assertIn("Case One", text)
        self.assertIn("$495.00", text)


if __name__ == "__main__":
    unittest.main()
