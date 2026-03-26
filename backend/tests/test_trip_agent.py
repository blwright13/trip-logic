from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.seed_data import build_demo_trip
from app.trip_agent import execute_tool, generate_trip_chat_response
from app.itinerary_ops import swap_day_activity_times_and_positions


class TripAgentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        payload = build_demo_trip().model_dump(mode="json")
        self.trip = SimpleNamespace(id=1, **payload)

    async def test_agent_answers_night_one_lodging_from_plan_a(self) -> None:
        mock_generate_text = AsyncMock(
            side_effect=[
                '{"type":"tool_call","tool":"find_lodging_for_night","arguments":{"plan":"A","night":1}}',
                '{"type":"final","response":"On night 1 of Plan A, you are staying at Shinjuku Hotel in Shinjuku, Tokyo."}',
            ]
        )

        with patch("app.trip_agent.generate_text", mock_generate_text):
            reply = await generate_trip_chat_response(
                trip=self.trip,
                message="Where am I staying on night 1 according to plan A?",
                selected_plan="A",
            )

        self.assertIn("Shinjuku Hotel", reply.response)
        self.assertEqual(reply.chips[0], "Show me that day")

    def test_lodging_tool_finds_budget_plan_hotel(self) -> None:
        result = execute_tool(
            trip=self.trip,
            selected_plan="A",
            tool_name="find_lodging_for_night",
            arguments={"plan": "B", "night": 1},
        )

        self.assertTrue(result["found"])
        self.assertEqual(result["lodging"]["name"], "Check in at Capsule Hotel")
        self.assertEqual(result["lodging"]["location"], "Shinjuku, Tokyo")

    def test_swap_helper_swaps_position_and_time(self) -> None:
        updated_plans, details = swap_day_activity_times_and_positions(
            self.trip.plans,
            plan="A",
            day_number=1,
            source_activity_id="1b",
            target_activity_id="1d",
        )

        activities = updated_plans["A"][0]["activities"]
        self.assertEqual(activities[1]["id"], "1d")
        self.assertEqual(activities[3]["id"], "1b")
        self.assertEqual(activities[1]["time"], "1:00 PM")
        self.assertEqual(activities[3]["time"], "4:00 PM")
        self.assertEqual(details["source_activity"]["new_time"], "4:00 PM")
        self.assertEqual(details["target_activity"]["new_time"], "1:00 PM")

    async def test_agent_can_swap_day_activities(self) -> None:
        mock_generate_text = AsyncMock(
            side_effect=[
                '{"type":"tool_call","tool":"swap_day_activities","arguments":{"plan":"A","day":1,"source_activity_id":"1b","target_activity_id":"1d"}}',
                '{"type":"final","response":"I swapped Check in at Shinjuku Hotel with Meiji Shrine on Day 1 of Plan A and flipped their times."}',
            ]
        )

        with patch("app.trip_agent.generate_text", mock_generate_text):
            reply = await generate_trip_chat_response(
                trip=self.trip,
                message="Swap the hotel check-in with Meiji Shrine on day 1",
                selected_plan="A",
            )

        self.assertIsNotNone(reply.updated_plans)
        activities = reply.updated_plans["A"][0]["activities"]
        self.assertEqual(activities[1]["id"], "1d")
        self.assertEqual(activities[1]["time"], "1:00 PM")
        self.assertIn("flipped their times", reply.response)


if __name__ == "__main__":
    unittest.main()
