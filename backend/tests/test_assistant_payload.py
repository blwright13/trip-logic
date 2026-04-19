import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import _extract_assistant_payload  # noqa: E402


class AssistantPayloadTest(unittest.TestCase):
    def test_plain_text_chips_section_is_not_returned_as_content(self) -> None:
        payload = _extract_assistant_payload(
            """
Done - I replaced Tour of the Channel Gardens with Visit the Statue of Liberty on Day 3.

Chips:
- Show me the updated Day 3 schedule
- Suggest a good lunch near Battery Park
- Add ferry ticket costs if needed
"""
        )

        self.assertIsNotNone(payload)
        content, chips = payload
        self.assertNotIn("Chips:", content)
        self.assertEqual(
            chips,
            [
                "Show me the updated Day 3 schedule",
                "Suggest a good lunch near Battery Park",
                "Add ferry ticket costs if needed",
            ],
        )


if __name__ == "__main__":
    unittest.main()
