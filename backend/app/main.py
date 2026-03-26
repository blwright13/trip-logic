from __future__ import annotations

import logging
import secrets
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .auth import hash_password, verify_password
from .config import settings
from .database import Base, engine, get_db
from .gemini import GeminiError, generate_chat_response
from .itinerary_ops import swap_day_activity_times_and_positions
from .seed_data import build_demo_trip
from .trip_agent import generate_trip_chat_response


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("triplogic.api")

app = FastAPI(title="TripLogic API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    _run_startup_migrations()


def _run_startup_migrations() -> None:
    inspector = inspect(engine)
    if "trips" not in inspector.get_table_names():
        return

    existing_trip_columns = {column["name"] for column in inspector.get_columns("trips")}
    statements: list[str] = []
    if "public_id" not in existing_trip_columns:
        statements.append("ALTER TABLE trips ADD COLUMN public_id VARCHAR(64)")
    if "owner_id" not in existing_trip_columns:
        statements.append("ALTER TABLE trips ADD COLUMN owner_id INTEGER")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

        # Preserve access to pre-auth demo data by assigning it to a stable fallback user.
        fallback_email = "demo@triplogic.local"
        fallback_user = connection.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": fallback_email},
        ).scalar()
        if fallback_user is None:
            password_hash = hash_password(secrets.token_urlsafe(16))
            connection.execute(
                text("INSERT INTO users (email, password_hash) VALUES (:email, :password_hash)"),
                {"email": fallback_email, "password_hash": password_hash},
            )
            fallback_user = connection.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": fallback_email},
            ).scalar()

        trip_ids = connection.execute(
            text("SELECT id FROM trips WHERE public_id IS NULL"),
        ).scalars()
        for trip_id in trip_ids:
            connection.execute(
                text("UPDATE trips SET public_id = :public_id WHERE id = :trip_id"),
                {"public_id": str(uuid.uuid4()), "trip_id": trip_id},
            )
        connection.execute(
            text("UPDATE trips SET owner_id = :owner_id WHERE owner_id IS NULL"),
            {"owner_id": fallback_user},
        )


def _gemini_error_response(exc: GeminiError) -> HTTPException:
    status_code = 429 if exc.status_code == 429 else 502
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(status_code=status_code, detail=str(exc), headers=headers)


def serialize_trip(trip: models.Trip) -> schemas.TripResponse:
    return schemas.TripResponse.model_validate(trip, from_attributes=True)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    session = crud.get_session(db, token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    return session.user


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=schemas.AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
) -> schemas.AuthResponse:
    existing = crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists for that email")
    user = crud.create_user(db, payload.email, hash_password(payload.password))
    session = crud.create_session(db, user.id)
    return schemas.AuthResponse(token=session.token, user=schemas.UserResponse.model_validate(user))


@app.post("/api/auth/login", response_model=schemas.AuthResponse)
def login(
    payload: schemas.UserLogin,
    db: Session = Depends(get_db),
) -> schemas.AuthResponse:
    user = crud.get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    session = crud.create_session(db, user.id)
    return schemas.AuthResponse(token=session.token, user=schemas.UserResponse.model_validate(user))


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)) -> schemas.UserResponse:
    return schemas.UserResponse.model_validate(current_user)


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    if authorization and authorization.startswith("Bearer "):
        crud.delete_session(db, authorization.removeprefix("Bearer ").strip())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/trips", response_model=list[schemas.TripSummary])
