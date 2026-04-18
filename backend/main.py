import os
import json
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from auth import (
    AuthUser,
    get_current_user,
    get_optional_user,
    get_supabase_admin_client,
    preload_jwks,
)
from database import get_db, create_tables
from llm import complete_text, llm_configured
from models import (
    Trip, Activity, ChatMessage, CategoryEnum, PlanningPhase,
    TripCreate, TripUpdate, TripResponse, ActivityResponse,
    ChatRequest, ChatResponse, ChatMessageResponse, PlanningChatResponse,
    DayItinerary, DayActivity,
    ActivityUpdate, ActivityCreate, ReorderRequest, AlternativeActivity, AlternativesResponse,
    PlanningContextPatch, TasteSignalsBody, ProfileUpdate, ProfileResponse,
)
from integrations.google_places import (
    configured as places_configured,
    synthetic_taste_cards,
    taste_suggestions_for_destinations,
)
from planning_graph import (
    apply_planning_context_to_trip,
    build_welcome_message,
    compute_missing_slots,
    CONFIRM_CHIPS,
    finalize_confirm_summary,
    merge_planning_context_patch,
    run_itinerary_generation,
    run_planning_turn,
    seed_planning_context_from_initial_request,
)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    preload_jwks()
    yield


app = FastAPI(title="TripLogic API", lifespan=lifespan)

