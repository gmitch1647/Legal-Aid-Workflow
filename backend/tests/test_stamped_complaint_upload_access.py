import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from routers import documents


class _ProfileQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def execute(self):
        matched = self.rows
        for column, value in self.filters:
            matched = [row for row in matched if str(row.get(column)) == value]
        return SimpleNamespace(data=matched)


class _ProfileSupabase:
    def __init__(self, profile_rows):
        self.profile_rows = profile_rows

    def table(self, name):
        self.asserted_table = name
        return _ProfileQuery(self.profile_rows)


class StampedComplaintUploadAccessTests(unittest.TestCase):
    case = {"id": "case-1", "client_id": "client-1"}

    def test_owner_can_upload_stamped_complaint(self):
        documents._require_stamped_complaint_uploader(
            _ProfileSupabase([]),
            {"id": "owner-1", "role": "attorney"},
            self.case,
        )

    def test_assigned_staff_attorney_can_upload_stamped_complaint(self):
        documents._require_stamped_complaint_uploader(
            _ProfileSupabase([{"id": "client-1", "assigned_attorney_id": "staff-1"}]),
            {"id": "staff-1", "role": "staff_attorney"},
            self.case,
        )

    def test_unassigned_staff_attorney_is_blocked(self):
        with self.assertRaises(HTTPException) as raised:
            documents._require_stamped_complaint_uploader(
                _ProfileSupabase([{"id": "client-1", "assigned_attorney_id": "staff-1"}]),
                {"id": "staff-2", "role": "staff_attorney"},
                self.case,
            )
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
