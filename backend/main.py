import os
import json
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db, create_tables
from llm import complete_text, llm_configured
from models import (
    Trip, Activity, ChatMessage, CategoryEnum, PlanningPhase,
    TripCreate, TripUpdate, TripResponse, ActivityResponse,
    ChatRequest, ChatResponse, ChatMessageResponse, PlanningChatResponse,
    DayItinerary, DayActivity,
    ActivityUpdate, ActivityCreate, ReorderRequest, AlternativeActivity, AlternativesResponse,
    PlanningContextPatch, TasteSignalsBody,
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
def create_trip(trip_request: TripCreate, db: Session = Depends(get_db)):
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
    )
    db.add(trip)
    db.flush()

    ctx = seed_planning_context_from_initial_request(trip_request.request)
    apply_planning_context_to_trip(trip, ctx)

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
def list_trips(db: Session = Depends(get_db)):
    """List all trips."""
    trips = db.query(Trip).order_by(Trip.created_at.desc()).all()
    return trips


@app.get("/api/trips/{trip_id}", response_model=TripResponse)
def get_trip(trip_id: int, db: Session = Depends(get_db)):
    """Get a single trip with activities."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.put("/api/trips/{trip_id}", response_model=TripResponse)
def update_trip(trip_id: int, trip_update: TripUpdate, db: Session = Depends(get_db)):
    """Update trip metadata."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    update_data = trip_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(trip, key, value)

    db.commit()
    db.refresh(trip)
    return trip


@app.delete("/api/trips/{trip_id}")
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    """Delete a trip and all related data."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    db.delete(trip)
    db.commit()
    return {"message": "Trip deleted"}


@app.post("/api/trips/{trip_id}/planning/message", response_model=PlanningChatResponse)
def send_planning_message(trip_id: int, chat_request: ChatRequest, db: Session = Depends(get_db)):
    """Planning chat (gathering or confirming): merge context, taste/confirm flow, or generate on confirm chip."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.planning_phase not in (PlanningPhase.gathering.value, PlanningPhase.confirming.value):
        raise HTTPException(
            status_code=400,
            detail="Trip is not in planning mode; use /chat when itinerary is complete.",
        )

    # Explicit confirm while reviewing — run itinerary generation (same as POST .../planning/confirm)
    if trip.planning_phase == PlanningPhase.confirming.value and chat_request.message.strip() in CONFIRM_CHIPS:
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
def patch_planning_context(trip_id: int, body: PlanningContextPatch, db: Session = Depends(get_db)):
    """Merge partial JSON into trip.planning_context while gathering or confirming."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.planning_phase not in (PlanningPhase.gathering.value, PlanningPhase.confirming.value):
        raise HTTPException(status_code=400, detail="Trip is not in a planning phase that allows edits.")

    prior = dict(trip.planning_context or {})
    merged = merge_planning_context_patch(prior, body.planning_context)
    apply_planning_context_to_trip(trip, merged)
    db.commit()
    db.refresh(trip)
    return trip


@app.get("/api/trips/{trip_id}/planning/taste-suggestions")
def get_planning_taste_suggestions(trip_id: int, db: Session = Depends(get_db)):
    """Return mixed Google Places suggestions for taste calibration (requires API key)."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
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
    return {"suggestions": suggestions, "configured": True}


@app.post("/api/trips/{trip_id}/planning/taste-signals", response_model=PlanningChatResponse)
def post_planning_taste_signals(trip_id: int, body: TasteSignalsBody, db: Session = Depends(get_db)):
    """Save like/dislike signals (or skip), then emit confirmation summary and move to confirming phase."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
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
def post_planning_confirm(trip_id: int, db: Session = Depends(get_db)):
    """Build the full itinerary after the user has confirmed the planning summary."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.planning_phase != PlanningPhase.confirming.value:
        raise HTTPException(status_code=400, detail="Trip is not awaiting confirmation.")

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


@app.post("/api/trips/{trip_id}/chat", response_model=ChatResponse)
def send_chat_message(trip_id: int, chat_request: ChatRequest, db: Session = Depends(get_db)):
    """Send a chat message after the full itinerary exists (planner refinement)."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
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
def get_chat_history(trip_id: int, db: Session = Depends(get_db)):
    """Get chat history for a trip."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    messages = db.query(ChatMessage).filter(ChatMessage.trip_id == trip_id).order_by(ChatMessage.created_at).all()
    return messages


@app.get("/api/trips/{trip_id}/itinerary", response_model=list[DayItinerary])
def get_itinerary(trip_id: int, db: Session = Depends(get_db)):
    """Get activities grouped by day."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

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
def update_activity(activity_id: int, activity_update: ActivityUpdate, db: Session = Depends(get_db)):
    """Update an activity."""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    update_data = activity_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(activity, key, value)

    db.commit()
    db.refresh(activity)
    return activity


@app.delete("/api/activities/{activity_id}")
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    """Delete an activity."""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    db.delete(activity)
    db.commit()
    return {"message": "Activity deleted"}


@app.post("/api/trips/{trip_id}/activities", response_model=ActivityResponse)
def create_activity(trip_id: int, activity_data: ActivityCreate, db: Session = Depends(get_db)):
    """Create a new activity for a trip."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

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
def reorder_activities(trip_id: int, reorder_request: ReorderRequest, db: Session = Depends(get_db)):
    """Reorder activities by swapping their start times."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

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
def get_alternatives(trip_id: int, activity_id: int, db: Session = Depends(get_db)):
    """Get AI-generated alternative activities."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

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

    prompt = f"""Suggest 3 alternative activities to replace "{activity.title}" in {trip.title}.

Current activity details:
- Category: {activity.category.value}
- Location: {activity.location}
- Cost: ${activity.cost}
- Trip budget: ${trip.budget}

Return JSON (no markdown):
{{
    "alternatives": [
        {{
            "title": "Activity name",
            "category": "one of: flight, hotel, food, sightseeing, entertainment, cafe, shopping, transport",
            "cost": number (USD),
            "location": "Location name",
            "reason": "Brief reason why this is a good alternative"
        }}
    ]
}}

Provide diverse options: one similar, one cheaper, one more unique/interesting."""

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
