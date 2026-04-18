"""Attach external info URLs to parsed activities (Places Maps, Google Flights search)."""
from __future__ import annotations

import json
from urllib.parse import quote

from integrations.google_places import configured as places_configured, search_places
from models import Trip


def google_flights_search_url(query: str) -> str:
    """Consumer-friendly flight search (AviationStack has no public booking/detail URLs)."""
    q = (query or "").strip() or "flights"
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
            parts = [title, date_part]
            if origin_city and dest_str:
                parts.append(f"{origin_city} to {dest_str}")
            q = " ".join(p for p in parts if p).strip()
            act["info_url"] = google_flights_search_url(q)
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
