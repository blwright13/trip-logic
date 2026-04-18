"""
Itinerary generation with OpenAI tool calls (AviationStack + Google Places).
Falls back to single-shot parse_trip_from_prompt if tools/LLM fail.
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any

from integrations import aviationstack, google_places
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
                "name": "flight_schedule_lookup",
                "description": "Sample scheduled flights between two IATA airport codes on a date (YYYY-MM-DD). May return limited data on free tier.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "origin_iata": {"type": "string", "description": "3-letter departure airport code"},
                        "dest_iata": {"type": "string", "description": "3-letter arrival airport code"},
                        "flight_date": {"type": "string", "description": "Date YYYY-MM-DD"},
                    },
                    "required": ["origin_iata", "dest_iata", "flight_date"],
                },
            },
        },
    ]


def _dispatch_tool(name: str, arguments: str) -> str:
    try:
        args = json.loads(arguments) if arguments else {}
    except json.JSONDecodeError:
        args = {}
    logger.info("itinerary_tool_execute name=%s args=%s", name, json.dumps(args, ensure_ascii=False)[:500])
    if name == "search_airports":
        return aviationstack.search_airports(args.get("query", ""))
    if name == "search_places":
        return google_places.search_places(args.get("text_query", ""))
    if name == "flight_schedule_lookup":
        return aviationstack.flight_schedule_lookup(
            args.get("origin_iata", ""),
            args.get("dest_iata", ""),
            args.get("flight_date", ""),
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

    system = """You are an expert travel itinerary builder. You may call tools to fetch real airport, flight, or place data.
When you have enough context, respond with ONLY a single JSON object (no markdown fences) with this exact shape:
{
  "title": "Catchy 2-6 word trip name (NOT a long sentence, NOT the raw prompt)",
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
Do not include info_url in activities — the server attaches Maps / Flights links when saving.
Use tool results to ground real venue names and airports when relevant. Activity start datetimes must fall between start and end dates inclusive.
If a tool returns an error, continue without failing — use reasonable estimates."""

    user_content = f"""Build the full itinerary for this trip.

{base_prompt}

Include flights at start/end where appropriate, hotels, meals, and sightseeing. Budget activities to fit the total budget."""

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
                result = _dispatch_tool(tc.function.name, tc.function.arguments or "{}")
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
