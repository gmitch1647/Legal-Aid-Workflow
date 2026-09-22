"""Regression coverage for legacy Microsoft Word document support."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from docx import Document
from fastapi import HTTPException

from routers import closing_statements, settlement_packages
from utils.document_reader import OLE_COMPOUND_FILE_HEADER, extract_document_text


class LegacyWordDocumentSupportTests(unittest.TestCase):
    def test_legacy_word_is_allowed_for_settlement_package_review(self):
        settlement_packages._validate_attachment(OLE_COMPOUND_FILE_HEADER + b"legacy-word", "agreement.doc")

    def test_closing_statement_reads_legacy_word_through_shared_converter(self):
        with patch.object(closing_statements, "_read_doc", return_value="Settlement amount is $1,250.00.") as reader:
            extracted = closing_statements._read_settlement_upload(b"legacy-word", "application/msword", "agreement.doc")

        self.assertIn("1,250.00", extracted)
        reader.assert_called_once_with(b"legacy-word")

    def test_invalid_legacy_word_bytes_are_rejected_before_conversion(self):
        with self.assertRaises(ValueError):
            extract_document_text(b"not-a-word-document", "doc")

    @unittest.skipUnless(shutil.which("libreoffice") or shutil.which("soffice"), "LibreOffice is required for legacy Word conversion")
    def test_legacy_word_text_is_extracted_with_libreoffice(self):
        with tempfile.TemporaryDirectory(prefix="legalflow-legacy-word-test-") as temporary_directory:
            workdir = Path(temporary_directory)
            source_docx = workdir / "agreement.docx"
            legacy_doc = workdir / "agreement.doc"
            document = Document()
            document.add_paragraph("Legacy settlement agreement: the total settlement amount is $1,250.00.")
            document.save(source_docx)

            office_binary = shutil.which("libreoffice") or shutil.which("soffice")
            completed = subprocess.run(
                [
                    office_binary,
                    f"-env:UserInstallation={(workdir / 'office-profile').as_uri()}",
                    "--headless",
                    "--nologo",
                    "--nodefault",
                    "--nofirststartwizard",
                    "--convert-to",
                    "doc",
                    "--outdir",
                    str(workdir),
                    str(source_docx),
                ],
                check=False,
                capture_output=True,
                timeout=60,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr.decode("utf-8", errors="ignore"))
            self.assertTrue(legacy_doc.exists())

            extracted = extract_document_text(legacy_doc.read_bytes(), "doc")
            self.assertIn("total settlement amount is $1,250.00", extracted)


if __name__ == "__main__":
    unittest.main()
