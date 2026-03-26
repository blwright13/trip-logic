from __future__ import annotations

from copy import deepcopy
from typing import Any


def swap_day_activity_times_and_positions(
    plans: dict[str, list[dict[str, Any]]],
    *,
    plan: str,
    day_number: int,
    source_activity_id: str,
    target_activity_id: str,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    if source_activity_id == target_activity_id:
        raise ValueError("Choose two different itinerary items to swap")

    updated_plans = deepcopy(plans)
    day = next((entry for entry in updated_plans.get(plan, []) if int(entry["day"]) == int(day_number)), None)
    if not day:
        raise ValueError("Day not found")

    activities = day.get("activities", [])
    source_index = next((index for index, item in enumerate(activities) if item.get("id") == source_activity_id), None)
    target_index = next((index for index, item in enumerate(activities) if item.get("id") == target_activity_id), None)
    if source_index is None or target_index is None:
        raise ValueError("Activity not found")

    source_activity = deepcopy(activities[source_index])
    target_activity = deepcopy(activities[target_index])

    source_time = source_activity.get("time")
    target_time = target_activity.get("time")
    source_activity["time"] = target_time
    target_activity["time"] = source_time

    activities[source_index] = target_activity
    activities[target_index] = source_activity

    return updated_plans, {
        "plan": plan,
        "day": day_number,
        "source_activity": {
            "id": source_activity_id,
            "name": source_activity.get("name"),
            "new_time": source_activity.get("time"),
        },
        "target_activity": {
            "id": target_activity_id,
            "name": target_activity.get("name"),
            "new_time": target_activity.get("time"),
        },
    }
