import asyncio
import importlib
import io
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class CaseReferralFormTests(unittest.TestCase):
    def setUp(self):
        self.intake = importlib.import_module("routers.intake")

    @staticmethod
    def upload(name="credit-report.pdf", content=b"sample document", content_type="application/pdf"):
        return UploadFile(filename=name, file=io.BytesIO(content), headers={"content-type": content_type})

    def test_referral_document_validation_requires_a_file(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.intake._prepare_referral_documents([]))
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("supporting document", error.exception.detail.lower())

    def test_referral_document_validation_blocks_unsupported_file_types(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.intake._prepare_referral_documents([self.upload("unsafe.exe")]))
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("not an accepted", error.exception.detail.lower())

    def test_uncertified_referral_is_rejected_before_case_creation(self):
        submit_mock = AsyncMock()
        with patch.object(self.intake, "submit_intake", submit_mock):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(self.intake.submit_case_referral(
                    first_name="Referral",
                    last_name="Client",
                    email="referral.client@example.com",
                    phone="5555551212",
                    date_of_birth="1990-01-01",
                    address="10 Main Street",
                    city="Atlanta",
                    state="Georgia",
                    zip_code="30301",
                    case_type="FCRA",
                    violation_type="E8",
                    specific_violation="",
                    adverse_party="Example Furnisher",
                    brief_description="Incorrect reporting after a dispute.",
                    affiliate_name="Example Referral Partner",
                    requested_assistance="LegalFlow Intake Team",
                    certification="false",
                    files=[self.upload()],
                ))
        self.assertEqual(error.exception.status_code, 422)
        submit_mock.assert_not_awaited()

    def test_certified_referral_creates_submitted_case_and_keeps_documents_internal(self):
        created = {"case_id": "case-submitted-123", "status": "success", "suitedash_synced": False}
        submit_mock = AsyncMock(return_value=created.copy())
        store_mock = unittest.mock.Mock(return_value=1)

        with patch.object(self.intake, "submit_intake", submit_mock), patch.object(self.intake, "_store_prepared_referral_documents", store_mock):
            result = asyncio.run(self.intake.submit_case_referral(
                first_name="Referral",
                last_name="Client",
                email="referral.client@example.com",
                phone="5555551212",
                date_of_birth="1990-01-01",
                address="10 Main Street",
                city="Atlanta",
                state="Georgia",
                zip_code="30301",
                case_type="FCRA",
                violation_type="E8",
                specific_violation="",
                adverse_party="Example Furnisher",
                brief_description="Incorrect reporting after a dispute.",
                affiliate_name="Example Referral Partner",
                requested_assistance="LegalFlow Intake Team",
                certification="true",
                files=[self.upload()],
            ))

        self.assertEqual(result["case_id"], "case-submitted-123")
        self.assertEqual(result["files_uploaded"], 1)
        self.assertIn("Case Submission", result["message"])
        submitted_body = submit_mock.await_args.args[0]
        self.assertFalse(submitted_body.sync_to_suitedash)
        self.assertEqual(submitted_body.requested_assistance, "LegalFlow Intake Team")
        store_mock.assert_called_once()

    def test_partner_specific_referral_uses_workspace_slug_and_internal_partner_name(self):
        created = {"case_id": "case-submitted-456", "status": "success"}
        submit_mock = AsyncMock(return_value=created.copy())
        workspace = {
            "id": "partner-ethan",
            "full_name": "Ethan Babb",
            "submission_slug": "ethan-babb-referrals",
            "assigned_attorney_id": "esther-profile",
            "pipeline_id": "ethan-pipeline",
        }
        with patch.object(self.intake, "submit_intake", submit_mock), patch.object(self.intake, "_store_prepared_referral_documents", return_value=1), patch.object(self.intake, "_active_referral_partner_for_slug", return_value=workspace) as workspace_mock:
            asyncio.run(self.intake.submit_case_referral(
                first_name="Referral",
                last_name="Client",
                email="referral.client@example.com",
                phone="5555551212",
                date_of_birth="1990-01-01",
                address="10 Main Street",
                city="Atlanta",
                state="Georgia",
                zip_code="30301",
                case_type="FCRA",
                violation_type="E8",
                specific_violation="",
                adverse_party="Example Furnisher",
                brief_description="Incorrect reporting after a dispute.",
                affiliate_name="Untrusted Public Value",
                requested_assistance="LegalFlow Intake Team",
                referral_slug="ethan-babb-referrals",
                certification="true",
                files=[self.upload()],
            ))
        workspace_mock.assert_called_once_with("ethan-babb-referrals")
        submitted_body = submit_mock.await_args.args[0]
        self.assertEqual(submitted_body.affiliate_name, "Ethan Babb")
        self.assertEqual(submitted_body.referral_slug, "ethan-babb-referrals")
        self.assertFalse(submitted_body.sync_to_suitedash)

    def test_partner_referral_accepts_complaint_and_locks_main_legalflow_esther_routing(self):
        created = {"case_id": "case-submitted-complaint", "status": "success"}
        submit_mock = AsyncMock(return_value=created.copy())
        store_mock = unittest.mock.Mock(return_value=1)
        workspace = {
            "id": "partner-ethan",
            "full_name": "Ethan Babb",
            "submission_slug": "ethan-babb-referrals",
            "assigned_attorney_id": "esther-profile",
            "pipeline_id": "ethan-pipeline",
        }
        with patch.object(self.intake, "submit_intake", submit_mock), patch.object(self.intake, "_store_prepared_referral_documents", store_mock), patch.object(self.intake, "_active_referral_partner_for_slug", return_value=workspace):
            result = asyncio.run(self.intake.submit_case_referral(
                first_name="Referral",
                last_name="Client",
                email="referral.client@example.com",
                phone="5555551212",
                date_of_birth="1990-01-01",
                address="10 Main Street",
                city="Atlanta",
                state="Georgia",
                zip_code="30301",
                case_type="FCRA",
                violation_type="E8",
                specific_violation="",
                adverse_party="Example Furnisher",
                brief_description="Incorrect reporting after a dispute.",
                affiliate_name="Untrusted Public Value",
                requested_assistance="No preference",
                referral_slug="ethan-babb-referrals",
                certification="true",
                files=[],
                complaint=self.upload("existing-complaint.pdf"),
            ))

        self.assertTrue(result["complaint_uploaded"])
        submitted_body = submit_mock.await_args.args[0]
        self.assertEqual(submitted_body.requested_assistance, "Main LegalFlow — Esther Oise")
        self.assertEqual(submitted_body.affiliate_name, "Ethan Babb")
        self.assertEqual(submitted_body.referral_slug, "ethan-babb-referrals")
        self.assertEqual(store_mock.call_args.kwargs["complaint"]["file_name"], "existing-complaint.pdf")


if __name__ == "__main__":
    unittest.main()
