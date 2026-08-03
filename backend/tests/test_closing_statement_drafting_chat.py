"""Regression coverage for the case-linked Closing Statement drafting chat."""

import unittest

from agents.interactive_agent import AGENT_DISPLAY_NAMES, AGENT_SYSTEM_PROMPTS


class ClosingStatementDraftingChatTests(unittest.TestCase):
    """The inline statement chat must remain purpose-built and attorney-controlled."""

    def test_drafting_agent_is_available_and_guarded(self):
        prompt = AGENT_SYSTEM_PROMPTS["closing_statement_drafter"]

        self.assertEqual(AGENT_DISPLAY_NAMES["closing_statement_drafter"], "Closing Statement Drafter")
        self.assertIn("Use only facts supplied by the attorney", prompt)
        self.assertIn("Never alter, calculate, or invent settlement figures", prompt)
        self.assertIn("attorney must explicitly choose", prompt)
        self.assertIn("attorney review", prompt)


if __name__ == "__main__":
    unittest.main()
