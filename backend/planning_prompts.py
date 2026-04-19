"""Shared prompt builders for planning / itinerary generation."""

from datetime import date
from typing import Optional

from models import Trip


def _taste_lines(ctx: dict) -> list[str]:
    ts = ctx.get("taste_signals") or {}
    liked = ts.get("liked") or []
    disliked = ts.get("disliked") or []
    lines: list[str] = []

    def price_label(raw: object) -> Optional[str]:
        if raw is None:
            return None
        labels = {
            "0": "free",
            "1": "$",
            "2": "$$",
            "3": "$$$",
            "4": "$$$$",
            "PRICE_LEVEL_FREE": "free",
            "PRICE_LEVEL_INEXPENSIVE": "$",
            "PRICE_LEVEL_MODERATE": "$$",
            "PRICE_LEVEL_EXPENSIVE": "$$$",
            "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
        }
        return labels.get(str(raw).strip().upper())

    def place_summary(place: dict) -> str:
        parts = [str(place.get("name") or "?")]
        types = place.get("types")
        if isinstance(types, list) and types:
            parts.append(f"types: {', '.join(str(t).replace('_', ' ') for t in types[:3])}")
        price = price_label(place.get("price_level"))
        if price:
            parts.append(f"price: {price}")
        description = place.get("description")
        if isinstance(description, str) and description.strip():
            parts.append(f"expectation: {description.strip()}")
        return " (".join([parts[0], "; ".join(parts[1:]) + ")"]) if len(parts) > 1 else parts[0]

    if liked:
        summaries = [place_summary(p) for p in liked if isinstance(p, dict)]
        if summaries:
            lines.append(
                "User liked these example places; prefer similar venue styles, cuisines, price levels, and pacing: "
                + " | ".join(summaries[:8])
            )
    if disliked:
        summaries = [place_summary(p) for p in disliked if isinstance(p, dict)]
        if summaries:
            lines.append(
                "User disliked these example places; avoid similar venue styles, cuisines, price levels, and pacing: "
                + " | ".join(summaries[:8])
            )
    return lines


_PACE_DENSITY = {
    "relaxed": "4–5 activities per day (3 meals + 1–2 experiences)",
    "moderate": "5–6 activities per day (3 meals + 2–3 experiences)",
    "packed": "6–8 activities per day (3 meals + 3–5 experiences)",
}


def context_to_generation_prompt(trip: Trip) -> str:
    ctx = trip.planning_context or {}
    parts = []
    if trip.initial_request:
        parts.append(f"Original user request: {trip.initial_request}")
    if ctx.get("destinations"):
        parts.append(f"Destinations: {', '.join(ctx['destinations'])}")
    if ctx.get("origin"):
        parts.append(f"Flying from (home / departure): {ctx['origin']}")
    if ctx.get("origin_iata"):
        parts.append(f"Departure airport IATA (if known): {ctx['origin_iata']}")
    if ctx.get("start"):
        parts.append(f"Start date: {ctx['start']}")
    if ctx.get("end"):
        parts.append(f"End date: {ctx['end']}")
    if ctx.get("num_people") is not None:
        parts.append(f"Travelers: {ctx['num_people']}")
    if ctx.get("budget") is not None:
        parts.append(f"Total budget (USD): {ctx['budget']}")
    if ctx.get("interests"):
        parts.append(f"Interests: {', '.join(ctx['interests'])}")
    if ctx.get("pace"):
        parts.append(f"Trip pace: {ctx['pace']}")
    if ctx.get("transport_style"):
        parts.append(f"Transport preference: {ctx['transport_style']}")
    if ctx.get("dietary_notes"):
        parts.append(f"Dietary / food constraints: {ctx['dietary_notes']}")
    if ctx.get("notes"):
        parts.append(f"Notes: {ctx['notes']}")
    if ctx.get("extra_context"):
        parts.append(f"Additional preferences from traveler: {ctx['extra_context']}")
    parts.extend(_taste_lines(ctx))

    # Computed scheduling context
    try:
        start = date.fromisoformat(ctx["start"])
        end = date.fromisoformat(ctx["end"])
        num_days = (end - start).days + 1
        parts.append(f"Total days: {num_days}. You MUST generate activities covering ALL {num_days} days.")
        budget = ctx.get("budget")
        if budget is not None and num_days > 0:
            parts.append(f"Approximate budget per day: ${float(budget) / num_days:.0f} USD")
    except (KeyError, ValueError, TypeError):
        pass

    pace = str(ctx.get("pace") or "").lower().strip()
    if pace in _PACE_DENSITY:
        parts.append(f"Target activity density: {_PACE_DENSITY[pace]}")
    else:
        parts.append(
            "Target activity density: choose an appropriate pace from trip length, budget, and traveler preferences."
        )

    return "\n".join(parts)