def list_trips(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[schemas.TripSummary]:
    trips = crud.list_trips(db, current_user.id)
    if not trips:
        trips = [crud.create_trip(db, current_user.id, build_demo_trip())]
    return [schemas.TripSummary.model_validate(trip, from_attributes=True) for trip in trips]


@app.post("/api/trips", response_model=schemas.TripResponse, status_code=status.HTTP_201_CREATED)
def create_trip(
    trip: schemas.TripCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.TripResponse:
    return serialize_trip(crud.create_trip(db, current_user.id, trip))


@app.get("/api/trips/{public_id}", response_model=schemas.TripResponse)
def get_trip(
    public_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.TripResponse:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return serialize_trip(trip)


@app.patch("/api/trips/{public_id}", response_model=schemas.TripResponse)
def update_trip(
    public_id: str,
    update: schemas.TripUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.TripResponse:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return serialize_trip(crud.update_trip(db, trip, update))


@app.delete("/api/trips/{public_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    public_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    crud.delete_trip(db, trip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/trips/{public_id}/itinerary", response_model=schemas.ItineraryResponse)
def get_itinerary(
    public_id: str,
    plan: schemas.PlanKey = "A",
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.ItineraryResponse:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    days = trip.plans.get(plan)
    if days is None:
        raise HTTPException(status_code=400, detail="Plan not found")
    return schemas.ItineraryResponse(trip_id=trip.id, plan=plan, days=days)


@app.post("/api/trips/{public_id}/plans/{plan}/days/{day_number}/swap", response_model=schemas.TripResponse)
def swap_day_activities(
    public_id: str,
    plan: schemas.PlanKey,
    day_number: int,
    payload: schemas.SwapActivitiesRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.TripResponse:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        updated_plans, _ = swap_day_activity_times_and_positions(
            trip.plans,
            plan=plan,
            day_number=day_number,
            source_activity_id=payload.source_activity_id,
            target_activity_id=payload.target_activity_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return serialize_trip(crud.update_trip(db, trip, schemas.TripUpdate(plans=updated_plans)))


@app.post("/api/demo-chat", response_model=schemas.DemoChatResponse)
async def demo_chat(request: schemas.DemoChatRequest) -> schemas.DemoChatResponse:
    prompt = (
        "You are a friendly, knowledgeable trip planning assistant. "
        f"The user is planning a trip to {request.destination} from {request.start_date} "
        f"to {request.end_date} with a budget of ${request.budget} for {request.travelers} people. "
        f"Their current itinerary: {request.current_plan}. The user said: {request.message}. "
        "Provide a helpful, concise response (2-3 sentences max)."
    )
    try:
        result = await generate_chat_response(prompt)
    except GeminiError as exc:
        logger.exception(
            "DemoChat failed",
            extra={
                "destination": request.destination,
                "start_date": request.start_date,
                "end_date": request.end_date,
                "budget": request.budget,
                "travelers": request.travelers,
            },
        )
        raise _gemini_error_response(exc) from exc

    return schemas.DemoChatResponse(ai_response=str(result["response"]), chips=list(result["chips"]))


@app.post("/api/trips/{public_id}/chat", response_model=schemas.DemoChatResponse)
async def chat_with_trip(
    public_id: str,
    request: schemas.TripChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.DemoChatResponse:
    trip = crud.get_trip_by_public_id(db, public_id, current_user.id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        result = await generate_trip_chat_response(
            trip=trip,
            message=request.message,
            selected_plan=request.plan,
        )
    except GeminiError as exc:
        logger.exception("Trip chat failed for trip_public_id=%s", public_id)
        raise _gemini_error_response(exc) from exc

    user_message = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "text": request.message,
        "chips": [],
    }
    ai_message = {
        "id": str(uuid.uuid4()),
        "role": "ai",
        "text": result.response,
        "chips": result.chips,
    }
    if result.updated_plans is not None:
        trip.plans = result.updated_plans
    trip.chat_messages = [*trip.chat_messages, user_message, ai_message]
    updated_trip = crud.update_trip(
        db,
        trip,
        schemas.TripUpdate(plans=trip.plans, chat_messages=trip.chat_messages),
    )
    return schemas.DemoChatResponse(
        ai_response=ai_message["text"],
        chips=ai_message["chips"],
        trip=serialize_trip(updated_trip),
    )
