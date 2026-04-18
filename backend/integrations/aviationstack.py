"""AviationStack API — airports / city lookup for itinerary context.

Consumer flight detail/booking URLs are not provided by this API; the app builds
Google Flights search links in itinerary_enrich when saving flight activities.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

BASE = "http://api.aviationstack.com/v1"


def configured() -> bool:
    return bool(os.getenv("AVIATIONSTACK_ACCESS_KEY", "").strip())


def search_airports(query: str, limit: int = 8) -> str:
    """
    Search airports/cities by name or IATA fragment.
    Returns a short JSON string for the LLM (or error message).
    """
    key = os.getenv("AVIATIONSTACK_ACCESS_KEY", "").strip()
    if not key:
        return json.dumps({"error": "AviationStack API key not configured"})

    query = (query or "").strip()[:120]
    if not query:
        return json.dumps({"results": []})

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{BASE}/airports",
                params={"access_key": key, "search": query, "limit": limit},
            )
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:500]})
            data = r.json()
    except Exception as e:
        return json.dumps({"error": str(e)})

    rows = data.get("data") or []
    slim: list[dict[str, Any]] = []
    for c in rows[:limit]:
        if not isinstance(c, dict):
            continue
        slim.append(
            {
                "airport_name": c.get("airport_name"),
                "iata_code": c.get("iata_code"),
                "city": (c.get("city_name") or c.get("name")),
                "country": c.get("country_name"),
            }
        )
    return json.dumps({"query": query, "airports": slim}, ensure_ascii=False)


def flight_schedule_lookup(origin_iata: str, dest_iata: str, flight_date: str) -> str:
    """
    Optional: sample scheduled routes (free tier may be limited).
    flight_date: YYYY-MM-DD
    """
    key = os.getenv("AVIATIONSTACK_ACCESS_KEY", "").strip()
    if not key:
        return json.dumps({"error": "AviationStack API key not configured"})

    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.get(
                f"{BASE}/flights",
                params={
                    "access_key": key,
                    "dep_iata": origin_iata.upper()[:3],
                    "arr_iata": dest_iata.upper()[:3],
                    "flight_date": flight_date,
                    "limit": 5,
                },
            )
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "note": r.text[:300]})
            data = r.json()
    except Exception as e:
        return json.dumps({"error": str(e)})

    flights = data.get("data") or []
    out = []
    for f in flights[:5]:
        if not isinstance(f, dict):
            continue
        out.append(
            {
                "flight_date": f.get("flight_date"),
                "departure": (f.get("departure") or {}).get("iata"),
                "arrival": (f.get("arrival") or {}).get("iata"),
                "airline": (f.get("airline") or {}).get("name"),
                "flight_number": (f.get("flight") or {}).get("iata"),
            }
        )
    return json.dumps({"origin": origin_iata, "destination": dest_iata, "date": flight_date, "flights": out})
