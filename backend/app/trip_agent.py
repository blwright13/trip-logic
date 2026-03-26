from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from . import models
from .gemini import generate_text
from .itinerary_ops import swap_day_activity_times_and_positions

TOOL_NAMES = (
    "get_trip_overview",
    "get_plan_summary",
    "get_day_details",
    "find_lodging_for_night",
    "search_activities",
    "swap_day_activities",
    "get_recent_chat_history",
)


@dataclass
class AgentReply:
    response: str
    chips: List[str]
    updated_plans: Dict[str, Any] | None = None


def _trip_overview(trip: models.Trip) -> Dict[str, Any]:
    return {
        "trip_id": trip.id,
        "title": trip.title,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "travelers": trip.travelers,
        "budget": trip.budget,
        "available_plans": sorted(trip.plans.keys()),
    }


def _find_day(trip: models.Trip, plan: str, day_number: int) -> Optional[Dict[str, Any]]:
    for day in trip.plans.get(plan, []):
        if int(day["day"]) == day_number:
            return day
    return None


def _lodging_candidates(day: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        activity
        for activity in day.get("activities", [])
        if str(activity.get("category", "")).lower() in {"hotel", "lodging", "accommodation"}
    ]


def _format_activity(activity: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": activity.get("id"),
        "name": activity.get("name"),
        "time": activity.get("time"),
        "location": activity.get("location"),
        "category": activity.get("category"),
        "cost": activity.get("cost"),
    }


def execute_tool(
    *,
    trip: models.Trip,
    selected_plan: str,
    tool_name: str,
    arguments: Dict[str, Any],
) -> Dict[str, Any]:
    if tool_name not in TOOL_NAMES:
        raise ValueError(f"Unsupported tool: {tool_name}")

    if tool_name == "get_trip_overview":
        return _trip_overview(trip)

    if tool_name == "get_plan_summary":
        plan = str(arguments.get("plan") or selected_plan)
        days = trip.plans.get(plan, [])
        return {
            "plan": plan,
            "days": [
                {
                    "day": day["day"],
                    "date": day["date"],
                    "activity_names": [activity["name"] for activity in day.get("activities", [])],
                }
                for day in days
            ],
        }

    if tool_name == "get_day_details":
        plan = str(arguments.get("plan") or selected_plan)
        day_number = int(arguments["day"])
        day = _find_day(trip, plan, day_number)
        if not day:
            return {"plan": plan, "day": day_number, "found": False}
        return {
            "plan": plan,
            "day": day_number,
            "date": day["date"],
            "activities": [_format_activity(activity) for activity in day.get("activities", [])],
        }

    if tool_name == "find_lodging_for_night":
        plan = str(arguments.get("plan") or selected_plan)
        night = int(arguments["night"])
        days = trip.plans.get(plan, [])
        latest_lodging: Optional[Dict[str, Any]] = None
        latest_day: Optional[Dict[str, Any]] = None
        for day in days:
            if int(day["day"]) > night:
                break
            hotels = _lodging_candidates(day)
            if hotels:
                latest_lodging = hotels[-1]
                latest_day = day

        if not latest_lodging or not latest_day:
            return {"plan": plan, "night": night, "found": False}

        return {
            "plan": plan,
            "night": night,
            "found": True,
            "date": latest_day["date"],
            "lodging": _format_activity(latest_lodging),
        }

    if tool_name == "search_activities":
        plan = str(arguments.get("plan") or selected_plan)
        query = str(arguments.get("query", "")).strip().lower()
        category = str(arguments.get("category", "")).strip().lower()
        day_number = arguments.get("day")
        days = trip.plans.get(plan, [])
        results: List[Dict[str, Any]] = []
        for day in days:
            if day_number is not None and int(day["day"]) != int(day_number):
                continue
            for activity in day.get("activities", []):
                haystack = " ".join(
                    str(activity.get(field, ""))
                    for field in ("name", "location", "category", "time")
                ).lower()
                if query and query not in haystack:
                    continue
                if category and str(activity.get("category", "")).lower() != category:
                    continue
                results.append(
                    {
                        "day": day["day"],
                        "date": day["date"],
                        **_format_activity(activity),
                    }
                )
        return {"plan": plan, "matches": results[:10]}

    if tool_name == "swap_day_activities":
        plan = str(arguments.get("plan") or selected_plan)
        day_number = int(arguments["day"])
        updated_plans, details = swap_day_activity_times_and_positions(
            trip.plans,
            plan=plan,
            day_number=day_number,
            source_activity_id=str(arguments["source_activity_id"]),
            target_activity_id=str(arguments["target_activity_id"]),
        )
        trip.plans = updated_plans
        return {"updated": True, **details}

    limit = int(arguments.get("limit", 6))
    return {"messages": trip.chat_messages[-limit:]}


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced_match:
        try:
            return json.loads(fenced_match.group(1))
        except json.JSONDecodeError:
            return None

    brace_match = re.search(r"(\{.*\})", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(1))
        except json.JSONDecodeError:
            return None
    return None


