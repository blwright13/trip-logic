import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from post_itinerary_graph import (  # noqa: E402
    _classify_intent_fallback,
    _specific_experience_query,
    _unspecified_activity_request_should_add,
)


class ExperienceRequestTest(unittest.TestCase):
    def test_extracts_specific_activity_query_from_day_request(self) -> None:
        self.assertEqual(
            _specific_experience_query("I want to go see the statue of liberty on day 3", "NYC"),
            "statue of liberty in NYC",
        )

    def test_generic_activity_requests_do_not_extract_specific_query(self) -> None:
        self.assertIsNone(_specific_experience_query("Show me things to do on day 3", "NYC"))
        self.assertIsNone(_specific_experience_query("Give me other activity options for day 3", "NYC"))

    def test_unspecified_specific_activity_request_defaults_to_add_choice(self) -> None:
        self.assertTrue(_unspecified_activity_request_should_add("I want to go see the statue of liberty on day 3"))
        self.assertFalse(_unspecified_activity_request_should_add("Replace my morning activity with the statue of liberty"))
        self.assertFalse(_unspecified_activity_request_should_add("Give me other activity options for day 3"))

    def test_fallback_classifier_recognizes_specific_sightseeing_request(self) -> None:
        intent, _apply_mode, _replace_id, replace_category, _target_date = _classify_intent_fallback(
            "I want to go see the statue of liberty on day 3"
        )

        self.assertEqual(intent, "suggest_experiences")
        self.assertEqual(replace_category, "sightseeing")


if __name__ == "__main__":
    unittest.main()
