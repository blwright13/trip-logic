"""Full itinerary generation from a natural-language prompt (used after planning context is complete)."""
import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from llm import complete_text, llm_configured
from itinerary_enrich import enrich_activity_urls
from models import Trip, Activity, CategoryEnum


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def merge_parsed_with_canonical(trip: Trip, parsed: dict) -> dict:
    """
    Keep LLM itinerary title and activities; force dates/budget/travelers from planning_context
    so hallucinations cannot overwrite agreed trip facts.
    """
    ctx = trip.planning_context or {}
    out = dict(parsed) if parsed else {}

    # Catchy title from model, bounded length
    raw_title = (out.get("title") or "").strip()
    if raw_title and len(raw_title) < 200 and not raw_title.lower().startswith("create a complete"):
        out["title"] = raw_title[:120]
    elif ctx.get("destinations"):
        out["title"] = ", ".join(ctx["destinations"])
    else:
        out["title"] = (out.get("title") or trip.title or "My trip")[:120]

    if ctx.get("start"):
        out["start"] = ctx["start"]
    if ctx.get("end"):
        out["end"] = ctx["end"]
    if ctx.get("num_people") is not None:
        out["num_people"] = int(ctx["num_people"])
    if ctx.get("budget") is not None:
        out["budget"] = float(ctx["budget"])

    if not out.get("activities"):
        out["activities"] = []
    return out


def parse_trip_from_prompt(request: str) -> dict:
    """Use the LLM to parse natural language trip request into structured data."""
    if not llm_configured():
        return {
            "title": request,
            "start": datetime.now().strftime("%Y-%m-%d"),
            "end": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "num_people": 2,
            "budget": 2000,
            "activities": [],
        }

    prompt = f"""Parse this trip request and generate a structured travel plan with activities.
Request: "{request}"

Return a JSON object with this exact structure (no markdown, just valid JSON):
{{
    "title": "Short catchy trip name, 2-6 words (e.g. 'Kyoto food week', 'Paris spring escape') — NOT a full sentence",
    "start": "YYYY-MM-DD (start date, use reasonable future date)",
    "end": "YYYY-MM-DD (end date)",
    "num_people": number,
    "budget": number (estimated total budget in USD),
    "activities": [
        {{
            "title": "Activity name",
            "category": "one of: flight, hotel, food, sightseeing, entertainment, cafe, shopping, transport",
            "start": "YYYY-MM-DDTHH:MM:SS (datetime for this activity)",
            "duration": number (minutes),
            "cost": number (USD),
            "location": "Location name"
        }}
    ]
}}

Generate a realistic itinerary with 4-6 activities per day. Include flights at start/end, hotel check-ins, meals, and sightseeing activities."""

    try:
        text = _strip_json(complete_text(prompt))
        print(text)
        return json.loads(text)
    except Exception as e:
        print(f"Itinerary parsing error: {e}")
        return {
            "title": request,
            "start": datetime.now().strftime("%Y-%m-%d"),
            "end": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "num_people": 2,
            "budget": 2000,
            "activities": [],
        }


def replace_trip_activities(db: Session, trip: Trip, parsed: dict) -> None:
    """Replace all activities for a trip from parsed itinerary data."""
    parsed = merge_parsed_with_canonical(trip, parsed)
    activities = parsed.get("activities") or []
    enrich_activity_urls(trip, activities)
    db.query(Activity).filter(Activity.trip_id == trip.id).delete(synchronize_session=False)
    trip.title = parsed.get("title", trip.title)
    trip.start = parsed.get("start", trip.start)
    trip.end = parsed.get("end", trip.end)
    trip.num_people = parsed.get("num_people", trip.num_people)
    trip.budget = float(parsed.get("budget", trip.budget))

    for act_data in activities:
        category_str = act_data.get("category", "sightseeing")
        try:
            category = CategoryEnum(category_str)
        except ValueError:
            category = CategoryEnum.sightseeing

        activity = Activity(
            trip_id=trip.id,
            title=act_data.get("title", "Activity"),
            category=category,
            start=act_data.get("start", trip.start + "T09:00:00"),
            duration=act_data.get("duration", 60),
            cost=act_data.get("cost", 0),
            location=act_data.get("location"),
            info_url=act_data.get("info_url"),
        )
        db.add(activity)
