"""
LangGraph orchestration for post-itinerary chat suggestions.

Hybrid approach:
- Graph handles intent routing, retrieval, ranking, and response formatting.
- Existing DB mutation semantics are preserved for activity edits.

Flight **results** (options, times, prices) come from SerpAPI (Google Flights engine).
City/airport name → IATA resolution uses AviationStack when codes are not already in
`planning_context` or parsed from chat; SerpAPI still performs the actual flight search.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime
from typing import Any, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from integrations import aviationstack, serpapi
from integrations.google_places import photo_proxy_url, search_places
from itinerary_enrich import google_flights_search_url
from llm import complete_text, llm_configured
from models import Activity, ChatMessage, Trip
from replacement_targeting import resolve_replacement_context

Intent = Literal[
    "suggest_flights",
    "suggest_lodging",
    "suggest_food",
    "suggest_experiences",
    "apply_change",
    "general_reply",
]


class PostChatState(TypedDict, total=False):
    db: Any
    trip_id: int
    user_message: str
    trip: Trip
    messages: list[ChatMessage]
    itinerary_summary: str  # day-by-day text snapshot passed to LLM nodes
    intent: Intent
    apply_mode: str          # "replace" | "add"
    replace_activity_id: Optional[int]
    replace_category: Optional[str]
    target_date: Optional[str]  # YYYY-MM-DD date the suggestion should land on
    flight_options: list[dict[str, Any]]
    cards: list[dict[str, Any]]
    assistant_content: str
    assistant_chips: list[str]
    trip_updated: bool
    delegate_to_legacy: bool


def _strip_json(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        parts = stripped.split("```")
        stripped = parts[1] if len(parts) > 1 else stripped
        if stripped.startswith("json"):
            stripped = stripped[4:]
    return stripped.strip()


def _safe_loads(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _price_level_to_estimate(price_level: str | None, fallback: str = "Varies") -> str:
    mapping = {
        "0": "Free",
        "1": "$",
        "2": "$$",
        "3": "$$$",
        "4": "$$$$",
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "$",
        "PRICE_LEVEL_MODERATE": "$$",
        "PRICE_LEVEL_EXPENSIVE": "$$$",
        "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    }
    return mapping.get((price_level or "").strip().upper(), fallback)


def _suggestion_price_estimate(card_type: str, ctx: dict[str, Any]) -> str:
    """Fallback price labels used when Places does not return price_level."""
    if card_type == "food":
        dining = str(ctx.get("dining_style") or "").lower()
        if "fine" in dining:
            return "$$$"
        if "street" in dining or "budget" in dining:
            return "$"
        return "$$"

    if card_type == "hotel":
        quality = str(ctx.get("accommodation_quality") or "").lower()
        if "luxury" in quality:
            return "$$$$"
        if "upscale" in quality:
            return "$$$"
        if "budget" in quality:
            return "$"
        return "$$"

    if card_type == "tour":
        vibe = str(ctx.get("activity_vibe") or "").lower()
        if "outdoor" in vibe or "park" in vibe:
            return "Free"
        if "nightlife" in vibe:
            return "$$"
        return "$$"

    return "$$"


def _hotel_total_price_estimate(
    price_level: str | None,
    fallback_tier: str,
    start_date: str | None,
    end_date: str | None,
    travelers: int | None,
) -> tuple[str, int]:
    tier = _price_level_to_estimate(price_level, fallback=fallback_tier)
    nightly_by_tier = {
        "Free": 0,
        "$": 100,
        "$$": 200,
        "$$$": 350,
        "$$$$": 600,
    }
    nightly_rate = nightly_by_tier.get(tier, nightly_by_tier.get(fallback_tier, 200))
    try:
        nights = max(1, (datetime.fromisoformat(str(end_date)).date() - datetime.fromisoformat(str(start_date)).date()).days)
    except (TypeError, ValueError):
        nights = 1
    rooms = max(1, math.ceil(max(1, int(travelers or 1)) / 2))
    total = int(nightly_rate * nights * rooms)
    return f"${total:,.0f} total", total


_INTENT_VALID: set[str] = {
    "suggest_flights", "suggest_lodging", "suggest_food",
    "suggest_experiences", "apply_change", "general_reply",
}

# (intent, apply_mode, replace_activity_id, replace_category, target_date)
_ClassifyResult = tuple  # Intent, str, Optional[int], Optional[str], Optional[str]


def _classify_intent_fallback(user_message: str) -> _ClassifyResult:
    text = (user_message or "").lower()
    if any(k in text for k in ("flight", "airline", "airport", "fly")):
        return "suggest_flights", "replace", None, "flight", None
    if any(k in text for k in ("hotel", "stay", "lodging", "accommodation", "resort")):
        return "suggest_lodging", "replace", None, "hotel", None
    if any(k in text for k in ("lunch", "dinner", "breakfast", "restaurant", "cafe", "eat", "food", "meal")):
        return "suggest_food", "replace", None, "food", None
    if any(k in text for k in ("tour", "activity", "thing to do", "attraction", "entertainment", "go see", "visit", "go to")):
        return "suggest_experiences", "replace", None, "sightseeing", None
    if any(k in text for k in ("replace", "change", "swap", "update", "remove", "delete", "add",
                                "instead", "switch", "put", "book")):
        return "apply_change", "replace", None, None, None
    return "general_reply", "replace", None, None, None


def _classify_intent_llm(
    user_message: str,
    trip: Trip,
    messages: list[ChatMessage],
    itinerary_summary: str,
    structured_activities: list[dict[str, Any]] | None = None,
) -> _ClassifyResult:
    if not llm_configured():
        return _classify_intent_fallback(user_message)

    recent = "\n".join(f"{m.role}: {m.content}" for m in (messages or [])[-6:])

    prompt = f"""Classify a travel assistant message and decide how any suggestion should be applied to the itinerary.

