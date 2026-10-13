import asyncio
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import cases


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.pending_update = None

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def update(self, values):
        self.pending_update = deepcopy(values)
        return self

    def execute(self):
        matched = self.rows
        for column, value in self.filters:
            matched = [row for row in matched if str(row.get(column)) == value]
        if self.pending_update is not None:
            for row in matched:
                row.update(self.pending_update)
        return SimpleNamespace(data=deepcopy(matched))


class _Supabase:
    def __init__(self, documents):
        self.rows = {
            "case_documents": documents,
            "cases": [{"id": "case-1", "case_number": None}],
        }

    def table(self, name):
        return _Query(self.rows[name])


class StampedComplaintFilingTests(unittest.TestCase):
    def _save(self, documents):
        supabase = _Supabase(documents)
        with patch.object(cases, "get_supabase", return_value=supabase), \
             patch.object(cases, "get_current_user", new=AsyncMock(return_value={"id": "attorney-1", "role": "attorney"})), \
             patch.object(cases, "_fetch_case", return_value={"id": "case-1", "client_id": "client-1"}), \
             patch.object(cases, "_require_pipeline_case_mover"):
            result = asyncio.run(
                cases.update_case_filing(
                    "case-1",
                    cases.CaseFilingUpdate(case_number="24-CV-12345"),
                    "Bearer test",
                )
            )
        return result, supabase

    def test_case_number_requires_stamped_complaint(self):
        with self.assertRaises(HTTPException) as raised:
            self._save([])
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("stamped complaint", raised.exception.detail.lower())

    def test_case_number_is_saved_when_stamped_complaint_exists(self):
        result, supabase = self._save([
            {
                "id": "stamped-1",
                "case_id": "case-1",
                "document_category": "stamped_complaint",
            }
        ])
        self.assertEqual(result["case_number"], "24-CV-12345")
        self.assertEqual(result["stamped_complaint_id"], "stamped-1")
        self.assertEqual(supabase.rows["cases"][0]["case_number"], "24-CV-12345")


if __name__ == "__main__":
    unittest.main()
