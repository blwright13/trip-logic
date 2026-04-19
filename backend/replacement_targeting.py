from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models import Activity, Trip


@dataclass(frozen=True)
class ReplacementContext:
    apply_mode: str
    replace_activity_id: Optional[int]
    replace_category: Optional[str]
    target_date: Optional[str]
    meal: Optional[str] = None


_DAY_RE = re.compile(r"\bday\s*(\d+)\b", re.IGNORECASE)

_MEAL_WINDOWS = {
    "breakfast": (time(6, 0), time(10, 30), time(8, 0)),
    "lunch": (time(11, 0), time(14, 30), time(12, 30)),
    "dinner": (time(17, 0), time(22, 0), time(18, 30)),
}

_RELATED_CATEGORIES = {
    "food": ["food", "cafe"],
    "cafe": ["cafe", "food"],
    "sightseeing": ["sightseeing", "entertainment"],
    "entertainment": ["entertainment", "sightseeing"],
}


def normalize_apply_mode(raw: object) -> str:
    mode = str(raw or "").strip().lower()
    return "add" if mode == "add" else "replace"


def _parse_day_number(message: str) -> Optional[int]:
    match = _DAY_RE.search(message or "")
    if not match:
        return None
    try:
        day_number = int(match.group(1))
    except ValueError:
        return None
    return day_number if day_number > 0 else None


def _target_date_from_day(trip: Trip, day_number: Optional[int]) -> Optional[str]:
    if day_number is None:
        return None
    try:
        start = date.fromisoformat(str(trip.start))
    except (TypeError, ValueError):
        return None
    return (start + timedelta(days=day_number - 1)).isoformat()


def _infer_meal(message: str) -> Optional[str]:
    text = (message or "").lower()
    for meal in ("breakfast", "lunch", "dinner"):
        if meal in text:
            return meal
    return None


def _infer_category(message: str, replace_category: Optional[str], meal: Optional[str]) -> Optional[str]:
    if replace_category:
        return str(replace_category).strip().lower()
    if meal:
        return "food"

    text = (message or "").lower()
    if any(word in text for word in ("hotel", "lodging", "stay", "accommodation")):
        return "hotel"
    if any(word in text for word in ("flight", "airline", "airport", "fly")):
        return "flight"
    if any(word in text for word in ("restaurant", "cafe", "food", "meal", "eat")):
        return "food"
    if any(word in text for word in ("tour", "activity", "attraction", "museum", "sightseeing")):
        return "sightseeing"
    return None


def _category_values(category: Optional[str]) -> list[str]:
    if not category:
        return []
    raw = str(category).strip().lower()
    return _RELATED_CATEGORIES.get(raw, [raw])


def _activity_datetime(activity: Activity) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(activity.start).replace("Z", ""))
    except (TypeError, ValueError):
        return None


def _matches_category(activity: Activity, category: Optional[str]) -> bool:
    values = _category_values(category)
    if not values:
        return True
    return activity.category.value in values


def _matches_date(activity: Activity, target_date: Optional[str]) -> bool:
    if not target_date:
        return True
    activity_dt = _activity_datetime(activity)
    return activity_dt is not None and activity_dt.date().isoformat() == target_date


def _matches_meal(activity: Activity, meal: Optional[str]) -> bool:
    if not meal:
        return True
    activity_dt = _activity_datetime(activity)
    if activity_dt is None:
        return False
    window = _MEAL_WINDOWS.get(meal)
    if not window:
        return True
    start, end, _preferred = window
    return start <= activity_dt.time() <= end


def _valid_activity(
    activity: Optional[Activity],
    trip_id: int,
    target_date: Optional[str],
    category: Optional[str],
    meal: Optional[str],
) -> bool:
    if not activity or activity.trip_id != trip_id:
        return False
    return (
        _matches_date(activity, target_date)
        and _matches_category(activity, category)
        and _matches_meal(activity, meal)
    )


def _meal_distance_minutes(activity: Activity, meal: Optional[str]) -> int:
    if not meal:
        return 0
    activity_dt = _activity_datetime(activity)
    window = _MEAL_WINDOWS.get(meal)
    if activity_dt is None or not window:
        return 0
    preferred = window[2]
    actual_minutes = activity_dt.hour * 60 + activity_dt.minute
    preferred_minutes = preferred.hour * 60 + preferred.minute
    return abs(actual_minutes - preferred_minutes)


def _resolve_activity(
    db: Session,
    trip_id: int,
    target_date: Optional[str],
    category: Optional[str],
    meal: Optional[str],
) -> Optional[Activity]:
    query = db.query(Activity).filter(Activity.trip_id == trip_id)
    if target_date:
        query = query.filter(
            Activity.start >= f"{target_date}T00:00:00",
            Activity.start <= f"{target_date}T23:59:59",
        )
    activities = query.order_by(Activity.start).all()
    candidates = [
        activity
        for activity in activities
        if _matches_category(activity, category) and _matches_meal(activity, meal)
    ]
    if not candidates:
        return None
    return sorted(candidates, key=lambda activity: (_meal_distance_minutes(activity, meal), activity.start))[0]


def resolve_replacement_context(
    db: Session,
    trip: Trip,
    user_message: str = "",
    apply_mode: object = "replace",
    replace_activity_id: Optional[int] = None,
    replace_category: Optional[str] = None,
    target_date: Optional[str] = None,
) -> ReplacementContext:
    mode = normalize_apply_mode(apply_mode)
    meal = _infer_meal(user_message)
    day_target_date = _target_date_from_day(trip, _parse_day_number(user_message))
    resolved_date = day_target_date or target_date
    resolved_category = _infer_category(user_message, replace_category, meal)

    if mode == "add":
        return ReplacementContext(mode, replace_activity_id, resolved_category, resolved_date, meal)

    model_activity = None
    if replace_activity_id:
        model_activity = (
            db.query(Activity)
            .filter(Activity.id == replace_activity_id, Activity.trip_id == trip.id)
            .first()
        )
    if _valid_activity(model_activity, trip.id, resolved_date, resolved_category, meal):
        return ReplacementContext(
            mode,
            model_activity.id,
            resolved_category or model_activity.category.value,
            resolved_date or (model_activity.start or "")[:10],
            meal,
        )

    resolved_activity = _resolve_activity(db, trip.id, resolved_date, resolved_category, meal)
    return ReplacementContext(
        mode,
        resolved_activity.id if resolved_activity else None,
        resolved_category,
        resolved_date,
        meal,
    )