Intents:
- suggest_flights: user wants flight options or alternatives
- suggest_lodging: user wants hotel/accommodation options
- suggest_food: user wants restaurant, cafe, or meal suggestions
- suggest_experiences: user wants activities, tours, or attractions
- apply_change: user wants to directly edit their itinerary
- general_reply: general questions or trip advice

Apply mode rules:
- Use "add" when the user asks for a specific new activity or attraction without saying what it replaces
- Use "replace" when the user asks for alternatives, other options, cheaper/different/better options, or names an activity to replace
- Use "replace" unless the user explicitly says "add", "also include", "on top of", or "in addition to"
- Asking for "other options", "alternatives", "cheaper", "different", or "better" options → ALWAYS "replace"
- If the user references a specific day or meal ("lunch on Day 2", "my morning activity") → "replace" with that exact activity
- Only use "add" when the user clearly wants a NEW item alongside existing ones

Identification rules:
- Look at the itinerary below. If the user references a specific activity (e.g. "lunch on Day 2"), find its id and return it as replace_activity_id.
- If you can't identify a specific activity id, return replace_category ("flight"/"hotel"/"food"/"sightseeing") and null for replace_activity_id.
- Always return target_date (YYYY-MM-DD) — the date the suggestion should land on. Derive it from the day number or context. For flights use the trip start date.

Trip: {trip.title}, {trip.start} → {trip.end}

Current itinerary (activity ids are the integers after "id="):
{itinerary_summary}

Structured activities:
{json.dumps(structured_activities or [], ensure_ascii=False)}

Recent conversation:
{recent}

User message: "{user_message}"

