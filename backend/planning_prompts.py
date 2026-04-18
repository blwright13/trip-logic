"""Shared prompt builders for planning / itinerary generation."""

from models import Trip


def _taste_lines(ctx: dict) -> list[str]:
    ts = ctx.get("taste_signals") or {}
    liked = ts.get("liked") or []
    disliked = ts.get("disliked") or []
    lines: list[str] = []
    if liked:
        names = [str(p.get("name", "?")) for p in liked if isinstance(p, dict)]
        if names:
            lines.append(f"User liked these example places (prefer similar): {', '.join(names[:12])}")
    if disliked:
        names = [str(p.get("name", "?")) for p in disliked if isinstance(p, dict)]
        if names:
            lines.append(f"User disliked these example places (avoid similar): {', '.join(names[:12])}")
    return lines


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
    return "Create a complete detailed itinerary for this trip. " + "\n".join(parts)
