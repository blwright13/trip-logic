"""
Itinerary generation with OpenAI tool calls (AviationStack + Google Places).
Falls back to single-shot parse_trip_from_prompt if tools/LLM fail.
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any

from integrations import aviationstack, google_places, serpapi
from itinerary_gen import merge_parsed_with_canonical, parse_trip_from_prompt
from llm import OPENAI_MODEL, llm_configured, openai_client
from models import Trip
from planning_prompts import context_to_generation_prompt

logger = logging.getLogger(__name__)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s [%(name)s] %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _parse_itinerary_json(text: str) -> dict:
    cleaned = _strip_json_fences(text)
    if cleaned.startswith("{"):
        return json.loads(cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start >= 0 and end > start:
        return json.loads(cleaned[start:end])
    raise ValueError("no JSON object in model output")


def _activity_count(parsed: dict) -> int:
    acts = parsed.get("activities")
    if isinstance(acts, list):
        return len(acts)
    return 0


def _meta_base() -> dict[str, Any]:
    return {
        "agent": "itinerary_tool_loop",
        "openai_model": OPENAI_MODEL,
        "used_tools": False,
        "llm_completion_rounds": 0,
        "tool_calls_total": 0,
        "tools_by_name": {},
        "finish": "unknown",
        "fallback_reason": None,
        "parsed_activity_count": 0,
    }


def _tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "search_airports",
                "description": "Look up cities and airport codes by city or region name (e.g. Paris, Tokyo). Use for routing context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "City name, region, or airport code fragment"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_places",
                "description": "Find real restaurants, attractions, or POIs (name, address, rating, price level). Use for concrete venue ideas.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text_query": {
                            "type": "string",
                            "description": "What to search, e.g. 'Michelin restaurants in Paris' or 'museums near Louvre'",
                        },
                    },
                    "required": ["text_query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_hotels",
                "description": (
                    "Search real available hotels and nightly rates for a destination using Google Hotels. "
                    "Returns hotel name, star rating, amenities, and actual price per night in USD. "
                    "Use this to ground hotel costs instead of estimating."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "destination": {"type": "string", "description": "City or area, e.g. 'Paris' or 'Midtown Manhattan'"},
                        "check_in_date": {"type": "string", "description": "Check-in date YYYY-MM-DD"},
                        "check_out_date": {"type": "string", "description": "Check-out date YYYY-MM-DD"},
                        "adults": {"type": "integer", "description": "Number of adult guests"},
                    },
                    "required": ["destination", "check_in_date", "check_out_date"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_flights",
                "description": (
                    "Search real available flights between two airports on a date using Google Flights. "
                    "Returns airline, flight number, departure/arrival times, stops, and price in USD. "
                    "Optionally filter by airline IATA code (e.g. DL for Delta, AA for American)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "origin_iata": {"type": "string", "description": "3-letter departure airport code, e.g. DTW"},
                        "dest_iata": {"type": "string", "description": "3-letter arrival airport code, e.g. CDG"},
                        "departure_date": {"type": "string", "description": "Departure date YYYY-MM-DD"},
                        "airline_code": {
                            "type": "string",
                            "description": "Optional 2-letter IATA airline code to filter results, e.g. DL, AA, UA",
                        },
                        "return_date": {
                            "type": "string",
                            "description": "Optional return date YYYY-MM-DD for round-trip search",
                        },
                    },
                    "required": ["origin_iata", "dest_iata", "departure_date"],
                },
            },
        },
    ]


def _dispatch_tool(name: str, arguments: str, meta: dict[str, Any] | None = None) -> str:
    try:
        args = json.loads(arguments) if arguments else {}
    except json.JSONDecodeError:
        args = {}
    logger.info("itinerary_tool_execute name=%s args=%s", name, json.dumps(args, ensure_ascii=False)[:500])
    if name == "search_airports":
        return aviationstack.search_airports(args.get("query", ""))
    if name == "search_places":
        return google_places.search_places(args.get("text_query", ""))
    if name == "search_hotels":
        return serpapi.search_hotels(
            destination=args.get("destination", ""),
            check_in_date=args.get("check_in_date", ""),
            check_out_date=args.get("check_out_date", ""),
            adults=int(args.get("adults", 2)),
        )
    if name == "search_flights":
        origin = (args.get("origin_iata") or "").upper().strip()
        dest = (args.get("dest_iata") or "").upper().strip()
        if meta is not None and len(origin) == 3 and len(dest) == 3:
            if not meta.get("origin_iata"):
                meta["origin_iata"] = origin
            if not meta.get("destination_iata"):
                meta["destination_iata"] = dest
        return serpapi.search_flights(
            origin_iata=origin,
            dest_iata=dest,
            departure_date=args.get("departure_date", ""),
            airline_code=args.get("airline_code", ""),
            return_date=args.get("return_date", ""),
        )
    return json.dumps({"error": f"unknown tool {name}"})


def run_itinerary_agent_with_tools(trip: Trip) -> tuple[dict, dict[str, Any]]:
    """
    Multi-turn chat with tools, then final JSON itinerary.
    Falls back to single-shot parse_trip_from_prompt on any failure.

    Returns (merged_parsed_dict, build_meta) — build_meta is safe to log and return to clients.
    """
    meta = _meta_base()
    base_prompt = context_to_generation_prompt(trip)

    if not llm_configured() or not openai_client:
        meta["finish"] = "fallback_parse"
        meta["fallback_reason"] = "openai_not_configured"
        logger.warning("itinerary_build: OpenAI not configured; using parse_trip_from_prompt only")
        parsed = parse_trip_from_prompt(base_prompt)
        merged = merge_parsed_with_canonical(trip, parsed)
        meta["parsed_activity_count"] = _activity_count(merged)
        return merged, meta

    system = """You are an expert travel itinerary builder. Follow these rules exactly.