# CORS
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:8080", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/places/photo")
def get_place_photo(name: str):
    """Proxy Google Places photos so the Places API key stays server-side."""
    key = os.getenv("GOOGLE_PLACES_API_KEY", "").strip()
    photo_name = (name or "").strip().lstrip("/")
    if not key:
        raise HTTPException(status_code=503, detail="Google Places API key not configured")
    if not photo_name.startswith("places/") or "/photos/" not in photo_name:
        raise HTTPException(status_code=400, detail="Invalid Places photo name")

    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            r = client.get(
                f"https://places.googleapis.com/v1/{photo_name}/media",
                params={"maxWidthPx": 640, "key": key},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch Places photo: {exc}") from exc

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Could not fetch Places photo")
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/jpeg"),
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


def _strip_json_text(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end >= start:
        return stripped[start : end + 1]
    return stripped


def _add_ai_taste_descriptions(suggestions: list[dict]) -> list[dict]:
    """Add one-sentence expectation blurbs for taste cards when the LLM is configured."""
    pending = [s for s in suggestions if isinstance(s, dict) and not s.get("description")]
    if not pending or not llm_configured():
        return suggestions

    places = [
        {
            "id": s.get("id"),
            "name": s.get("name"),
            "address": s.get("address"),
            "types": s.get("types") or [],
            "rating": s.get("rating"),
            "price_level": s.get("price_level"),
            "query": s.get("query"),
        }
        for s in pending[:12]
    ]
    prompt = f"""Write concise taste-check descriptions for these travel places.

Each description must be exactly one sentence, 12-24 words, and explain what a traveler can expect: cuisine or experience type, what it is known for, or why it is popular.
Do not mention rating, price, address, or the words "taste-check".

Return JSON only:
{{"descriptions": {{"place_id": "one sentence"}}}}

Places:
{json.dumps(places, ensure_ascii=False)}"""

    try:
        data = json.loads(_strip_json_text(complete_text(prompt)))
    except Exception as exc:
        print(f"Taste description generation error: {exc}")
        return suggestions

    descriptions = data.get("descriptions") if isinstance(data, dict) else None
    if not isinstance(descriptions, dict):
        return suggestions

    for suggestion in suggestions:
        sid = str(suggestion.get("id") or "")
        description = descriptions.get(sid)
        if isinstance(description, str) and description.strip():
            suggestion["description"] = description.strip()
    return suggestions


def _get_trip_or_404(db: Session, trip_id: int) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _can_access_trip(trip: Trip, current_user: AuthUser | None) -> bool:
    if trip.user_id is None:
        return True
    return current_user is not None and trip.user_id == current_user.user_id


def _assert_trip_access(trip: Trip, current_user: AuthUser | None) -> None:
    if not _can_access_trip(trip, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this trip")


def _assert_trip_owner(trip: Trip, current_user: AuthUser | None) -> None:
    if current_user is None:
        raise HTTPException(status_code=403, detail="Authentication required")
    if trip.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip")


def _profile_from_user(user: AuthUser) -> ProfileResponse:
    metadata = user.user_metadata or {}
    tags = metadata.get("travel_style_tags")
    return ProfileResponse(
        user_id=user.user_id,
        email=user.email,
        display_name=metadata.get("display_name"),
        home_city=metadata.get("home_city"),
        preferred_currency=metadata.get("preferred_currency"),
        travel_style_tags=tags if isinstance(tags, list) else [],
    )


def generate_chat_response(trip: Trip, messages: list[ChatMessage], user_message: str) -> dict:
    """Generate AI response for chat."""
    if not llm_configured():
        return {
            "content": "I'd be happy to help you plan your trip! Unfortunately, the AI service is not configured. Please set OPENAI_API_KEY.",
            "chips": ["Try again later"],
            "trip_updated": False
        }

    # Build conversation history
    history = []
    for msg in messages[-10:]:  # Last 10 messages for context
        history.append(f"{msg.role}: {msg.content}")

    # Build trip context
    activities_summary = []
    for activity in trip.activities[:20]:  # Limit for context
        activities_summary.append(f"- {activity.title} ({activity.category.value}) at {activity.location}")

    prompt = f"""You are a helpful travel planning assistant for a trip to {trip.title}.

Trip details:
- Dates: {trip.start} to {trip.end}
- Travelers: {trip.num_people}
- Budget: ${trip.budget}
- Current activities: {chr(10).join(activities_summary) if activities_summary else 'None yet'}

Recent conversation:
{chr(10).join(history) if history else 'No previous messages'}

User: {user_message}

Respond helpfully and concisely. At the end, suggest 2-3 follow-up options the user might want.

Return JSON (no markdown):
{{
    "content": "Your helpful response here",
    "chips": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}}"""

    try:
        text = complete_text(prompt)
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        result = json.loads(text)
        return {
            "content": result.get("content", "I understand! Let me help you with that."),
            "chips": result.get("chips", ["Tell me more", "Show alternatives"]),
            "trip_updated": False
        }
    except Exception as e:
        print(f"Chat generation error: {e}")
        return {
            "content": "I'd be happy to help you adjust your itinerary! What specific changes would you like to make?",
            "chips": ["Add more activities", "Change dates", "Adjust budget"],
            "trip_updated": False
        }


# --- Endpoints ---

@app.post("/api/trips", response_model=TripResponse)
def create_trip(
    trip_request: TripCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Create a draft trip and enter conversational planning (no itinerary until context is complete)."""
    start_default = datetime.now().strftime("%Y-%m-%d")
    end_default = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")

    trip = Trip(
        title="New trip",
        start=start_default,
        end=end_default,
        num_people=1,
        budget=0,
        planning_phase=PlanningPhase.gathering.value,
        planning_context={},
        initial_request=trip_request.request,
        user_id=current_user.user_id if current_user else None,
    )
    db.add(trip)
    db.flush()

    ctx = seed_planning_context_from_initial_request(trip_request.request)
    apply_planning_context_to_trip(trip, ctx)

    user_opening = ChatMessage(
        trip_id=trip.id,
        role="user",
        content=trip_request.request,
        chips=None,
    )
    db.add(user_opening)

    welcome_text, welcome_chips = build_welcome_message(trip_request.request, ctx)
    welcome = ChatMessage(
        trip_id=trip.id,
        role="assistant",
        content=welcome_text,
        chips=welcome_chips,
    )
    db.add(welcome)

    db.commit()
    db.refresh(trip)
    return trip


@app.get("/api/trips", response_model=list[TripResponse])
def list_trips(
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """List all trips."""
    if current_user is None:
        return []
    trips = (
        db.query(Trip)
        .filter(Trip.user_id == current_user.user_id)
        .order_by(Trip.created_at.desc())
        .all()
    )
    return trips


@app.get("/api/trips/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Get a single trip with activities."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    return trip


@app.put("/api/trips/{trip_id}", response_model=TripResponse)
def update_trip(
    trip_id: int,
    trip_update: TripUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Update trip metadata."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_owner(trip, current_user)

    update_data = trip_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(trip, key, value)

    db.commit()
    db.refresh(trip)
    return trip


@app.delete("/api/trips/{trip_id}")
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Delete a trip and all related data."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_owner(trip, current_user)

    db.delete(trip)
    db.commit()
    return {"message": "Trip deleted"}


@app.post("/api/trips/{trip_id}/planning/message", response_model=PlanningChatResponse)
def send_planning_message(
    trip_id: int,
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Planning chat (gathering or confirming): merge context, taste/confirm flow, or generate on confirm chip."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    if trip.planning_phase not in (PlanningPhase.gathering.value, PlanningPhase.confirming.value):
        raise HTTPException(
            status_code=400,
            detail="Trip is not in planning mode; use /chat when itinerary is complete.",
        )

    # Explicit confirm while reviewing — run itinerary generation (same as POST .../planning/confirm)
    if trip.planning_phase == PlanningPhase.confirming.value and chat_request.message.strip() in CONFIRM_CHIPS:
        if current_user is None:
            raise HTTPException(status_code=401, detail="Sign in to build your itinerary")
        if trip.user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Claim this trip before building the itinerary")
        db.refresh(trip)
        missing = compute_missing_slots(trip.planning_context or {})
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot generate yet; missing: {', '.join(missing)}",
            )
        user_msg = ChatMessage(
            trip_id=trip_id,
            role="user",
            content=chat_request.message,
        )
        db.add(user_msg)
        db.flush()
        content, chips, build_meta, _ok = run_itinerary_generation(db, trip_id)
        db.refresh(trip)
        ai_msg = ChatMessage(
            trip_id=trip_id,
            role="assistant",
            content=content,
            chips=chips,
        )
        db.add(ai_msg)
        db.commit()
        db.refresh(ai_msg)
        db.refresh(trip)
        missing_after = compute_missing_slots(trip.planning_context or {})
        return PlanningChatResponse(
            message=ChatMessageResponse(
                id=ai_msg.id,
                role=ai_msg.role,
                content=ai_msg.content,
                chips=ai_msg.chips,
                created_at=ai_msg.created_at,
            ),
            trip_updated=True,
            planning_phase=trip.planning_phase,
            planning_context=trip.planning_context or {},
            missing_slots=missing_after,
            ready_to_generate=trip.planning_phase == PlanningPhase.complete.value,
            itinerary_build_meta=build_meta,
        )

    user_msg = ChatMessage(
        trip_id=trip_id,
        role="user",
        content=chat_request.message,
    )
    db.add(user_msg)
    db.flush()

    result = run_planning_turn(db, trip_id, chat_request.message)
    db.refresh(trip)

    ai_msg = ChatMessage(
        trip_id=trip_id,
        role="assistant",
        content=result.get("assistant_content", ""),
        chips=result.get("assistant_chips"),
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)
    db.refresh(trip)

    missing = compute_missing_slots(trip.planning_context or {})
    ready = trip.planning_phase == PlanningPhase.complete.value

    return PlanningChatResponse(
        message=ChatMessageResponse(
            id=ai_msg.id,
            role=ai_msg.role,
            content=ai_msg.content,
            chips=ai_msg.chips,
            created_at=ai_msg.created_at,
        ),
        trip_updated=True,
        planning_phase=trip.planning_phase,
        planning_context=trip.planning_context or {},
        missing_slots=missing,
        ready_to_generate=ready,
        itinerary_build_meta=result.get("itinerary_build_meta"),
    )


@app.patch("/api/trips/{trip_id}/planning-context", response_model=TripResponse)
def patch_planning_context(
    trip_id: int,
    body: PlanningContextPatch,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Merge partial JSON into trip.planning_context while gathering or confirming."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    if trip.planning_phase not in (PlanningPhase.gathering.value, PlanningPhase.confirming.value):
        raise HTTPException(status_code=400, detail="Trip is not in a planning phase that allows edits.")

    prior = dict(trip.planning_context or {})
    merged = merge_planning_context_patch(prior, body.planning_context)
    apply_planning_context_to_trip(trip, merged)
    db.commit()
    db.refresh(trip)
    return trip


@app.get("/api/trips/{trip_id}/planning/taste-suggestions")
def get_planning_taste_suggestions(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Return mixed Google Places suggestions for taste calibration (requires API key)."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    if trip.planning_phase not in (PlanningPhase.gathering.value, PlanningPhase.confirming.value):
        raise HTTPException(status_code=400, detail="Trip is not in planning mode.")
    ctx = trip.planning_context or {}
    if ctx.get("taste_calibration_status") != "pending":
        return {"suggestions": [], "configured": True, "reason": "not_in_taste_step"}
    dests = ctx.get("destinations") or []
    if not dests:
        return {"suggestions": [], "configured": True, "reason": "no_destinations"}
    interests = ctx.get("interests") if isinstance(ctx.get("interests"), list) else []
    if not places_configured():
        primary = (dests[0] or "").strip() or "your destination"
        return {"suggestions": synthetic_taste_cards(primary), "configured": False}
    suggestions = taste_suggestions_for_destinations(dests, interests)
    suggestions = _add_ai_taste_descriptions(suggestions)
    return {"suggestions": suggestions, "configured": True}


@app.post("/api/trips/{trip_id}/planning/taste-signals", response_model=PlanningChatResponse)
def post_planning_taste_signals(
    trip_id: int,
    body: TasteSignalsBody,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Save like/dislike signals (or skip), then emit confirmation summary and move to confirming phase."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    if trip.planning_phase != PlanningPhase.gathering.value:
        raise HTTPException(status_code=400, detail="Taste step is only available during gathering.")
    ctx = dict(trip.planning_context or {})
    if ctx.get("taste_calibration_status") != "pending":
        raise HTTPException(status_code=400, detail="Taste calibration is not pending for this trip.")

    if body.skip:
        ctx["taste_calibration_status"] = "skipped"
        ctx["taste_signals"] = {"liked": [], "disliked": []}
    else:
        ctx["taste_signals"] = {"liked": body.liked, "disliked": body.disliked}
        ctx["taste_calibration_status"] = "complete"

    trip.planning_context = ctx
    apply_planning_context_to_trip(trip, ctx)
    db.commit()
    db.refresh(trip)

    content, chips = finalize_confirm_summary(db, trip_id)
    db.refresh(trip)

    ai_msg = ChatMessage(
        trip_id=trip_id,
        role="assistant",
        content=content,
        chips=chips,
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)
    db.refresh(trip)

    missing = compute_missing_slots(trip.planning_context or {})
    return PlanningChatResponse(
        message=ChatMessageResponse(
            id=ai_msg.id,
            role=ai_msg.role,
            content=ai_msg.content,
            chips=ai_msg.chips,
            created_at=ai_msg.created_at,
        ),
        trip_updated=True,
        planning_phase=trip.planning_phase,
        planning_context=trip.planning_context or {},
        missing_slots=missing,
        ready_to_generate=False,
        itinerary_build_meta=None,
    )


@app.post("/api/trips/{trip_id}/planning/confirm", response_model=PlanningChatResponse)
def post_planning_confirm(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """Build the full itinerary after the user has confirmed the planning summary."""
    trip = _get_trip_or_404(db, trip_id)
    if trip.planning_phase != PlanningPhase.confirming.value:
        raise HTTPException(status_code=400, detail="Trip is not awaiting confirmation.")
    if trip.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Claim this trip before building the itinerary")

    missing = compute_missing_slots(trip.planning_context or {})
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    confirm_user = ChatMessage(
        trip_id=trip_id,
        role="user",
        content="Confirm and build itinerary",
    )
    db.add(confirm_user)
    db.flush()

    content, chips, build_meta, _ok = run_itinerary_generation(db, trip_id)
    db.refresh(trip)

    ai_msg = ChatMessage(
        trip_id=trip_id,
        role="assistant",
        content=content,
        chips=chips,
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)
    db.refresh(trip)

    missing_after = compute_missing_slots(trip.planning_context or {})
    return PlanningChatResponse(
        message=ChatMessageResponse(
            id=ai_msg.id,
            role=ai_msg.role,
            content=ai_msg.content,
            chips=ai_msg.chips,
            created_at=ai_msg.created_at,
        ),
        trip_updated=True,
        planning_phase=trip.planning_phase,
        planning_context=trip.planning_context or {},
        missing_slots=missing_after,
        ready_to_generate=trip.planning_phase == PlanningPhase.complete.value,
        itinerary_build_meta=build_meta,
    )


@app.patch("/api/trips/{trip_id}/claim", response_model=TripResponse)
def claim_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """Claim an anonymous trip for the authenticated user."""
    trip = _get_trip_or_404(db, trip_id)
    if trip.user_id is None:
        trip.user_id = current_user.user_id
        db.commit()
        db.refresh(trip)
        return trip
    if trip.user_id != current_user.user_id:
        raise HTTPException(status_code=409, detail="This trip was already saved to another account")
    return trip


@app.get("/api/profile", response_model=ProfileResponse)
def get_profile(current_user: AuthUser = Depends(get_current_user)):
    return _profile_from_user(current_user)


@app.patch("/api/profile", response_model=ProfileResponse)
def patch_profile(
    body: ProfileUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    admin = get_supabase_admin_client()
    incoming_metadata = {
        key: value
        for key, value in body.model_dump(exclude_unset=True).items()
        if value is not None
    }
    if incoming_metadata:
        existing = admin.auth.admin.get_user_by_id(current_user.user_id)
        existing_user = getattr(existing, "user", None)
        existing_metadata = getattr(existing_user, "user_metadata", None) if existing_user else {}
        merged_metadata = {
            **(existing_metadata if isinstance(existing_metadata, dict) else {}),
            **incoming_metadata,
        }
        admin.auth.admin.update_user_by_id(
            current_user.user_id,
            {"user_metadata": merged_metadata},
        )

    fresh = admin.auth.admin.get_user_by_id(current_user.user_id)
    user = getattr(fresh, "user", None)
    metadata = getattr(user, "user_metadata", None) if user else {}
    email = getattr(user, "email", None) if user else current_user.email
    tags = (metadata or {}).get("travel_style_tags") if isinstance(metadata, dict) else None
    return ProfileResponse(
        user_id=current_user.user_id,
        email=email,
        display_name=(metadata or {}).get("display_name") if isinstance(metadata, dict) else None,
        home_city=(metadata or {}).get("home_city") if isinstance(metadata, dict) else None,
        preferred_currency=(metadata or {}).get("preferred_currency") if isinstance(metadata, dict) else None,
        travel_style_tags=tags if isinstance(tags, list) else [],
    )


@app.post("/api/trips/{trip_id}/chat", response_model=ChatResponse)
def send_chat_message(
    trip_id: int,
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Send a chat message after the full itinerary exists (planner refinement)."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)
    if trip.planning_phase != PlanningPhase.complete.value:
        raise HTTPException(
            status_code=400,
            detail="Trip is still in planning or confirmation mode. Use POST /api/trips/{id}/planning/message instead.",
        )

    # Save user message
    user_msg = ChatMessage(
        trip_id=trip_id,
        role="user",
        content=chat_request.message
    )
    db.add(user_msg)
    db.flush()

    # Get chat history
    messages = db.query(ChatMessage).filter(ChatMessage.trip_id == trip_id).order_by(ChatMessage.created_at).all()

    # Generate AI response
    ai_response = generate_chat_response(trip, messages, chat_request.message)

    # Save AI message
    ai_msg = ChatMessage(
        trip_id=trip_id,
        role="assistant",
        content=ai_response["content"],
        chips=ai_response.get("chips")
    )
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return ChatResponse(
        message=ChatMessageResponse(
            id=ai_msg.id,
            role=ai_msg.role,
            content=ai_msg.content,
            chips=ai_msg.chips,
            created_at=ai_msg.created_at
        ),
        trip_updated=ai_response.get("trip_updated", False)
    )


@app.get("/api/trips/{trip_id}/chat", response_model=list[ChatMessageResponse])
def get_chat_history(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Get chat history for a trip."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)

    messages = db.query(ChatMessage).filter(ChatMessage.trip_id == trip_id).order_by(ChatMessage.created_at).all()
    return messages


@app.get("/api/trips/{trip_id}/itinerary", response_model=list[DayItinerary])
def get_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Get activities grouped by day."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_access(trip, current_user)

    activities = db.query(Activity).filter(Activity.trip_id == trip_id).order_by(Activity.start).all()

    # Group by day
    days_map = {}
    start_date = datetime.strptime(trip.start, "%Y-%m-%d")

    for activity in activities:
        try:
            activity_dt = datetime.fromisoformat(activity.start.replace("Z", ""))
            day_num = (activity_dt.date() - start_date.date()).days + 1
            day_date = activity_dt.strftime("%b %d")
            time_str = activity_dt.strftime("%I:%M %p").lstrip("0")
        except:
            day_num = 1
            day_date = start_date.strftime("%b %d")
            time_str = "9:00 AM"

        if day_num not in days_map:
            days_map[day_num] = {
                "day": day_num,
                "date": day_date,
                "activities": []
            }

        days_map[day_num]["activities"].append(DayActivity(
            id=activity.id,
            name=activity.title,
            time=time_str,
            cost=activity.cost,
            location=activity.location,
            category=activity.category,
            info_url=activity.info_url,
        ))

    # Sort days and return
    return [days_map[k] for k in sorted(days_map.keys())]


# --- Activity CRUD Endpoints ---

@app.put("/api/activities/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: int,
    activity_update: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Update an activity."""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    trip = _get_trip_or_404(db, activity.trip_id)
    _assert_trip_owner(trip, current_user)

    update_data = activity_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(activity, key, value)

    db.commit()
    db.refresh(activity)
    return activity


@app.delete("/api/activities/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Delete an activity."""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    trip = _get_trip_or_404(db, activity.trip_id)
    _assert_trip_owner(trip, current_user)

    db.delete(activity)
    db.commit()
    return {"message": "Activity deleted"}


@app.post("/api/trips/{trip_id}/activities", response_model=ActivityResponse)
def create_activity(
    trip_id: int,
    activity_data: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Create a new activity for a trip."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_owner(trip, current_user)

    activity = Activity(
        trip_id=trip_id,
        title=activity_data.title,
        category=activity_data.category,
        start=activity_data.start,
        duration=activity_data.duration,
        cost=activity_data.cost,
        location=activity_data.location,
        info_url=activity_data.info_url,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@app.put("/api/trips/{trip_id}/activities/reorder")
def reorder_activities(
    trip_id: int,
    reorder_request: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Reorder activities by swapping their start times."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_owner(trip, current_user)

    activity_ids = reorder_request.activity_ids

    # Fetch all activities in the order they currently exist
    activities = db.query(Activity).filter(Activity.id.in_(activity_ids)).all()
    if len(activities) != len(activity_ids):
        raise HTTPException(status_code=400, detail="Some activity IDs not found")

    # Get current start times in order
    activity_map = {a.id: a for a in activities}
    current_start_times = [activity_map[aid].start for aid in activity_ids]

    # Assign start times based on new order
    for i, aid in enumerate(activity_ids):
        activity_map[aid].start = current_start_times[i]

    db.commit()
    return {"message": "Activities reordered"}


@app.post("/api/trips/{trip_id}/activities/{activity_id}/alternatives", response_model=AlternativesResponse)
def get_alternatives(
    trip_id: int,
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser | None = Depends(get_optional_user),
):
    """Get AI-generated alternative activities."""
    trip = _get_trip_or_404(db, trip_id)
    _assert_trip_owner(trip, current_user)

    activity = db.query(Activity).filter(Activity.id == activity_id, Activity.trip_id == trip_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    if not llm_configured():
        # Fallback alternatives
        return AlternativesResponse(alternatives=[
            AlternativeActivity(
                title="Similar activity nearby",
                category=activity.category,
                cost=activity.cost * 0.9,
                location=activity.location or "Nearby",
                reason="A comparable option at a similar location"
            )
        ])

    category_guidance = {
        "hotel": "other hotels or accommodation options (hostels, vacation rentals, boutique hotels)",
        "food": "other restaurants or dining experiences of a similar cuisine style or price range",
        "cafe": "other cafés, coffee shops, or casual spots for a drink or light bite",
        "flight": "other flight options or airlines for the same route",
        "sightseeing": "other nearby attractions, landmarks, or sightseeing experiences",
        "entertainment": "other entertainment venues or activities of the same type",
        "shopping": "other shopping areas, markets, or stores",
        "transport": "other transport options for the same journey",
    }
    same_category_note = category_guidance.get(
        activity.category.value,
        f"other {activity.category.value} options"
    )

    prompt = f"""Suggest 3 alternatives to replace "{activity.title}" in {trip.title}.

Current activity:
- Category: {activity.category.value}
- Location: {activity.location}
- Cost: ${activity.cost}
- Trip budget: ${trip.budget}

IMPORTANT: All 3 alternatives MUST be {same_category_note}. Do not suggest activities from a different category.

Return JSON (no markdown):
{{
    "alternatives": [
        {{
            "title": "Activity name",
            "category": "{activity.category.value}",
            "cost": number (USD),
            "location": "Location name",
            "reason": "Brief reason why this is a good alternative"
        }}
    ]
}}

Provide 3 options at different price points or styles, but all must be the same type as the original."""

    try:
        text = complete_text(prompt)
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        result = json.loads(text)

        alternatives = []
        for alt in result.get("alternatives", []):
            try:
                category = CategoryEnum(alt.get("category", "sightseeing"))
            except ValueError:
                category = CategoryEnum.sightseeing
            alternatives.append(AlternativeActivity(
                title=alt.get("title", "Alternative activity"),
                category=category,
                cost=alt.get("cost", 0),
                location=alt.get("location", "Nearby"),
                reason=alt.get("reason", "A good alternative option")
            ))
        return AlternativesResponse(alternatives=alternatives)
    except Exception as e:
        print(f"Alternatives generation error: {e}")
        return AlternativesResponse(alternatives=[
            AlternativeActivity(
                title="Similar activity nearby",
                category=activity.category,
                cost=activity.cost * 0.9,
                location=activity.location or "Nearby",
                reason="A comparable option at a similar location"
            )
        ])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
