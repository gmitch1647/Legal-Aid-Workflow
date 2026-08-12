"""Regression coverage for address autocomplete normalization."""

import asyncio
import unittest

from routers import address_suggestions


class AddressSuggestionTests(unittest.TestCase):
    def test_normalises_us_provider_result_into_form_fields(self):
        suggestion = address_suggestions._normalise_result({
            "display_name": "123 Peachtree Street Northeast, Atlanta, Georgia 30303, United States",
            "address": {
                "house_number": "123",
                "road": "Peachtree Street Northeast",
                "city": "Atlanta",
                "ISO3166-2-lvl4": "US-GA",
                "postcode": "30303",
            },
        })

        self.assertEqual(suggestion, {
            "line1": "123 Peachtree Street Northeast",
            "city": "Atlanta",
            "state": "Georgia",
            "zip_code": "30303",
            "display_name": "123 Peachtree Street Northeast, Atlanta, Georgia 30303, United States",
        })

    def test_short_queries_return_no_suggestions_without_provider_lookup(self):
        result = asyncio.run(address_suggestions.address_suggestions("12"))
        self.assertEqual(result, {"suggestions": []})

    def test_non_address_result_is_not_returned_to_forms(self):
        self.assertIsNone(address_suggestions._normalise_result({
            "display_name": "Georgia, United States",
            "address": {"state": "Georgia"},
        }))


if __name__ == "__main__":
    unittest.main()