Return JSON only:
{{"intent": "<intent>", "apply_mode": "replace"|"add", "replace_activity_id": <int or null>, "replace_category": "<flight|hotel|food|sightseeing|null>", "target_date": "<YYYY-MM-DD or null>"}}"""

    try:
        data = _safe_loads(_strip_json(complete_text(prompt)))
        intent = data.get("intent", "")
        if intent not in _INTENT_VALID:
            return _classify_intent_fallback(user_message)
        apply_mode = data.get("apply_mode") or "replace"
        replace_activity_id = data.get("replace_activity_id")
        replace_activity_id = int(replace_activity_id) if isinstance(replace_activity_id, (int, float)) else None
        replace_category = data.get("replace_category") or None
        target_date = data.get("target_date") or None
        return intent, apply_mode, replace_activity_id, replace_category, target_date  # type: ignore[return-value]
    except Exception:
        pass
    return _classify_intent_fallback(user_message)


def _rank_flight_options(options: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not options:
        return []

    by_price = sorted(options, key=lambda x: float(x.get("price_usd") or 1e9))
    by_duration = sorted(options, key=lambda x: int(x.get("duration_minutes") or 1e9))

    cheapest_id = id(by_price[0])
    fastest_id = id(by_duration[0])

    seen: set[int] = set()
    result: list[dict[str, Any]] = []

    for opt in by_price:
        oid = id(opt)
        if oid == cheapest_id:
            opt["tag"] = "cheapest"
        elif oid == fastest_id:
            opt["tag"] = "fastest"
        elif int(opt.get("stops") or 9) == 0:
            opt["tag"] = "best value"
        else:
            opt.pop("tag", None)
        if oid not in seen:
            seen.add(oid)
            result.append(opt)

    return result[:5]


# Route hints from free text (chat + trip planning) so flight search doesn't rely only on IATA fields.
_FROM_TO_RE = re.compile(
    r"(?i)\bfrom\s+([A-Za-z][A-Za-z\s'.-]{0,48})\s+to\s+([A-Za-z][A-Za-z\s'.-]{0,48})"
)
_ROUTE_RE = re.compile(
    r"(?i)(?:^|\b)([A-Za-z][A-Za-z\s'.-]{0,48})\s+to\s+([A-Za-z][A-Za-z\s'.-]{0,48})"
)
_FLIGHT_TO_RE = re.compile(r"(?i)\b(?:my\s+)?flight\s+to\s+([A-Za-z][A-Za-z\s'.-]{0,48})")
_SPECIFIC_EXPERIENCE_RE = re.compile(
    r"(?i)\b(?:go\s+see|see|visit|go\s+to|check\s+out|tour)\s+(?:the\s+)?(.+?)(?:\s+on\s+day\s+\d+|\s+day\s+\d+|$)"
)
_REPLACEMENT_WORDS = ("replace", "change", "swap", "instead", "other", "alternative", "alternatives", "different", "better", "cheaper")
_ADDITION_WORDS = ("add", "also include", "on top of", "in addition")


def _flight_context_text(state: PostChatState) -> str:
    lines: list[str] = []
    for m in (state.get("messages") or [])[-12:]:
        lines.append(f"{m.role}: {m.content}")
    um = (state.get("user_message") or "").strip()
    if um:
        lines.append(f"user: {um}")
    return "\n".join(lines)


def _route_hint_from_text(text: str) -> tuple[str | None, str | None]:
    raw = text or ""
    m = _FROM_TO_RE.search(raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    m = _ROUTE_RE.search(raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    m2 = _FLIGHT_TO_RE.search(raw)
    if m2:
        return None, m2.group(1).strip()
    return None, None


def _specific_experience_query(user_message: str, destination: str) -> str | None:
    text = (user_message or "").strip()
    if not text:
        return None
    if any(word in text.lower() for word in ("things to do", "options", "suggestions", "recommend")):
        return None
    match = _SPECIFIC_EXPERIENCE_RE.search(text)
    if not match:
        return None
    subject = re.sub(r"\s+", " ", match.group(1)).strip(" .?!")
    if len(subject.split()) < 2:
        return None
    destination = (destination or "").strip()
    return f"{subject} in {destination}" if destination else subject


def _unspecified_activity_request_should_add(user_message: str) -> bool:
    text = (user_message or "").lower()
    if any(word in text for word in _REPLACEMENT_WORDS):
        return False
    if any(word in text for word in _ADDITION_WORDS):
        return True
    return _specific_experience_query(user_message, "") is not None


def _destinations_from_trip_title(title: str) -> list[str]:
    t = (title or "").strip()
    if not t:
        return []
    parts = [p.strip() for p in t.split(",") if p.strip()]
    return parts if parts else []


def _first_iata_from_query(query: str, exclude_iata: str = "") -> str:
    """Resolve a place name to a 3-letter code (not flight search; see SerpAPI for listings)."""
    q = (query or "").strip()
    if not q:
        return ""
    raw = _safe_loads(aviationstack.search_airports(q, limit=8))
    if raw.get("error"):
        return ""
    ex = (exclude_iata or "").upper().strip()
    for airport in raw.get("airports") or []:
        if not isinstance(airport, dict):
            continue
        iata = (airport.get("iata_code") or "").upper().strip()
        if len(iata) == 3 and iata != ex:
            return iata
    return ""


def _existing_titles(db: Session, trip_id: int) -> set[str]:
    """Return lower-cased titles of every activity already in the itinerary."""
    rows = db.query(Activity.title).filter(Activity.trip_id == trip_id).all()
    return {(r.title or "").lower().strip() for r in rows}


def _build_itinerary_summary(db: Session, trip: Trip) -> str:
    """Compact day-by-day text of the trip activities for LLM context."""
    activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip.id)
        .order_by(Activity.start)
        .all()
    )
    if not activities:
        return "(No activities saved yet.)"

    by_date: dict[str, list[Activity]] = {}
    for act in activities:
        date = (act.start or "")[:10]
        by_date.setdefault(date, []).append(act)

    lines: list[str] = []
    for day_num, (date, acts) in enumerate(sorted(by_date.items()), start=1):
        lines.append(f"Day {day_num} ({date}):")
        for act in acts:
            time = (act.start or "")[11:16] or "?"
            lines.append(f"  {time}  [id={act.id}]  [{act.category}]  {act.title}  —  {act.location or ''}  (${act.cost})")
    return "\n".join(lines)


def _build_structured_activity_context(db: Session, trip: Trip) -> list[dict[str, Any]]:
    activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip.id)
        .order_by(Activity.start)
        .all()
    )
    try:
        trip_start = datetime.fromisoformat(str(trip.start)).date()
    except (TypeError, ValueError):
        trip_start = None

    structured: list[dict[str, Any]] = []
    for activity in activities:
        raw_start = activity.start or ""
        date_part = raw_start[:10]
        day_number = None
        if trip_start and date_part:
            try:
                day_number = (datetime.fromisoformat(date_part).date() - trip_start).days + 1
            except ValueError:
                day_number = None
        structured.append(
            {
                "id": activity.id,
                "day_number": day_number,
                "date": date_part,
                "time": raw_start[11:16],
                "category": activity.category.value,
                "title": activity.title,
            }
        )
    return structured


def _route_node(state: PostChatState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": [], "intent": "general_reply"}
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.trip_id == trip.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    itinerary_summary = _build_itinerary_summary(db, trip)
    structured_activities = _build_structured_activity_context(db, trip)
    intent, apply_mode, replace_activity_id, replace_category, target_date = _classify_intent_llm(
        state["user_message"], trip, messages, itinerary_summary, structured_activities
    )
    if _unspecified_activity_request_should_add(state["user_message"]):
        intent = "suggest_experiences"
        apply_mode = "add"
        replace_activity_id = None
        replace_category = None
    replacement_context = resolve_replacement_context(
        db,
        trip,
        state["user_message"],
        apply_mode=apply_mode,
        replace_activity_id=replace_activity_id,
        replace_category=replace_category,
        target_date=target_date,
    )
    return {
        "trip": trip,
        "messages": messages,
        "itinerary_summary": itinerary_summary,
        "intent": intent,
        "apply_mode": replacement_context.apply_mode,
        "replace_activity_id": replacement_context.replace_activity_id,
        "replace_category": replacement_context.replace_category,
        "target_date": replacement_context.target_date,
        "trip_updated": False,
    }


def _retrieve_flights_node(state: PostChatState) -> dict[str, Any]:
    trip = state["trip"]
    ctx = trip.planning_context or {}
    transcript = _flight_context_text(state)
    hint_o, hint_d = _route_hint_from_text(transcript)

    origin = (ctx.get("origin_iata") or "").upper().strip()
    if not origin and (ctx.get("origin") or "").strip():
        origin = _first_iata_from_query(str(ctx.get("origin")))
    if not origin and hint_o:
        origin = _first_iata_from_query(hint_o)

    destinations: list[str] = list(ctx.get("destinations") or [])
    if not destinations:
        destinations = _destinations_from_trip_title(trip.title or "")
    if not destinations and hint_d:
        destinations = [hint_d]

    if not origin or not destinations:
        return {
            "assistant_content": "I need a departure airport and destination before I can suggest flights.",
            "assistant_chips": ["Set departure airport", "Use current itinerary flights"],
            "flight_options": [],
        }

    # Use first destination for V1 flight suggestions.
    dest_iata = (ctx.get("destination_iata") or "").upper().strip()
    if not dest_iata and destinations:
        dest_iata = _first_iata_from_query(str(destinations[0]), exclude_iata=origin)
    if not dest_iata:
        return {
            "assistant_content": "I can suggest flights once I know the destination airport code.",
            "assistant_chips": ["Set destination airport", "Show hotel options instead"],
            "flight_options": [],
        }

    departure_date = (trip.start or "").strip()
    return_date = (trip.end or "").strip() or None

    try:
        raw = _safe_loads(serpapi.search_flights(origin, dest_iata, departure_date, return_date=return_date))
    except Exception:
        return {
            "assistant_content": "I couldn't reach the flights service right now. Try again in a moment.",
            "assistant_chips": ["Show hotel cards", "Show tour cards"],
            "flight_options": [],
        }

    flights = raw.get("flights") if isinstance(raw.get("flights"), list) else []
    options: list[dict[str, Any]] = []
    for f in flights:
        if not isinstance(f, dict):
            continue
        options.append(
            {
                "airline": f.get("airline") or "Unknown airline",
                "flight_number": f.get("flight_number"),
                "departure_time": f.get("departure_time") or "",
                "arrival_time": f.get("arrival_time") or "",
                "departure_airport": f.get("departure_airport"),
                "arrival_airport": f.get("arrival_airport"),
                "duration_minutes": f.get("duration_minutes"),
                "stops": f.get("stops"),
                "price_usd": f.get("price_usd"),
                "booking_url": google_flights_search_url(origin=origin, destination=dest_iata, date=departure_date),
            }
        )
    ranked = _rank_flight_options(options)
    return {"flight_options": ranked}


def _retrieve_lodging_node(state: PostChatState) -> dict[str, Any]:
    trip = state["trip"]
    ctx = trip.planning_context or {}
    destinations = ctx.get("destinations") or []
    destination = destinations[0] if destinations else (trip.title or "destination").split(",")[0].strip()

    quality = (ctx.get("accommodation_quality") or "").lower()
    qualifier = "luxury " if "luxury" in quality else "budget " if "budget" in quality else "upscale " if "upscale" in quality else ""
    query = f"top rated {qualifier}hotels in {destination}"

    try:
        raw = _safe_loads(search_places(query, max_results=8))
    except Exception:
        return {
            "assistant_content": "I couldn't reach the hotels service right now. Try again in a moment.",
            "assistant_chips": ["Show flight options", "Show tour cards"],
            "cards": [],
        }
    places = raw.get("places") if isinstance(raw.get("places"), list) else []
    existing = _existing_titles(state["db"], state["trip_id"])
    cards: list[dict[str, Any]] = []
    for place in places:
        if not isinstance(place, dict):
            continue
        name = place.get("name") or "Hotel option"
        if name.lower().strip() in existing:
            continue
        photo_url = place.get("photo_url")
        if not photo_url and place.get("photo_name"):
            photo_url = photo_proxy_url(place.get("photo_name"))
        types = place.get("types") or []
        place_type = "Spa hotel" if "spa" in types else "Boutique hotel" if "lodging" in types else "Hotel"
        budget_note = f" · {ctx.get('accommodation_quality', '').title()} tier" if ctx.get("accommodation_quality") else ""
        estimated_price, estimated_cost = _hotel_total_price_estimate(
            place.get("price_level"),
            fallback_tier=_suggestion_price_estimate("hotel", ctx),
            start_date=trip.start,
            end_date=trip.end,
            travelers=trip.num_people,
        )
        cards.append(
            {
                "type": "hotel",
                "title": name,
                "image_url": photo_url,
                "description": f"{place_type} in {destination}{budget_note}.",
                "rating": place.get("rating"),
                "estimated_price": estimated_price,
                "estimated_cost": estimated_cost,
                "url": place.get("google_maps_uri") or place.get("website_uri"),
                "location": place.get("address"),
                "fit_reason": None,
            }
        )
        if len(cards) == 5:
            break
    return {"cards": cards}


def _retrieve_experiences_node(state: PostChatState) -> dict[str, Any]:
    trip = state["trip"]
    ctx = trip.planning_context or {}
    destinations = ctx.get("destinations") or []
    destination = destinations[0] if destinations else (trip.title or "destination").split(",")[0].strip()
    specific_query = _specific_experience_query(state.get("user_message") or "", destination)

    vibe = (ctx.get("activity_vibe") or "").lower()
    if specific_query:
        query = specific_query
    elif "outdoor" in vibe:
        query = f"outdoor activities and parks in {destination}"
    elif "cultural" in vibe or "museum" in vibe:
        query = f"museums and cultural attractions in {destination}"
    elif "nightlife" in vibe:
        query = f"nightlife and entertainment in {destination}"
    else:
        query = f"top tours and attractions in {destination}"

    try:
        raw = _safe_loads(search_places(query, max_results=8))
    except Exception:
        return {
            "assistant_content": "I couldn't reach the experiences service right now. Try again in a moment.",
            "assistant_chips": ["Show flight options", "Show hotel cards"],
            "cards": [],
        }
    places = raw.get("places") if isinstance(raw.get("places"), list) else []
    existing = _existing_titles(state["db"], state["trip_id"])
    cards: list[dict[str, Any]] = []
    if specific_query:
        specific_subject = specific_query.rsplit(" in ", 1)[0]
        subject_tokens = {
            token
            for token in re.findall(r"[a-z0-9]+", specific_subject.lower())
            if token not in {"the", "a", "an", "of", "and", "to"}
        }
        matching_places = [
            place
            for place in places
            if subject_tokens
            and subject_tokens.issubset(set(re.findall(r"[a-z0-9]+", str(place.get("name") or "").lower())))
        ]
        if matching_places:
            places = matching_places

    max_cards = 1 if specific_query else 5
    for place in places:
        if not isinstance(place, dict):
            continue
        name = place.get("name") or "Experience option"
        if name.lower().strip() in existing:
            continue
        photo_url = place.get("photo_url")
        types = place.get("types") or []
        if "museum" in types:
            kind = "Museum"
        elif "park" in types or "natural_feature" in types:
            kind = "Outdoor activity"
        elif "restaurant" in types or "food" in types:
            kind = "Dining experience"
        elif "tourist_attraction" in types:
            kind = "Attraction"
        else:
            kind = "Experience"
        cards.append(
            {
                "type": "tour",
                "title": name,
                "image_url": photo_url,
                "description": f"{kind} in {destination}.",
                "rating": place.get("rating"),
                "estimated_price": _price_level_to_estimate(
                    place.get("price_level"),
                    fallback=_suggestion_price_estimate("tour", ctx),
                ),
                "url": place.get("google_maps_uri") or place.get("website_uri"),
                "location": place.get("address"),
                "fit_reason": None,
            }
        )
        if len(cards) == max_cards:
            break
    if specific_query and cards:
        return {
            "cards": cards,
            "assistant_content": (
                f"I found {cards[0]['title']}. Should I add it to your schedule, "
                "or tell me which existing activity it should replace."
            ),
            "assistant_chips": ["Add it to the schedule", "I'll tell you what to replace"],
        }
    return {"cards": cards}


def _retrieve_food_node(state: PostChatState) -> dict[str, Any]:
    trip = state["trip"]
    ctx = trip.planning_context or {}
    destinations = ctx.get("destinations") or []
    destination = destinations[0] if destinations else (trip.title or "destination").split(",")[0].strip()

    user_msg = (state.get("user_message") or "").lower()
    meal = "lunch" if "lunch" in user_msg else "dinner" if "dinner" in user_msg else "breakfast" if "breakfast" in user_msg else "restaurant"
    dining = (ctx.get("dining_style") or "").lower()
    qualifier = "fine dining " if "fine" in dining else "budget " if "street" in dining or "budget" in dining else ""
    query = f"best {qualifier}{meal} spots in {destination}"

    try:
        raw = _safe_loads(search_places(query, max_results=8))
    except Exception:
        return {
            "assistant_content": "I couldn't reach the restaurant search right now. Try again in a moment.",
            "assistant_chips": ["Show hotel cards", "Show things to do"],
            "cards": [],
        }
    places = raw.get("places") if isinstance(raw.get("places"), list) else []
    existing = _existing_titles(state["db"], state["trip_id"])
    cards: list[dict[str, Any]] = []
    for place in places:
        if not isinstance(place, dict):
            continue
        name = place.get("name") or "Restaurant option"
        if name.lower().strip() in existing:
            continue
        photo_url = place.get("photo_url")
        if not photo_url and place.get("photo_name"):
            photo_url = photo_proxy_url(place.get("photo_name"))
        types = place.get("types") or []
        kind = "Cafe" if "cafe" in types else "Restaurant"
        cards.append(
            {
                "type": "food",
                "title": name,
                "image_url": photo_url,
                "description": f"{kind} in {destination}.",
                "rating": place.get("rating"),
                "estimated_price": _price_level_to_estimate(
                    place.get("price_level"),
                    fallback=_suggestion_price_estimate("food", ctx),
                ),
                "url": place.get("google_maps_uri") or place.get("website_uri"),
                "location": place.get("address"),
                "fit_reason": None,
            }
        )
        if len(cards) == 5:
            break
    return {"cards": cards}


def _apply_change_node(state: PostChatState) -> dict[str, Any]:
    return {
        # Reuse existing tool-loop semantics in main.py for mutation-heavy requests.
        "delegate_to_legacy": True,
    }


def _general_reply_node(state: PostChatState) -> dict[str, Any]:
    if not llm_configured():
        return {
            "assistant_content": (
                "I can help with flights, hotels, and activity alternatives. "
                "Tell me which type you want to compare."
            ),
            "assistant_chips": ["Show flight options", "Show hotel cards", "Show tour cards"],
        }

    trip: Trip = state.get("trip")
    ctx = (trip.planning_context or {}) if trip else {}
    trip_meta = (
        f"Destination: {trip.title}\n"
        f"Dates: {trip.start} to {trip.end}\n"
        f"Travelers: {trip.num_people}\n"
        f"Budget: ${trip.budget:,.0f}\n"
        f"Departure city: {ctx.get('origin') or ctx.get('origin_iata') or 'unknown'}"
    ) if trip else "(Trip details unavailable.)"

    recent_chat = "\n".join(
        f"{m.role}: {m.content}"
        for m in (state.get("messages") or [])[-10:]
    )

    itinerary = state.get("itinerary_summary") or "(No itinerary loaded.)"

    prompt = f"""You are a helpful travel assistant. The user has already built their itinerary and is asking follow-up questions. Answer specifically and helpfully using the trip details and itinerary below. Do not ask the user to clarify what destination or trip they mean — you already know.

