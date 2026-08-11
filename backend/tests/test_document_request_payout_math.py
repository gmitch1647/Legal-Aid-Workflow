"""Focused calculations and input validation for the private payout ledger."""
from decimal import Decimal
import unittest
from pydantic import ValidationError

from routers.document_requests import PayoutLedgerCreate, _money, _payout_split


class PrivatePayoutMathTests(unittest.TestCase):
    def test_editable_percentage_is_accepted_and_calculated_from_settlement_base(self):
        payload = PayoutLedgerCreate(
            case_id="case-1",
            settlement_amount=14000,
            percentage=42.5,
        )
        expected = _money(Decimal(str(payload.settlement_amount)) * Decimal(str(payload.percentage)) / Decimal("100"))
        self.assertEqual(expected, 5950.00)

    def test_costs_are_deducted_before_the_percentage_is_applied(self):
        net_amount, expected_share = _payout_split(
            Decimal("14000"),
            Decimal("3000"),
            Decimal("1000"),
            Decimal("35"),
        )
        self.assertEqual(net_amount, 10000.00)
        self.assertEqual(expected_share, 3500.00)

    def test_costs_cannot_create_a_negative_amount_to_split(self):
        net_amount, expected_share = _payout_split(
            Decimal("1000"),
            Decimal("800"),
            Decimal("500"),
            Decimal("35"),
        )
        self.assertEqual(net_amount, 0.00)
        self.assertEqual(expected_share, 0.00)

    def test_default_percentage_remains_thirty_five_but_is_not_locked(self):
        default_payload = PayoutLedgerCreate(case_id="case-1", settlement_amount=1000)
        custom_payload = PayoutLedgerCreate(case_id="case-1", settlement_amount=1000, percentage=15)
        self.assertEqual(default_payload.percentage, 35)
        self.assertEqual(custom_payload.percentage, 15)

    def test_percentage_is_limited_to_a_valid_percentage_range(self):
        with self.assertRaises(ValidationError):
            PayoutLedgerCreate(case_id="case-1", settlement_amount=1000, percentage=100.01)
        with self.assertRaises(ValidationError):
            PayoutLedgerCreate(case_id="case-1", settlement_amount=1000, percentage=-0.01)


if __name__ == "__main__":
    unittest.main()
