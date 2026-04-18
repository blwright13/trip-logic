"""SerpApi — Google Flights search for flight schedule/offer lookups."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

BASE = "https://serpapi.com/search"


def configured() -> bool:
    return bool(os.getenv("SERP_API_KEY", "").strip())


def search_flights(
    origin_iata: str,
    dest_iata: str,
    departure_date: str,
    airline_code: str = "",
    return_date: str = "",
) -> str:
    """
    Search Google Flights via SerpApi for available flights on a given date.

    Args:
        origin_iata: 3-letter departure airport code (e.g. DTW)
        dest_iata:   3-letter arrival airport code (e.g. CDG)
        departure_date: YYYY-MM-DD
        airline_code: optional IATA airline code to filter (e.g. DL for Delta)
        return_date: optional YYYY-MM-DD for round-trip; omit for one-way

    Returns JSON string suitable for the LLM.
    """
    key = os.getenv("SERP_API_KEY", "").strip()
    if not key:
        return json.dumps({"error": "SERP_API_KEY not configured"})

    origin = origin_iata.upper().strip()[:3]
    dest = dest_iata.upper().strip()[:3]
    if not origin or not dest or not departure_date:
        return json.dumps({"error": "origin_iata, dest_iata, and departure_date are required"})

    params: dict[str, Any] = {
        "engine": "google_flights",
        "departure_id": origin,
        "arrival_id": dest,
        "outbound_date": departure_date,
        "currency": "USD",
        "hl": "en",
        "api_key": key,
        # 1 = round-trip, 2 = one-way
        "type": "1" if return_date else "2",
    }
    if return_date:
        params["return_date"] = return_date
    if airline_code:
        params["include_airlines"] = airline_code.upper()[:2]

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(BASE, params=params)
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:500]})
            data = r.json()
    except Exception as e:
        return json.dumps({"error": str(e)})

    # SerpApi returns best_flights and other_flights
    results: list[dict[str, Any]] = []
    for bucket in ("best_flights", "other_flights"):
        for flight in data.get(bucket) or []:
            if not isinstance(flight, dict):
                continue
            legs = flight.get("flights") or []
            if not legs:
                continue
            first_leg = legs[0]
            last_leg = legs[-1]
            results.append(
                {
                    "airline": first_leg.get("airline"),
                    "airline_code": first_leg.get("airline_logo", "").split("/")[-1].split(".")[0] or None,
                    "flight_number": first_leg.get("flight_number"),
                    "departure_airport": first_leg.get("departure_airport", {}).get("id"),
                    "departure_time": first_leg.get("departure_airport", {}).get("time"),
                    "arrival_airport": last_leg.get("arrival_airport", {}).get("id"),
                    "arrival_time": last_leg.get("arrival_airport", {}).get("time"),
                    "duration_minutes": flight.get("total_duration"),
                    "stops": len(legs) - 1,
                    "price_usd": flight.get("price"),
                    "is_best": bucket == "best_flights",
                }
            )
            if len(results) >= 8:
                break
        if len(results) >= 8:
            break

    return json.dumps(
        {
            "origin": origin,
            "destination": dest,
            "date": departure_date,
            "airline_filter": airline_code or None,
            "flights": results,
        },
        ensure_ascii=False,
    )


def search_hotels(
    destination: str,
    check_in_date: str,
    check_out_date: str,
    adults: int = 2,
) -> str:
    """
    Search Google Hotels via SerpApi for available hotels and nightly rates.

    Args:
        destination:    City or area name (e.g. "Paris", "Midtown Manhattan")
        check_in_date:  YYYY-MM-DD
        check_out_date: YYYY-MM-DD
        adults:         Number of adult guests

    Returns JSON string suitable for the LLM.
    """
    key = os.getenv("SERP_API_KEY", "").strip()
    if not key:
        return json.dumps({"error": "SERP_API_KEY not configured"})

    if not destination or not check_in_date or not check_out_date:
        return json.dumps({"error": "destination, check_in_date, and check_out_date are required"})

    params: dict[str, Any] = {
        "engine": "google_hotels",
        "q": f"hotels in {destination}",
        "check_in_date": check_in_date,
        "check_out_date": check_out_date,
        "adults": str(max(1, adults)),
        "currency": "USD",
        "hl": "en",
        "api_key": key,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(BASE, params=params)
            if r.status_code != 200:
                return json.dumps({"error": f"HTTP {r.status_code}", "body": r.text[:500]})
            data = r.json()
    except Exception as e:
        return json.dumps({"error": str(e)})

    results: list[dict[str, Any]] = []
    for hotel in (data.get("properties") or []):
        if not isinstance(hotel, dict):
            continue
        rate_per_night = None
        total_rate = None
        prices = hotel.get("rate_per_night") or {}
        if isinstance(prices, dict):
            raw = prices.get("extracted_lowest") or prices.get("lowest")
            if raw is not None:
                try:
                    rate_per_night = float(str(raw).replace(",", "").replace("$", ""))
                except ValueError:
                    pass
        total = hotel.get("total_rate") or {}
        if isinstance(total, dict):
            raw_total = total.get("extracted_lowest") or total.get("lowest")
            if raw_total is not None:
                try:
                    total_rate = float(str(raw_total).replace(",", "").replace("$", ""))
                except ValueError:
                    pass

        results.append(
            {
                "name": hotel.get("name"),
                "type": hotel.get("type"),
                "rating": hotel.get("overall_rating"),
                "reviews": hotel.get("reviews"),
                "stars": hotel.get("hotel_class"),
                "rate_per_night_usd": rate_per_night,
                "total_rate_usd": total_rate,
                "check_in": check_in_date,
                "check_out": check_out_date,
                "amenities": (hotel.get("amenities") or [])[:6],
            }
        )
        if len(results) >= 6:
            break

    return json.dumps(
        {
            "destination": destination,
            "check_in": check_in_date,
            "check_out": check_out_date,
            "adults": adults,
            "hotels": results,
        },
        ensure_ascii=False,
    )