TRIP:
{trip_meta}

ITINERARY:
{itinerary}

RECENT CONVERSATION:
{recent_chat}

USER: {state.get("user_message", "")}

IMPORTANT: You cannot make changes to the itinerary yourself. If the user is asking you to add, replace, swap, remove, or edit an activity, do NOT claim you made the change. Instead, acknowledge what they want and tell them to confirm the action (e.g. "Got it — just confirm and I'll swap it in for you.").

Reply in 2-3 sentences. Be specific — reference actual activities, days, or locations from the itinerary when relevant. Return plain text only."""

    try:
        content = complete_text(prompt)
        return {
            "assistant_content": _strip_json(content) or "Let me know what you'd like help with.",
            "assistant_chips": ["Show flight options", "Show hotel cards", "Show tour cards"],
        }
    except Exception:
        return {
            "assistant_content": "Tell me whether you want flights, hotels, or tours and I can suggest options.",
            "assistant_chips": ["Show flight options", "Show hotel cards", "Show tour cards"],
        }


def _format_node(state: PostChatState) -> dict[str, Any]:
    intent = state.get("intent")

    if state.get("delegate_to_legacy"):
        return {
            "assistant_content": "",
            "assistant_chips": [],
        }

    content = state.get("assistant_content")
    chips = state.get("assistant_chips")

    trip: Trip | None = state.get("trip")
    ctx = (trip.planning_context or {}) if trip else {}
    destination = (ctx.get("destinations") or [None])[0] or (trip.title if trip else None) or "your destination"
    origin = ctx.get("origin") or ctx.get("origin_iata") or "your departure city"
    depart_date = (trip.start if trip else "") or ""

    if not content:
        if intent == "suggest_flights":
            count = len(state.get("flight_options") or [])
            if count:
                date_str = f" departing {depart_date}" if depart_date else ""
                content = f"Here are {count} flight options from {origin} to {destination}{date_str}, ranked by price."
                chips = ["Show hotel options", "Show things to do"]
            else:
                content = f"I couldn't find flights from {origin} to {destination} right now. Try checking Google Flights directly."
                chips = ["Show hotel cards", "Show tour cards"]
        elif intent == "suggest_lodging":
            count = len(state.get("cards") or [])
            content = (
                f"Here are {count} places to stay in {destination}."
                if count
                else f"I couldn't find lodging options in {destination} right now."
            )
            chips = ["More luxury options", "More budget options", "Show things to do"]
        elif intent == "suggest_food":
            count = len(state.get("cards") or [])
            content = (
                f"Here are {count} places to eat in {destination}."
                if count
                else f"I couldn't find restaurant options in {destination} right now."
            )
            chips = ["More budget options", "Fine dining options", "Show things to do"]
        elif intent == "suggest_experiences":
            count = len(state.get("cards") or [])
            content = (
                f"Here are {count} things to do in {destination}."
                if count
                else f"I couldn't find experience options in {destination} right now."
            )
            chips = ["More outdoor options", "More cultural options", "Show hotel options"]
    return {
        "assistant_content": content or "Tell me what you'd like to refine.",
        "assistant_chips": chips or ["Show flight options", "Show hotel cards", "Show tour cards"],
    }


def _route_after_intent(state: PostChatState) -> str:
    intent = state.get("intent")
    if intent == "suggest_flights":
        return "retrieve_flights"
    if intent == "suggest_lodging":
        return "retrieve_lodging"
    if intent == "suggest_food":
        return "retrieve_food"
    if intent == "suggest_experiences":
        return "retrieve_experiences"
    if intent == "apply_change":
        return "apply_change"
    return "general_reply"


def build_post_itinerary_graph():
    g = StateGraph(PostChatState)
    g.add_node("route_intent", _route_node)
    g.add_node("retrieve_flights", _retrieve_flights_node)
    g.add_node("retrieve_lodging", _retrieve_lodging_node)
    g.add_node("retrieve_food", _retrieve_food_node)
    g.add_node("retrieve_experiences", _retrieve_experiences_node)
    g.add_node("apply_change", _apply_change_node)
    g.add_node("general_reply", _general_reply_node)
    g.add_node("format_response", _format_node)

    g.set_entry_point("route_intent")
    g.add_conditional_edges(
        "route_intent",
        _route_after_intent,
        {
            "retrieve_flights": "retrieve_flights",
            "retrieve_lodging": "retrieve_lodging",
            "retrieve_food": "retrieve_food",
            "retrieve_experiences": "retrieve_experiences",
            "apply_change": "apply_change",
            "general_reply": "general_reply",
        },
    )
    g.add_edge("retrieve_flights", "format_response")
    g.add_edge("retrieve_lodging", "format_response")
    g.add_edge("retrieve_food", "format_response")
    g.add_edge("retrieve_experiences", "format_response")
    g.add_edge("apply_change", "format_response")
    g.add_edge("general_reply", "format_response")
    g.add_edge("format_response", END)
    return g.compile()


post_itinerary_graph = build_post_itinerary_graph()


def run_post_itinerary_turn(db: Session, trip_id: int, user_message: str) -> dict[str, Any]:
    initial: PostChatState = {"db": db, "trip_id": trip_id, "user_message": user_message}
    result = post_itinerary_graph.invoke(initial)

    apply_mode = result.get("apply_mode") or "replace"
    replace_activity_id = result.get("replace_activity_id")
    replace_category = result.get("replace_category")
    target_date = result.get("target_date")

    # Embed apply context into each card/flight so it persists in the DB JSON column
    # and the frontend can read it directly from each item.
    flight_options = list(result.get("flight_options") or [])
    for f in flight_options:
        f["apply_mode"] = apply_mode
        f["replace_activity_id"] = replace_activity_id
        f["replace_category"] = replace_category or "flight"
        f["target_date"] = target_date

    cards = list(result.get("cards") or [])
    for c in cards:
        c["apply_mode"] = apply_mode
        c["replace_activity_id"] = replace_activity_id
        c["replace_category"] = replace_category
        c["target_date"] = target_date

    return {
        "content": result.get("assistant_content", "Done."),
        "chips": result.get("assistant_chips") or [],
        "flight_options": flight_options,
        "cards": cards,
        "trip_updated": bool(result.get("trip_updated")),
        "delegate_to_legacy": bool(result.get("delegate_to_legacy")),
    }
