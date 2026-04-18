"""Google Places API (New) — text search for POIs, restaurants, etc."""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any
from urllib.parse import quote

import httpx

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


def configured() -> bool:
    return bool(os.getenv("GOOGLE_PLACES_API_KEY", "").strip())


def photo_proxy_url(photo_name: str | None) -> str | None:
    if not photo_name:
        return None
    return f"/api/places/photo?name={quote(photo_name, safe='')}"


def search_places(text_query: str, max_results: int = 5) -> str:
    """
    Text search for places. Returns JSON string for the LLM.
    price_level is 0–4 when present (Google scale); not a dollar amount.
    """
    key = os.getenv("GOOGLE_PLACES_API_KEY", "").strip()
    if not key:
        return json.dumps({"error": "Google Places API key not configured"})

    q = (text_query or "").strip()[:200]
    if not q:
        return json.dumps({"places": []})

    body = {"textQuery": q, "maxResultCount": min(max(1, max_results), 10)}

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,places.priceLevel,places.rating,places.types,"
            "places.googleMapsUri,places.websiteUri,places.photos"
        ),
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(SEARCH_URL, headers=headers, json=body)
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:500]})
            data = r.json()
    except Exception as e:
        return json.dumps({"error": str(e)})

    places_raw = data.get("places") or []
    slim: list[dict[str, Any]] = []
    for p in places_raw[: max_results]:
        if not isinstance(p, dict):
            continue
        name = (p.get("displayName") or {}).get("text") if isinstance(p.get("displayName"), dict) else None
        photos = p.get("photos") if isinstance(p.get("photos"), list) else []
        first_photo_name = None
        if photos and isinstance(photos[0], dict):
            first_photo_name = photos[0].get("name")
        slim.append(
            {
                "name": name,
                "address": p.get("formattedAddress"),
                "rating": p.get("rating"),
                "price_level": p.get("priceLevel"),  # PRICE_LEVEL_* enum string in API v1
                "photo_name": first_photo_name,
                "photo_url": photo_proxy_url(first_photo_name),
                "types": (p.get("types") or [])[:5],
                "google_maps_uri": p.get("googleMapsUri"),
                "website_uri": p.get("websiteUri"),
            }
        )
    return json.dumps({"query": q, "places": slim}, ensure_ascii=False)


def _place_id(name: str | None, address: str | None) -> str:
    raw = f"{name or ''}|{address or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def synthetic_taste_cards(dest: str) -> list[dict[str, Any]]:
    """Public: style-only cards when Places is off or returns no rows."""
    return _synthetic_taste_options(dest)


def _synthetic_taste_options(dest: str) -> list[dict[str, Any]]:
    """Style prompts when Places returns nothing so the UI still has cards to rate."""
    d = dest.strip() or "your destination"
    return [
        {
            "id": "synthetic-food",
            "name": f"Upscale dinner & wine in {d}",
            "address": None,
            "rating": None,
            "price_level": "PRICE_LEVEL_EXPENSIVE",
            "photo_url": None,
            "description": "A higher-touch dining choice with reservations, wine, and a slower evening pace.",
            "types": ["restaurant", "food"],
            "query": "synthetic_style",
            "synthetic": True,
        },
        {
            "id": "synthetic-culture",
            "name": f"Major museums & landmarks in {d}",
            "address": None,
            "rating": None,
            "price_level": "PRICE_LEVEL_MODERATE",
            "photo_url": None,
            "description": "A culture-heavy stop built around museums, monuments, and signature landmarks.",
            "types": ["museum", "tourist_attraction"],
            "query": "synthetic_style",
            "synthetic": True,
        },
        {
            "id": "synthetic-outdoor",
            "name": f"Parks, walks & outdoor time in {d}",
            "address": None,
            "rating": None,
            "price_level": "PRICE_LEVEL_FREE",
            "photo_url": None,
            "description": "A lower-cost outdoor option focused on parks, walks, views, and unstructured time.",
            "types": ["park", "natural_feature"],
            "query": "synthetic_style",
            "synthetic": True,
        },
    ]


def taste_suggestions_for_destinations(
    destinations: list[str],
    interests: list[str] | None = None,
    max_total: int = 9,
) -> list[dict[str, Any]]:
    """
    Mixed text queries (dining, culture, outdoors) for taste calibration.
    Returns slim dicts with stable id for client like/dislike.
    If the Places API returns no rows (key missing, billing, etc.), returns synthetic style cards.
    """
    if not destinations:
        return []
    dest = destinations[0].strip()
    if not dest:
        return []

    interest_hint = ""
    if interests:
        interest_hint = f" ({', '.join(interests[:4])})"

    queries = [
        f"best restaurants in {dest}{interest_hint}",
        f"famous museums and culture in {dest}",
        f"parks hiking outdoor scenic in {dest}",
        f"top rated restaurants {dest}",
        f"museums {dest}",
        f"outdoor activities {dest}",
    ]

    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for q in queries:
        if len(out) >= max_total:
            break
        raw = search_places(q, max_results=3)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if data.get("error"):
            continue
        for p in data.get("places") or []:
            if not isinstance(p, dict):
                continue
            name = p.get("name")
            address = p.get("address")
            pid = _place_id(name, address)
            if pid in seen:
                continue
            seen.add(pid)
            out.append(
                {
                    "id": pid,
                    "name": name,
                    "address": address,
                    "rating": p.get("rating"),
                    "price_level": p.get("price_level"),
                    "photo_url": p.get("photo_url"),
                    "google_maps_uri": p.get("google_maps_uri"),
                    "website_uri": p.get("website_uri"),
                    "types": (p.get("types") or [])[:5],
                    "query": q,
                }
            )
            if len(out) >= max_total:
                return out
    if not out:
        return _synthetic_taste_options(dest)
    return out
