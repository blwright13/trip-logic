import unittest
from pathlib import Path


class ItineraryPromptFlightOrderingTest(unittest.TestCase):
    def test_itinerary_builder_prompt_requires_flight_ordering(self) -> None:
        prompt_source = Path("backend/itinerary_agent.py").read_text(encoding="utf-8")
        self.assertIn(
            "If an outbound (initial) flight exists, it must be the first activity in the itinerary.",
            prompt_source,
        )
        self.assertIn(
            "If a return flight exists, it must be the final activity in the itinerary.",
            prompt_source,
        )


if __name__ == "__main__":
    unittest.main()