DAILY STRUCTURE — every day must include all 5 slots unless it is a travel-only day:
  Breakfast:          08:00–08:45  (category: food, ~45 min)
  Morning activity:   09:30–12:00  (category: sightseeing or entertainment, 90–150 min)
  Lunch:              12:30–13:30  (category: food or cafe, 60 min)
  Afternoon activity: 14:30–17:00  (category: sightseeing or entertainment, 90–150 min)
  Dinner:             18:30–20:00  (category: food, 90 min)

MANDATORY TOOL CALLS — complete these before writing the final JSON:
  1. If the trip has a known origin city or airport, call search_flights for the outbound leg.
     If round-trip, also call search_flights for the return flight.
  2. Call search_hotels for each destination to get real nightly rates.
     Use the trip start date as check_in_date and end date as check_out_date.
  3. Call search_places at least TWICE per destination:
     - once for top restaurants/cafés (e.g. "best restaurants in Paris")
     - once for top sightseeing/attractions (e.g. "top attractions in Paris")
  4. Use real venue names and price signals from tool results in your activity titles and costs.

COST GROUNDING:
  - Meals: use Places API price_level as a guide ($ ≈ $15/person, $$ ≈ $30, $$$ ≈ $60, $$$$ ≈ $100+)
  - Flights: use SerpAPI prices directly; estimate from distance/class if unavailable
  - Hotels: use the actual rate_per_night_usd from search_hotels results; include 1 hotel activity per night at that price
  - Total of all activity costs must fall within 85–105% of the stated budget

FLIGHT ORDERING:
  - If an outbound (initial) flight exists, it must be the first activity in the itinerary.
  - If a return flight exists, it must be the final activity in the itinerary.

