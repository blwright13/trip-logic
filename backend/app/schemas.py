from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


PlanKey = Literal["A", "B", "C"]


class Activity(BaseModel):
    id: str
    name: str
    time: str
    cost: float
    location: str
    category: str


class DayPlan(BaseModel):
    day: int
    date: str
    activities: List[Activity]


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "ai"]
    text: str
    chips: List[str] = Field(default_factory=list)


class TripBase(BaseModel):
    title: str
    start_date: str
    end_date: str
    travelers: int
    budget: float


class TripCreate(TripBase):
    plans: Dict[PlanKey, List[DayPlan]]
    chat_messages: List[ChatMessage] = Field(default_factory=list)


class TripUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    travelers: Optional[int] = None
    budget: Optional[float] = None
    plans: Optional[Dict[PlanKey, List[DayPlan]]] = None
    chat_messages: Optional[List[ChatMessage]] = None


class TripSummary(TripBase):
    id: int
    public_id: str

    model_config = ConfigDict(from_attributes=True)


class TripResponse(TripSummary):
    plans: Dict[PlanKey, List[DayPlan]]
    chat_messages: List[ChatMessage]

    model_config = ConfigDict(from_attributes=True)


class ItineraryResponse(BaseModel):
    trip_id: int
    plan: PlanKey
    days: List[DayPlan]


class DemoChatRequest(BaseModel):
    message: str
    destination: str
    start_date: str
    end_date: str
    budget: float
    travelers: int
    current_plan: str


class DemoChatResponse(BaseModel):
    ai_response: str
    chips: List[str]
    trip: Optional[TripResponse] = None


class TripChatRequest(BaseModel):
    message: str
    plan: PlanKey = "A"


class SwapActivitiesRequest(BaseModel):
    source_activity_id: str
    target_activity_id: str


class UserCreate(BaseModel):
    email: str
    password: str = Field(min_length=8)


class UserLogin(UserCreate):
    pass


class UserResponse(BaseModel):
    id: int
    email: str

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class ErrorResponse(BaseModel):
    detail: str