def _agent_prompt(
    *,
    trip: models.Trip,
    selected_plan: str,
    user_message: str,
    steps: List[Dict[str, Any]],
) -> str:
    return (
        "You are a trip-planning assistant with access to tools for reading the user's trip from the database.\n"
        "Choose the smallest number of tools needed to answer accurately.\n"
        "If the user asks for a fact about the trip, use tools instead of guessing.\n"
        "Night 1 means the first overnight stay, which usually maps to day 1 unless tool results indicate otherwise.\n"
        "Available tools:\n"
        "- get_trip_overview(): core trip metadata and available plans\n"
        "- get_plan_summary(plan?): day list with activity names for a plan\n"
        "- get_day_details(day, plan?): full activities for one day in a plan\n"
        "- find_lodging_for_night(night, plan?): hotel/lodging activity for that night in a plan\n"
        "- search_activities(query?, category?, day?, plan?): find matching activities in a plan\n"
        "- swap_day_activities(day, source_activity_id, target_activity_id, plan?): swap two activities within a day and swap their times too\n"
        "- get_recent_chat_history(limit?): recent saved chat messages\n\n"
        f"Trip overview: {json.dumps(_trip_overview(trip), ensure_ascii=True)}\n"
        f"Selected plan in UI: {selected_plan}\n"
        f"User message: {user_message}\n"
        f"Previous agent steps: {json.dumps(steps, ensure_ascii=True)}\n\n"
        "Return JSON only.\n"
        'For a tool call, return {"type":"tool_call","tool":"<tool name>","arguments":{...}}.\n'
        'For a final answer, return {"type":"final","response":"<answer for the user>"}.\n'
        "Do not include markdown fences."
    )


async def generate_trip_chat_response(
    *,
    trip: models.Trip,
    message: str,
    selected_plan: str,
) -> AgentReply:
    steps: List[Dict[str, Any]] = []

    for _ in range(4):
        planner_text = await generate_text(
            _agent_prompt(
                trip=trip,
                selected_plan=selected_plan,
                user_message=message,
                steps=steps,
            ),
            temperature=0.1,
        )
        decision = _extract_json_block(planner_text)
        if not decision:
            break

        if decision.get("type") == "final":
            response = str(decision.get("response", "")).strip()
            if response:
                return AgentReply(
                    response=response,
                    chips=["Show me that day", "Compare plans", "Update my itinerary"],
                    updated_plans=trip.plans if any(step.get("tool") == "swap_day_activities" for step in steps) else None,
                )
            break

        if decision.get("type") != "tool_call":
            break

        tool_name = str(decision.get("tool", "")).strip()
        arguments = decision.get("arguments", {})
        if not isinstance(arguments, dict):
            arguments = {}

        try:
            result = execute_tool(
                trip=trip,
                selected_plan=selected_plan,
                tool_name=tool_name,
                arguments=arguments,
            )
        except (KeyError, TypeError, ValueError) as exc:
            steps.append({"tool": tool_name, "arguments": arguments, "error": str(exc)})
            continue

        steps.append({"tool": tool_name, "arguments": arguments, "result": result})

    fallback_context = {
        "trip": _trip_overview(trip),
        "selected_plan": selected_plan,
        "selected_plan_summary": execute_tool(
            trip=trip,
            selected_plan=selected_plan,
            tool_name="get_plan_summary",
            arguments={"plan": selected_plan},
        ),
        "tool_steps": steps,
    }
    fallback_prompt = (
        "You are a trip-planning assistant. Answer the user's question using the provided trip context.\n"
        "Be concise and factual. If context is missing, say that clearly.\n"
        f"User message: {message}\n"
        f"Context: {json.dumps(fallback_context, ensure_ascii=True)}"
    )
    response = await generate_text(fallback_prompt, temperature=0.2)
    return AgentReply(
        response=response,
        chips=["Show me that day", "Compare plans", "Update my itinerary"],
    )
