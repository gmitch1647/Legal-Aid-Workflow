import asyncio
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import pipeline_stages


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.pending_update = None
        self.pending_delete = False

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def is_(self, column, value):
        self.filters.append(("is", column, value))
        return self

    def order(self, column, desc=False):
        self.rows.sort(key=lambda row: row.get(column, 0), reverse=desc)
        return self

    def limit(self, _value):
        return self

    def update(self, values):
        self.pending_update = deepcopy(values)
        return self

    def delete(self):
        self.pending_delete = True
        return self

    def execute(self):
        matched = list(self.rows)
        for kind, column, value in self.filters:
            if kind == "eq":
                matched = [row for row in matched if row.get(column) == value]
            else:
                expected = None if value == "null" else value
                matched = [row for row in matched if row.get(column) is expected]

        if self.pending_update is not None:
            for row in matched:
                row.update(self.pending_update)
        if self.pending_delete:
            for row in matched:
                self.rows.remove(row)
        return SimpleNamespace(data=deepcopy(matched))


class _Supabase:
    ETHAN_PIPELINE_ID = "ethan-pipeline"

    def __init__(self):
        self.rows = {
            "referral_partners": [
                {"id": "partner-ethan", "pipeline_id": self.ETHAN_PIPELINE_ID, "portal_active": True}
            ],
            "pipeline_stages": [
                {"id": "firm-submitted", "name": "Submitted", "slug": "submitted", "position": 0, "pipeline_id": None, "is_system": True},
                {"id": "firm-intake", "name": "Firm Intake", "slug": "firm_intake", "position": 12, "pipeline_id": None, "is_system": False},
                {"id": "ethan-submitted", "name": "Submitted by Ethan", "slug": "ethan_submitted", "position": 0, "pipeline_id": self.ETHAN_PIPELINE_ID, "is_system": False},
                {"id": "ethan-review", "name": "Esther Review", "slug": "ethan_review", "position": 1, "pipeline_id": self.ETHAN_PIPELINE_ID, "is_system": False},
            ],
            "cases": [
                {"id": "firm-case", "status": "firm_intake", "pipeline_id": None},
                {"id": "ethan-case", "status": "ethan_submitted", "pipeline_id": self.ETHAN_PIPELINE_ID},
                # This deliberately malformed row proves deletion never performs an unscoped status update.
                {"id": "firm-case-with-referral-slug", "status": "ethan_submitted", "pipeline_id": None},
                {"id": "ethan-case-with-firm-slug", "status": "firm_intake", "pipeline_id": self.ETHAN_PIPELINE_ID},
            ],
        }

    def table(self, name):
        return _Query(self.rows[name])


class PipelineStageIsolationTests(unittest.TestCase):
    def _with_owner(self, callback):
        supabase = _Supabase()
        with patch.object(pipeline_stages, "get_supabase", return_value=supabase), patch.object(
            pipeline_stages, "_get_current_user", new=AsyncMock(return_value={"id": "owner-1", "role": "attorney"})
        ):
            result = callback(supabase)
        return result, supabase

    def test_referral_pipeline_returns_only_its_private_stages(self):
        result, _supabase = self._with_owner(
            lambda _supabase: asyncio.run(
                pipeline_stages.list_stages(_Supabase.ETHAN_PIPELINE_ID, "Bearer test")
            )
        )
        self.assertEqual([stage["id"] for stage in result], ["ethan-submitted", "ethan-review"])
        self.assertTrue(all(stage["pipeline_id"] == _Supabase.ETHAN_PIPELINE_ID for stage in result))

    def test_default_firm_stage_list_excludes_private_referral_stages(self):
        result, _supabase = self._with_owner(
            lambda _supabase: asyncio.run(pipeline_stages.list_stages(None, "Bearer test"))
        )
        self.assertEqual([stage["id"] for stage in result], ["firm-submitted", "firm-intake"])
        self.assertTrue(all(stage["pipeline_id"] is None for stage in result))

    def test_system_shared_stage_cannot_be_deleted(self):
        with self.assertRaises(HTTPException) as raised:
            self._with_owner(
                lambda _supabase: asyncio.run(
                    pipeline_stages.delete_stage("firm-submitted", "Bearer test")
                )
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_deleting_private_stage_moves_only_cases_in_that_private_pipeline(self):
        _result, supabase = self._with_owner(
            lambda _supabase: asyncio.run(
                pipeline_stages.delete_stage("ethan-submitted", "Bearer test")
            )
        )
        cases = {case["id"]: case for case in supabase.rows["cases"]}
        self.assertEqual(cases["ethan-case"]["status"], "ethan_review")
        self.assertEqual(cases["firm-case-with-referral-slug"]["status"], "ethan_submitted")

    def test_deleting_shared_non_system_stage_moves_only_firm_cases(self):
        _result, supabase = self._with_owner(
            lambda _supabase: asyncio.run(
                pipeline_stages.delete_stage("firm-intake", "Bearer test")
            )
        )
        cases = {case["id"]: case for case in supabase.rows["cases"]}
        self.assertEqual(cases["firm-case"]["status"], "submitted")
        self.assertEqual(cases["ethan-case-with-firm-slug"]["status"], "firm_intake")


if __name__ == "__main__":
    unittest.main()
