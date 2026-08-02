"""Regression tests for the settlement closing-statement workflow."""

from __future__ import annotations

import io
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import fitz
from PIL import Image, ImageDraw
from PyPDF2 import PdfReader

from routers.closing_statements import (
    _attach_settlement_signing_source,
    _extract_settlement_suggestions,
    _money_to_cents,
    _next_closing_statement_version,
)
from routers.signing import _embed_signature, _execution_block_placement
from utils.closing_statement_renderer import ClosingStatementData, money_in_words, render_closing_statement


class ClosingStatementWorkflowTests(unittest.TestCase):
    def test_labeled_settlement_fields_are_suggested(self):
        text = """
        Case No.: 25-CV-1042
        Defendant: Acme Collections LLC
        Account No.: 004-7781
        The total settlement amount is $4,250.50.
        Defendant agrees to delete its credit reporting tradeline and waive the balance.
        """
        result = _extract_settlement_suggestions(text)
        self.assertEqual(result["gross_settlement_cents"], 425050)
        self.assertEqual(result["gross_settlement_amount"], "4,250.50")
        self.assertEqual(result["case_number"], "25-CV-1042")
        self.assertEqual(result["adverse_party"], "Acme Collections LLC")
        self.assertEqual(result["account_reference"], "004-7781")
        self.assertIn("elimination and waiver", result["non_monetary_terms"])

    def test_settlement_consideration_is_suggested_as_gross_amount(self):
        text = "The total cash consideration for this settlement is $3,500.00."
        result = _extract_settlement_suggestions(text)
        self.assertEqual(result["gross_settlement_cents"], 350000)
        self.assertEqual(result["gross_settlement_amount"], "3,500.00")

    def test_case_caption_suggests_adverse_party_when_no_label_is_present(self):
        text = """
        IN THE SUPERIOR COURT OF EXAMPLE COUNTY
        Taylor Example, Plaintiff, v. Acme Financial Services, LLC, Defendant
        Case No. 25-CV-1042
        The settlement amount is $1,250.00.
        """
        result = _extract_settlement_suggestions(text)
        self.assertEqual(result["adverse_party"], "Acme Financial Services, LLC")
        self.assertEqual(result["adverse_party_source"], "settlement_caption")

    def test_step_one_settlement_source_is_linked_to_case_documents(self):
        class Response:
            def __init__(self, data):
                self.data = data

        class Query:
            def __init__(self, client, table_name):
                self.client = client
                self.table_name = table_name
                self.operation = "select"
                self.payload = None

            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, *_args):
                return self

            def insert(self, payload):
                self.operation = "insert"
                self.payload = payload
                return self

            def execute(self):
                if self.table_name == "signing_sessions":
                    return Response([self.client.session])
                if self.operation == "insert":
                    self.client.inserted_document = self.payload
                    return Response([self.payload])
                return Response([])

        class Storage:
            def from_(self, _bucket):
                return self

            def download(self, _path):
                return b"%PDF-1.7 linked settlement source"

        class Supabase:
            def __init__(self):
                self.session = {
                    "id": "session-1",
                    "case_id": "case-1",
                    "document_type": "settlement",
                    "original_path": "signing/session-1/source_final-settlement.pdf",
                    "sent_by": "attorney-1",
                    "created_at": "2026-08-02T00:00:00+00:00",
                }
                self.inserted_document = None
                self.storage = Storage()

            def table(self, table_name):
                return Query(self, table_name)

        fake_supabase = Supabase()
        with patch("routers.closing_statements.get_supabase", return_value=fake_supabase):
            document = _attach_settlement_signing_source(
                {"id": "case-1"},
                {"id": "attorney-1"},
                "session-1",
            )

        self.assertEqual(document["case_id"], "case-1")
        self.assertEqual(document["storage_path"], "signing/session-1/source_final-settlement.pdf")
        self.assertEqual(document["document_category"], "settlement")
        self.assertEqual(document["uploaded_by"], "attorney-1")

    def test_next_statement_version_increments_from_existing_report(self):
        class Response:
            def __init__(self, data):
                self.data = data

        class Query:
            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, *_args):
                return self

            def execute(self):
                return Response([{"version": 3}])

        class Supabase:
            def table(self, table_name):
                self.table_name = table_name
                return Query()

        with patch("routers.closing_statements.get_supabase", return_value=Supabase()):
            self.assertEqual(_next_closing_statement_version("case-1"), 4)

    def test_next_statement_version_starts_at_one_for_first_report(self):
        class Response:
            data = []

        class Query:
            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, *_args):
                return self

            def execute(self):
                return Response()

        class Supabase:
            def table(self, _table_name):
                return Query()

        with patch("routers.closing_statements.get_supabase", return_value=Supabase()):
            self.assertEqual(_next_closing_statement_version("case-1"), 1)

    def test_money_parses_in_integer_cents(self):
        self.assertEqual(_money_to_cents("$1,234.56", "Settlement"), 123456)
        self.assertEqual(_money_to_cents("0", "Settlement"), 0)
        with self.assertRaises(ValueError):
            _money_to_cents("-10", "Settlement")
        with self.assertRaises(ValueError):
            _money_to_cents("not an amount", "Settlement")

    def test_renderer_calculates_and_includes_required_closing_fields(self):
        pdf = render_closing_statement(
            ClosingStatementData(
                firm_name="Example Law Firm",
                firm_address="123 Main Street, Atlanta, GA 30303",
                firm_phone="(404) 555-0100",
                firm_email="attorney@example.com",
                statement_date="August 2, 2026",
                client_name="Taylor Example",
                case_number="LF-2026-TEST001",
                adverse_party="Acme Collections LLC",
                account_reference="Account 7781",
                gross_settlement_cents=500000,
                client_payout_cents=300000,
                paralegal_fee_cents=50000,
                court_cost_cents=25000,
                service_of_process_cost_cents=25000,
                attorney_fee_cents=100000,
                non_monetary_terms="The settlement includes a waiver of the asserted balance.",
            )
        )
        self.assertTrue(pdf.startswith(b"%PDF"))
        reader = PdfReader(io.BytesIO(pdf))
        self.assertEqual(len(reader.pages), 1)
        text = reader.pages[0].extract_text()
        self.assertIn("Example Law Firm", text)
        self.assertIn("123 Main Street, Atlanta, GA 30303", text)
        self.assertIn("(404) 555-0100", text)
        self.assertIn("attorney@example.com", text)
        self.assertIn("SETTLEMENT CLOSING STATEMENT", text)
        self.assertIn("LF-2026-TEST001", text)
        self.assertIn("Taylor Example, Client", text)
        self.assertIn("$3,000.00", text)
        self.assertIn("$500.00", text)
        self.assertIn("$250.00", text)
        self.assertIn("$1,000.00", text)
        self.assertIn("Court costs paid to the Firm", text)
        self.assertIn("Service of process costs paid to the Firm", text)
        self.assertIn("APPROVED AND ACCEPTED", text)
        self.assertIn("Date:", text)

    def test_reference_style_execution_block_is_detected_for_client_signature(self):
        pdf = render_closing_statement(
            ClosingStatementData(
                firm_name="Example Law Firm",
                firm_address="123 Main Street, Atlanta, GA 30303",
                firm_phone="(404) 555-0100",
                firm_email="attorney@example.com",
                statement_date="August 2, 2026",
                client_name="Taylor Example",
                case_number="LF-2026-TEST001",
                adverse_party="Acme Collections LLC",
                account_reference="Account 7781",
                gross_settlement_cents=500000,
                client_payout_cents=300000,
                paralegal_fee_cents=50000,
                court_cost_cents=0,
                service_of_process_cost_cents=0,
                attorney_fee_cents=150000,
                non_monetary_terms="The settlement includes a waiver of the asserted balance.",
            )
        )
        document = fitz.open(stream=pdf, filetype="pdf")
        placement = _execution_block_placement(document)
        self.assertIsNotNone(placement)
        self.assertEqual(placement["strategy"], "closing_statement_execution_block")
        signature_rect = placement["signature_rect"]
        date_label_rect = placement["date_label_rect"]
        self.assertGreater(signature_rect[2] - signature_rect[0], 150)
        self.assertGreater(signature_rect[3] - signature_rect[1], 18)
        self.assertLess(signature_rect[3], date_label_rect[1])

    def test_reference_style_execution_block_embeds_signature_and_date(self):
        pdf = render_closing_statement(
            ClosingStatementData(
                firm_name="Example Law Firm",
                firm_address="123 Main Street, Atlanta, GA 30303",
                firm_phone="(404) 555-0100",
                firm_email="attorney@example.com",
                statement_date="August 2, 2026",
                client_name="Taylor Example",
                case_number="LF-2026-TEST001",
                adverse_party="Acme Collections LLC",
                account_reference="Account 7781",
                gross_settlement_cents=500000,
                client_payout_cents=300000,
                paralegal_fee_cents=50000,
                court_cost_cents=0,
                service_of_process_cost_cents=0,
                attorney_fee_cents=150000,
                non_monetary_terms="The settlement includes a waiver of the asserted balance.",
            )
        )
        image = Image.new("RGBA", (360, 120), (255, 255, 255, 0))
        drawing = ImageDraw.Draw(image)
        drawing.line([(18, 84), (74, 28), (128, 82), (185, 34), (256, 72)], fill=(0, 0, 0, 255), width=7)
        signature = io.BytesIO()
        image.save(signature, format="PNG")

        signed_pdf, placement = _embed_signature(
            pdf,
            signature.getvalue(),
            "Taylor Example",
            "Taylor Example",
            return_placement=True,
        )
        self.assertEqual(placement["strategy"], "closing_statement_execution_block")
        self.assertTrue(signed_pdf.startswith(b"%PDF"))
        signed_text = PdfReader(io.BytesIO(signed_pdf)).pages[0].extract_text()
        self.assertIn(datetime.now(timezone.utc).strftime("%m/%d/%Y"), signed_text)

    def test_renderer_rejects_unbalanced_distribution(self):
        with self.assertRaises(ValueError):
            render_closing_statement(
                ClosingStatementData(
                    firm_name="Example Law Firm",
                    firm_address="",
                    firm_phone="",
                    firm_email="",
                    statement_date="August 2, 2026",
                    client_name="Taylor Example",
                    case_number="LF-2026-TEST001",
                    adverse_party="",
                    account_reference="",
                    gross_settlement_cents=10000,
                    client_payout_cents=9000,
                    paralegal_fee_cents=0,
                    court_cost_cents=1000,
                    service_of_process_cost_cents=1000,
                    attorney_fee_cents=-1000,
                    non_monetary_terms="",
                )
            )

    def test_money_words_match_settlement_narrative(self):
        self.assertEqual(money_in_words(425050), "Four Thousand Two Hundred Fifty Dollars and Fifty Cents")


if __name__ == "__main__":
    unittest.main()
