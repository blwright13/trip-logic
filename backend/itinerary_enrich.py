"""Attach external info URLs to parsed activities (Places Maps, Google Flights search)."""
from __future__ import annotations

import json
import re
from urllib.parse import quote

from integrations.google_places import configured as places_configured, search_places
from models import Trip

_IATA_RE = re.compile(r"\b([A-Z]{3})\b")


def _extract_iata_pair(text: str) -> tuple[str, str] | None:
    """Return (origin_iata, dest_iata) if two distinct 3-letter codes are found in text."""
    codes = _IATA_RE.findall(text or "")
    seen: list[str] = []
    for c in codes:
        if c not in seen:
            seen.append(c)
        if len(seen) == 2:
            return seen[0], seen[1]
    return None


def google_flights_search_url(
    origin: str = "",
    destination: str = "",
    date: str = "",
    title: str = "",
) -> str:
    """
    Build a Google Flights search URL pre-populated with origin, destination, and date.

    Tries to extract IATA codes from `title` first (e.g. "Delta DL101 DTW→CDG").
    Falls back to raw origin/destination city names.
    """
    pair = _extract_iata_pair(title)
    if pair:
        origin_q, dest_q = pair
    else:
        origin_q = (origin or "").strip()
        dest_q = (destination or "").strip()

    if origin_q and dest_q and date:
        q = f"flights from {origin_q} to {dest_q} on {date}"
    elif origin_q and dest_q:
        q = f"flights from {origin_q} to {dest_q}"
    else:
        q = (title or "flights").strip()

    return f"https://www.google.com/travel/flights?q={quote(q)}"


def first_place_info_url(text_query: str) -> str | None:
    """First Google Maps or website URL from Places text search."""
    raw = search_places(text_query, max_results=1)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if data.get("error"):
        return None
    places = data.get("places") or []
    if not places:
        return None
    p = places[0]
    return p.get("google_maps_uri") or p.get("website_uri")


def enrich_activity_urls(trip: Trip, activities: list[dict]) -> None:
    """
    Mutate each activity dict with info_url where possible.
    - flight: Google Flights search from title + date (planning origin/destination as fallback).
    - other: Google Maps / website from Places text search when API key is set.
    """
    if not activities:
        return

    ctx = trip.planning_context or {}
    dests = ctx.get("destinations") or []
    dest_str = (dests[0] if dests else "").strip()
    origin_city = (ctx.get("origin") or "").strip()

    for act in activities:
        cat = (act.get("category") or "").lower()
        title = (act.get("title") or "").strip()
        start = act.get("start", "")
        date_part = start[:10] if isinstance(start, str) and len(start) >= 10 else (trip.start or "")

        if cat == "flight":
            act["info_url"] = google_flights_search_url(
                origin=origin_city,
                destination=dest_str,
                date=date_part,
                title=title,
            )
            continue

        if places_configured() and dest_str and title:
            q = f"{title} {dest_str}".strip()
            if len(q) >= 4:
                url = first_place_info_url(q)
                if url:
                    act["info_url"] = url
                    continue

        if places_configured() and title and len(title) >= 4:
            url = first_place_info_url(title)
            if url:
                act["info_url"] = url