OUTPUT: Respond with ONLY a single valid JSON object (no markdown fences) matching this schema:
{
  "title": "Catchy 2-6 word trip name (NOT a full sentence, NOT the raw prompt)",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "num_people": <number>,
  "budget": <number>,
  "activities": [
    {
      "title": "string",
      "category": "flight|hotel|food|sightseeing|entertainment|cafe|shopping|transport",
      "start": "YYYY-MM-DDTHH:MM:SS",
      "duration": <minutes>,
      "cost": <USD number>,
      "location": "string"
    }
  ]
}
Do not include info_url — the server attaches Maps / Flights links when saving.
Activity start datetimes must fall between start and end dates inclusive.
If a tool returns an error, continue with reasonable estimates."""

    user_content = f"""Build the full itinerary for this trip.

{base_prompt}"""

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    tools = _tool_definitions()
    max_rounds = 8
    tool_name_counts: Counter[str] = Counter()

    logger.info(
        "itinerary_build_start trip_id=%s model=%s max_rounds=%s",
        getattr(trip, "id", None),
        OPENAI_MODEL,
        max_rounds,
    )

    for round_idx in range(max_rounds):
        try:
            meta["llm_completion_rounds"] = round_idx + 1
            response = openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.7,
            )
        except Exception as e:
            logger.exception("itinerary_build: OpenAI chat.completions failed: %s", e)
            meta["finish"] = "fallback_parse"
            meta["fallback_reason"] = f"openai_api_error:{type(e).__name__}"
            parsed = parse_trip_from_prompt(base_prompt)
            merged = merge_parsed_with_canonical(trip, parsed)
            meta["parsed_activity_count"] = _activity_count(merged)
            meta["tools_by_name"] = dict(tool_name_counts)
            return merged, meta

        choice = response.choices[0]
        msg = choice.message
        if not msg:
            logger.warning("itinerary_build: empty message from model at round %s", round_idx)
            break

        if msg.tool_calls:
            meta["used_tools"] = True
            n_calls = len(msg.tool_calls)
            meta["tool_calls_total"] += n_calls
            for tc in msg.tool_calls:
                tool_name_counts[tc.function.name] += 1
            logger.info(
                "itinerary_build round=%s tool_calls=%s names=%s",
                round_idx,
                n_calls,
                [tc.function.name for tc in msg.tool_calls],
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"},
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )
            for tc in msg.tool_calls:
                result = _dispatch_tool(tc.function.name, tc.function.arguments or "{}", meta)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result[:12000],
                    }
                )
            continue

        text = (msg.content or "").strip()
        if not text:
            logger.warning("itinerary_build: no content and no tool_calls at round %s", round_idx)
            break
        try:
            parsed = _parse_itinerary_json(text)
            merged = merge_parsed_with_canonical(trip, parsed)
            meta["finish"] = "assistant_json"
            meta["parsed_activity_count"] = _activity_count(merged)
            meta["tools_by_name"] = dict(tool_name_counts)
            logger.info(
                "itinerary_build_done trip_id=%s finish=assistant_json used_tools=%s tool_calls_total=%s activities=%s",
                getattr(trip, "id", None),
                meta["used_tools"],
                meta["tool_calls_total"],
                meta["parsed_activity_count"],
            )
            return merged, meta
        except Exception as e:
            logger.warning("itinerary_build JSON parse failed round=%s: %s", round_idx, e)
            messages.append({"role": "assistant", "content": text})
            messages.append(
                {
                    "role": "user",
                    "content": "That was not valid JSON. Reply with ONLY the JSON object, no other text.",
                }
            )
            continue

    meta["finish"] = "fallback_parse"
    meta["fallback_reason"] = "max_rounds_or_empty_without_json"
    meta["tools_by_name"] = dict(tool_name_counts)
    logger.warning(
        "itinerary_build: exhausted tool loop; falling back to parse_trip_from_prompt trip_id=%s tool_calls_total=%s",
        getattr(trip, "id", None),
        meta["tool_calls_total"],
    )
    parsed = parse_trip_from_prompt(base_prompt)
    merged = merge_parsed_with_canonical(trip, parsed)
    meta["parsed_activity_count"] = _activity_count(merged)
    return merged, meta
