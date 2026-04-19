from datetime import datetime
from enum import Enum
from typing import Any, Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Enum as SQLEnum, Text
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field

from database import Base


class CategoryEnum(str, Enum):
    flight = "flight"
    hotel = "hotel"
    food = "food"
    sightseeing = "sightseeing"
    entertainment = "entertainment"
    cafe = "cafe"
    shopping = "shopping"
    transport = "transport"


# SQLAlchemy Models

class PlanningPhase(str, Enum):
    gathering = "gathering"
    confirming = "confirming"
    generating = "generating"
    complete = "complete"


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    start = Column(String, nullable=False)  # Date string e.g., "2026-04-10"
    end = Column(String, nullable=False)
    num_people = Column(Integer, default=1)
    budget = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    planning_phase = Column(String, nullable=False, default=PlanningPhase.gathering.value)
    planning_context = Column(JSON, nullable=False, default=lambda: {})
    initial_request = Column(Text, nullable=True)
    user_id = Column(String, nullable=True)  # Supabase user UUID

    activities = relationship("Activity", back_populates="trip", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="trip", cascade="all, delete-orphan")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    category = Column(SQLEnum(CategoryEnum), nullable=False)
    start = Column(String, nullable=False)  # DateTime string e.g., "2026-04-10T10:00:00"
    duration = Column(Integer, default=60)  # Duration in minutes
    cost = Column(Float, default=0)
    location = Column(String, nullable=True)
    info_url = Column(String, nullable=True)  # Google Maps / website or flight search link

    trip = relationship("Trip", back_populates="activities")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(String, nullable=False)
    chips = Column(JSON, nullable=True)  # List of suggestion chips
    flight_options = Column(JSON, nullable=True)
    cards = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    trip = relationship("Trip", back_populates="messages")


# Pydantic Schemas

class TripCreate(BaseModel):
    request: str  # Natural language request like "5 days in Tokyo"


class TripUpdate(BaseModel):
    title: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    num_people: Optional[int] = None
    budget: Optional[float] = None


class ActivityResponse(BaseModel):
    id: int
    title: str
    category: CategoryEnum
    start: str
    duration: int
    cost: float
    location: Optional[str]
    info_url: Optional[str] = None

    class Config:
        from_attributes = True


class TripResponse(BaseModel):
    id: int
    title: str
    start: str
    end: str
    num_people: int
    budget: float
    created_at: datetime
    activities: list[ActivityResponse] = []
    planning_phase: str = PlanningPhase.gathering.value
    planning_context: dict[str, Any] = Field(default_factory=dict)
    initial_request: Optional[str] = None

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    class FlightOption(BaseModel):
        airline: str
        flight_number: Optional[str] = None
        departure_time: str
        arrival_time: str
        departure_airport: Optional[str] = None
        arrival_airport: Optional[str] = None
        duration_minutes: Optional[int] = None
        stops: Optional[int] = None
        price_usd: Optional[float] = None
        booking_url: Optional[str] = None
        tag: Optional[str] = None
        apply_mode: Optional[str] = None
        replace_activity_id: Optional[int] = None
        replace_category: Optional[str] = None
        target_date: Optional[str] = None

    class SuggestionCard(BaseModel):
        type: str
        title: str
        image_url: Optional[str] = None
        description: Optional[str] = None
        rating: Optional[float] = None
        estimated_price: Optional[str] = None
        estimated_cost: Optional[float] = None
        url: Optional[str] = None
        location: Optional[str] = None
        fit_reason: Optional[str] = None
        apply_mode: Optional[str] = None
        replace_activity_id: Optional[int] = None
        replace_category: Optional[str] = None
        target_date: Optional[str] = None

    id: int
    role: str
    content: str
    chips: Optional[list[str]] = None
    flight_options: Optional[list[FlightOption]] = None
    cards: Optional[list[SuggestionCard]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    message: ChatMessageResponse
    trip_updated: bool = False


class PlanningChatResponse(BaseModel):
    message: ChatMessageResponse
    trip_updated: bool = True
    planning_phase: str
    planning_context: dict[str, Any]
    missing_slots: list[str] = []
    ready_to_generate: bool = False
    itinerary_build_meta: Optional[dict[str, Any]] = Field(
        default=None,
        description="Populated when this request ran full itinerary generation (tool loop + parse).",
    )


class PlanningContextPatch(BaseModel):
    """Partial merge into trip.planning_context (gathering or confirming phase)."""

    planning_context: dict[str, Any]


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    home_city: Optional[str] = None
    preferred_currency: Optional[str] = None
    travel_style_tags: Optional[list[str]] = None


class ProfileResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    home_city: Optional[str] = None
    preferred_currency: Optional[str] = None
    travel_style_tags: list[str] = Field(default_factory=list)


class TasteSignalsBody(BaseModel):
    liked: list[dict[str, Any]] = Field(default_factory=list)
    disliked: list[dict[str, Any]] = Field(default_factory=list)
    skip: bool = False


class DayActivity(BaseModel):
    id: int
    name: str
    time: str
    cost: float
    location: Optional[str]
    category: CategoryEnum
    info_url: Optional[str] = None


class DayItinerary(BaseModel):
    day: int
    date: str
    activities: list[DayActivity]


# Activity CRUD Schemas

class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[CategoryEnum] = None
    start: Optional[str] = None
    duration: Optional[int] = None
    cost: Optional[float] = None
    location: Optional[str] = None
    info_url: Optional[str] = None


class ActivityCreate(BaseModel):
    title: str
    category: CategoryEnum
    start: str
    duration: int = 60
    cost: float = 0
    location: Optional[str] = None
    info_url: Optional[str] = None


class ReorderRequest(BaseModel):
    activity_ids: list[int]


class AlternativeActivity(BaseModel):
    title: str
    category: CategoryEnum
    cost: float
    location: str
    reason: str


class AlternativesResponse(BaseModel):
    alternatives: list[AlternativeActivity]
