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


if __name__ == "__main__":
    unittest.main()
