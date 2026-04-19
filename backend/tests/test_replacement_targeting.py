import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from main import ApplySuggestionRequest, apply_suggestion  # noqa: E402
from models import Activity, CategoryEnum, ChatMessageResponse, Trip  # noqa: E402
from replacement_targeting import resolve_replacement_context  # noqa: E402


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def add_trip_with_meals(db):
    trip = Trip(
        title="NYC",
        start="2026-06-01",
        end="2026-06-03",
        num_people=2,
        budget=1500,
        planning_phase="complete",
        planning_context={"destinations": ["NYC"]},
    )
    db.add(trip)
    db.flush()

    activities = [
        Activity(
            trip_id=trip.id,
            title="Day 1 lunch",
            category=CategoryEnum.food,
            start="2026-06-01T12:30:00",
            duration=60,
            cost=50,
            location="Midtown",
        ),
        Activity(
            trip_id=trip.id,
            title="Day 2 breakfast",
            category=CategoryEnum.food,
            start="2026-06-02T08:00:00",
            duration=45,
            cost=30,
            location="Chelsea",
        ),
        Activity(
            trip_id=trip.id,
            title="Day 2 lunch",
            category=CategoryEnum.food,
            start="2026-06-02T12:30:00",
            duration=60,
            cost=55,
            location="SoHo",
        ),
        Activity(
            trip_id=trip.id,
            title="Day 3 dinner",
            category=CategoryEnum.food,
            start="2026-06-03T18:30:00",
            duration=90,
            cost=90,
            location="West Village",
        ),
    ]
    db.add_all(activities)
    db.commit()
    for activity in activities:
        db.refresh(activity)
    db.refresh(trip)
    return trip, activities


class ReplacementTargetingTest(unittest.TestCase):
    def test_chat_suggestion_card_preserves_apply_metadata(self) -> None:
        card = ChatMessageResponse.SuggestionCard(
            type="food",
            title="Isla & Co. - Midtown",
            apply_mode="replace",
            replace_activity_id=42,
            replace_category="food",
            target_date="2026-06-02",
        )

        payload = card.model_dump()

        self.assertEqual(payload["apply_mode"], "replace")
        self.assertEqual(payload["replace_activity_id"], 42)
        self.assertEqual(payload["replace_category"], "food")
        self.assertEqual(payload["target_date"], "2026-06-02")

    def test_day_2_lunch_resolves_to_existing_lunch_activity(self) -> None:
        db = make_session()
        trip, activities = add_trip_with_meals(db)
        day_2_lunch = activities[2]

        context = resolve_replacement_context(
            db,
            trip,
            "Give me some other lunch options for day 2",
            apply_mode="replace",
            replace_activity_id=None,
            replace_category="food",
            target_date=None,
        )

        self.assertEqual(context.apply_mode, "replace")
        self.assertEqual(context.replace_activity_id, day_2_lunch.id)
        self.assertEqual(context.replace_category, "food")
        self.assertEqual(context.target_date, "2026-06-02")

    def test_wrong_model_id_is_corrected_by_day_and_meal(self) -> None:
        db = make_session()
        trip, activities = add_trip_with_meals(db)
        wrong_day_lunch = activities[0]
        day_2_lunch = activities[2]

        context = resolve_replacement_context(
            db,
            trip,
            "Give me some other lunch options for day 2",
            apply_mode="replace",
            replace_activity_id=wrong_day_lunch.id,
            replace_category="food",
            target_date="2026-06-01",
        )

        self.assertEqual(context.replace_activity_id, day_2_lunch.id)
        self.assertEqual(context.target_date, "2026-06-02")

    def test_replace_without_target_returns_conflict_instead_of_adding(self) -> None:
        db = make_session()
        trip = Trip(
            title="NYC",
            start="2026-06-01",
            end="2026-06-03",
            num_people=2,
            budget=1500,
            planning_phase="complete",
            planning_context={},
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)

        with self.assertRaises(HTTPException) as raised:
            apply_suggestion(
                trip.id,
                ApplySuggestionRequest(
                    apply_mode="replace",
                    replace_category="food",
                    target_date="2026-06-02",
                    title="New lunch",
                    category="food",
                    location="SoHo",
                    cost=40,
                    duration=60,
                ),
                db=db,
                current_user=None,
            )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(db.query(Activity).count(), 0)


if __name__ == "__main__":
    unittest.main()
