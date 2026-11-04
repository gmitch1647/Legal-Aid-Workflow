"""Regression coverage for named client By fields with a left-hand DATED rule."""
import io
import unittest
from datetime import datetime, timezone

import fitz
from PIL import Image, ImageDraw
from routers import signing


class DatedLeftExecutionTests(unittest.TestCase):
    @staticmethod
    def agreement(*, date_label="DATED:", rules=True, recital=False):
        doc = fitz.open()
        doc.new_page().insert_text((72, 90), "Settlement Agreement")
        page = doc.new_page(width=612, height=792)
        page.insert_text((108, 150), "Client certification of voluntary execution", fontsize=14)
        page.insert_text((72, 250), date_label, fontsize=14)
        page.insert_text((324, 250), "By:", fontsize=14)
        page.insert_text((360, 264), "I, Marquisha General, certify" if recital else "Marquisha General", fontsize=14)
        page.insert_text((72, 320), "DATED:", fontsize=14)
        page.insert_text((324, 320), "Caine & Weiner Company, Inc.", fontsize=14)
        page.insert_text((324, 348), "By:", fontsize=14)
        if rules:
            # LibreOffice emits tab leaders as adjacent short drawing objects.
            for left, right, y in [(144, 252, 248), (360, 540, 248), (144, 252, 318), (360, 540, 346)]:
                for x in range(left, right, 36):
                    page.draw_line((x, y), (min(x + 36, right), y), width=.5)
        doc.new_page().insert_text((72, 90), "EXHIBIT A: no client execution fields")
        data = doc.tobytes()
        doc.close()
        return data

    @staticmethod
    def signature():
        image = Image.new("RGB", (250, 60), "white")
        ImageDraw.Draw(image).text((5, 12), "TEST ONLY", fill="black")
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def test_segmented_date_left_fields_are_selected_by_client_name(self):
        source = self.agreement()
        for date_label in ["DATED:", "Date:", "dated:"]:
            with self.subTest(date_label=date_label):
                placement = signing._native_execution_placement_from_pdf(
                    self.agreement(date_label=date_label), "Marquisha General"
                )
                self.assertEqual(placement["strategy"], "dated_left_named_client_execution_block")
                self.assertEqual(placement["layout"], "horizontal_date_left")
                self.assertEqual(placement["page"], 1)
                self.assertGreaterEqual(placement["signature_rect"][0], 360)
                self.assertLessEqual(placement["signature_rect"][2], 540)
                self.assertLessEqual(placement["signature_rect"][3], 250)
                self.assertGreaterEqual(placement["date_origin"][0], 144)
                self.assertLess(placement["date_origin"][0], 252)
        signed, placement = signing._embed_signature(
            source, self.signature(), "Marquisha General", "Marquisha General",
            document_type="settlement", return_placement=True,
        )
        before = fitz.open(stream=source, filetype="pdf")
        after = fitz.open(stream=signed, filetype="pdf")
        self.assertEqual(len(before), len(after))
        self.assertEqual(before[2].get_text(), after[2].get_text())
        self.assertEqual(len(before[1].get_images()), 0)
        self.assertEqual(len(after[1].get_images()), 1)
        self.assertIn(datetime.now(timezone.utc).strftime("%m/%d/%Y"), after[1].get_text())
        self.assertNotIn(datetime.now(timezone.utc).strftime("%m/%d/%Y"), after[2].get_text())
        before.close()
        after.close()

    def test_layout_without_real_rules_still_blocks_primary_settlement(self):
        with self.assertRaisesRegex(ValueError, "could not locate"):
            signing._embed_signature(
                self.agreement(rules=False), self.signature(), "Marquisha General",
                "Marquisha General", document_type="settlement",
            )

    def test_new_date_left_strategy_rejects_wrong_signer(self):
        doc = fitz.open(stream=self.agreement(), filetype="pdf")
        self.assertIsNone(signing._dated_left_client_execution_placement(doc, "Different Client"))
        doc.close()

    def test_new_date_left_strategy_rejects_name_in_prose(self):
        doc = fitz.open(stream=self.agreement(recital=True), filetype="pdf")
        self.assertIsNone(signing._dated_left_client_execution_placement(doc, "Marquisha General"))
        doc.close()

    def test_closing_acknowledgment_prose_is_not_used_as_signature_caption(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((59, 570), "I, Marquisha General, have reviewed and accepted this statement.")
        page.insert_text((59, 625), "APPROVED AND ACCEPTED:")
        page.draw_line((59, 661), (275, 661), width=.5)
        page.insert_text((59, 675), "Marquisha General, Client")
        page.insert_text((59, 694), "Date:")
        placement = signing._execution_block_placement(doc, "Marquisha General")
        self.assertEqual(placement["strategy"], "closing_statement_execution_block")
        self.assertGreater(placement["signature_rect"][1], 625)
        self.assertLess(placement["signature_rect"][3], 675)
        doc.close()


if __name__ == "__main__":
    unittest.main()
