import asyncio
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from models.schemas import CaseStatusUpdate
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
    def __init__(self):
        self.rows = {
            "cases": [{"id": "case-1", "client_id": "client-1", "status": "submitted"}],
            "profiles": [
                {"id": "client-1", "role": "client", "assigned_attorney_id": "attorney-1"},
                {"id": "owner-1", "role": "attorney"},
                {"id": "attorney-1", "role": "staff_attorney"},
                {"id": "attorney-2", "role": "staff_attorney"},
            ],
        }

    def table(self, name):
        return _Query(self.rows[name])


class PipelineCasePermissionTests(unittest.TestCase):
    def _move(self, profile):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase), \
             patch.object(cases, "get_current_user", new=AsyncMock(return_value=profile)):
            result = asyncio.run(cases.update_case_status(
                "case-1", CaseStatusUpdate(status="discovery"), "Bearer test"
            ))
        return result, supabase

    def test_owner_can_move_any_case(self):
        result, supabase = self._move({"id": "owner-1", "role": "attorney"})
        self.assertEqual(result["status"], "discovery")
        self.assertEqual(supabase.rows["cases"][0]["status"], "discovery")

    def test_assigned_staff_attorney_can_move_case(self):
        result, supabase = self._move({"id": "attorney-1", "role": "staff_attorney"})
        self.assertEqual(result["status"], "discovery")
        self.assertEqual(supabase.rows["cases"][0]["status"], "discovery")

    def test_unassigned_staff_attorney_is_blocked(self):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase), \
             patch.object(cases, "get_current_user", new=AsyncMock(return_value={"id": "attorney-2", "role": "staff_attorney"})):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(cases.update_case_status(
                    "case-1", CaseStatusUpdate(status="discovery"), "Bearer test"
                ))
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(supabase.rows["cases"][0]["status"], "submitted")

    def test_client_is_blocked_from_moving_case(self):
        supabase = _Supabase()
        with patch.object(cases, "get_supabase", return_value=supabase), \
             patch.object(cases, "get_current_user", new=AsyncMock(return_value={"id": "client-1", "role": "client"})):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(cases.update_case_status(
                    "case-1", CaseStatusUpdate(status="discovery"), "Bearer test"
                ))
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(supabase.rows["cases"][0]["status"], "submitted")


if __name__ == "__main__":
    unittest.main()
