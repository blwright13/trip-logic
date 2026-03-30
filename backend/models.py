from datetime import datetime
from enum import Enum
from typing import Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from pydantic import BaseModel

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

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    start = Column(String, nullable=False)  # Date string e.g., "2026-04-10"
    end = Column(String, nullable=False)
    num_people = Column(Integer, default=1)
    budget = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

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

    trip = relationship("Trip", back_populates="activities")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(String, nullable=False)
    chips = Column(JSON, nullable=True)  # List of suggestion chips
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

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    chips: Optional[list[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    message: ChatMessageResponse
    trip_updated: bool = False


class DayActivity(BaseModel):
    id: int
    name: str
    time: str
    cost: float
    location: Optional[str]
    category: CategoryEnum


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


class ActivityCreate(BaseModel):
    title: str
    category: CategoryEnum
    start: str
    duration: int = 60
    cost: float = 0
    location: Optional[str] = None


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
