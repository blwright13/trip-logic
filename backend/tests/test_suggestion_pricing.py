import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from post_itinerary_graph import (  # noqa: E402
    _hotel_total_price_estimate,
    _price_level_to_estimate,
    _suggestion_price_estimate,
)
from models import ChatMessageResponse  # noqa: E402


class SuggestionPricingTest(unittest.TestCase):
    def test_uses_google_places_price_level_when_present(self) -> None:
        self.assertEqual(_price_level_to_estimate("PRICE_LEVEL_EXPENSIVE", fallback="$$"), "$$$")
        self.assertEqual(_price_level_to_estimate("2", fallback="$"), "$$")

    def test_uses_visible_fallback_when_google_places_has_no_price(self) -> None:
        self.assertEqual(_price_level_to_estimate(None, fallback="$$"), "$$")
        self.assertEqual(_price_level_to_estimate("PRICE_LEVEL_UNSPECIFIED", fallback="$"), "$")

    def test_suggestion_fallback_estimates_are_visible_by_category(self) -> None:
        self.assertEqual(_suggestion_price_estimate("food", {"dining_style": "Fine dining"}), "$$$")
        self.assertEqual(_suggestion_price_estimate("hotel", {"accommodation_quality": "Budget"}), "$")
        self.assertEqual(_suggestion_price_estimate("tour", {"activity_vibe": "Outdoorsy & active"}), "Free")

    def test_hotel_price_estimate_is_total_for_travelers_and_nights(self) -> None:
        label, cost = _hotel_total_price_estimate(
            price_level=None,
            fallback_tier="$$",
            start_date="2026-06-01",
            end_date="2026-06-05",
            travelers=4,
        )

        self.assertEqual(label, "$1,600 total")
        self.assertEqual(cost, 1600)

    def test_suggestion_card_preserves_numeric_estimated_cost(self) -> None:
        card = ChatMessageResponse.SuggestionCard(
            type="hotel",
            title="Hotel option",
            estimated_price="$1,600 total",
            estimated_cost=1600,
        )

        self.assertEqual(card.model_dump()["estimated_cost"], 1600)


if __name__ == "__main__":
    unittest.main()
