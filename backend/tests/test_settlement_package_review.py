import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from routers import settlement_packages as packages


class _Result:
    def __init__(self, data):
        self.data = data


class _UpdateQuery:
    def __init__(self, data):
        self.data = data
        self.payload = None

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        return _Result([self.data])


class _Supabase:
    def __init__(self, data):
        self.query = _UpdateQuery(data)

    def table(self, _name):
        return self.query


class SettlementPackageReviewTests(unittest.TestCase):
    def test_attachment_validation_rejects_invalid_extensions_and_empty_files(self):
        with self.assertRaises(HTTPException):
            packages._validate_attachment(b"", "agreement.pdf")
        with self.assertRaises(HTTPException):
            packages._validate_attachment(b"not-pdf", "agreement.exe")
        packages._validate_attachment(b"pdf-bytes", "agreement.pdf")

    def test_submitter_cannot_approve_own_package(self):
        async def run():
            with patch.object(packages, "_get_current_user", return_value={"id": "attorney-1", "role": "attorney"}), patch.object(
                packages, "_is_reviewer", return_value=True
            ), patch.object(
                packages, "_get_package_with_case", return_value={"id": "package-1", "submitted_by": "attorney-1", "status": "awaiting_review"}
            ):
                with self.assertRaises(HTTPException) as error:
                    await packages.approve_settlement_package("package-1", packages.ReviewDecision(), authorization="Bearer token")
                self.assertEqual(error.exception.status_code, 403)

        asyncio.run(run())

    def test_independent_approval_stages_documents_without_sending_client_email(self):
        async def run():
            package = {
                "id": "package-1",
                "case_id": "case-1",
                "submitted_by": "attorney-1",
                "status": "awaiting_review",
                "settlement_storage_path": "settlement-review/case-1/package-1/settlement.pdf",
                "credit_disclosure_storage_path": "settlement-review/case-1/package-1/disclosure.pdf",
            }
            updated = {**package, "status": "approved"}
            supabase = _Supabase(updated)
            with patch.object(packages, "_get_current_user", return_value={"id": "reviewer-1", "role": "attorney"}), patch.object(
                packages, "_is_reviewer", return_value=True
            ), patch.object(
                packages, "_get_package_with_case", return_value=package
            ), patch.object(packages, "get_supabase", return_value=supabase), patch.object(
                packages, "_stage_case_document", side_effect=[{"id": "settlement-doc"}, {"id": "disclosure-doc"}]
            ) as stage, patch.object(packages, "_event") as event:
                result = await packages.approve_settlement_package(
                    "package-1", packages.ReviewDecision(comments="Approved for client delivery."), authorization="Bearer token"
                )

            self.assertEqual(result["status"], "approved")
            self.assertEqual(stage.call_count, 2)
            self.assertEqual(supabase.query.payload["settlement_document_id"], "settlement-doc")
            self.assertEqual(supabase.query.payload["credit_disclosure_document_id"], "disclosure-doc")
            event.assert_called_once()

        asyncio.run(run())

    def test_owner_reviewer_cannot_submit_for_review(self):
        with patch.object(packages, "_is_reviewer", return_value=True):
            with self.assertRaises(HTTPException) as error:
                packages._require_submitter({"id": "owner-1", "role": "attorney"})
        self.assertEqual(error.exception.status_code, 403)

    def test_submitting_attorney_cannot_review(self):
        with patch.object(packages, "_is_reviewer", return_value=False):
            with self.assertRaises(HTTPException) as error:
                packages._require_reviewer({"id": "attorney-2", "role": "staff_attorney"})
        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
