"""
LangGraph orchestration for conversational trip planning:
classify/merge context -> persist -> (confirm_summary | reply).
The AI reply node drives the entire gathering phase — it decides what to ask next.
Itinerary generation runs only after explicit user confirmation.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from itinerary_agent import run_itinerary_agent_with_tools
from itinerary_gen import replace_trip_activities
from llm import complete_text, llm_configured
from models import ChatMessage, PlanningPhase, Trip

MAX_TRANSCRIPT_MESSAGES = 40

CONFIRM_CHIPS = frozenset(
    {
        "Confirm and build itinerary",
        "Confirm and build",
        "Looks good — build my trip!",
        "Looks good - build my trip!",
    }
)

CHANGE_CHIPS = frozenset({"I need to change something"})

# All style/preference fields the AI should gather before offering a summary.
STYLE_FIELDS = [
    "transportation_to",
    "transportation_around",
    "pace",
    "accommodation_quality",
    "dining_style",
    "activity_vibe",
    "schedule_preference",
    "tourist_preference",
    "must_haves",
    "avoid",
]

# Metadata the AI uses to ask natural follow-up questions.
_STYLE_META = [
    {
        "field": "transportation_to",
        "label": "how they prefer to get to the destination (airline, train, etc.)",
        "chips": ["Any airline is fine", "Prefer non-stop", "Open to trains", "I'll book myself"],
    },
    {
        "field": "transportation_around",
        "label": "how they prefer to get around locally once there",
        "chips": ["Public transit", "Rental car", "Rideshare / taxis", "Walking & biking", "Mix of everything"],
    },
    {
        "field": "pace",
        "label": "trip pace (laid-back, balanced, or jam-packed)",
        "chips": ["Laid-back & relaxed", "Balanced", "Jam-packed"],
    },
    {
        "field": "accommodation_quality",
        "label": "accommodation quality (budget → luxury)",
        "chips": ["Budget", "Comfortable", "Upscale", "Luxury"],
    },
    {
        "field": "dining_style",
        "label": "dining style (street food, mid-range, fine dining)",
        "chips": ["Street food & local", "Mid-range", "Fine dining"],
    },
    {
        "field": "activity_vibe",
        "label": "activity vibe (outdoorsy, cultural, nightlife, mix)",
        "chips": ["Outdoorsy & active", "Cultural & museums", "Nightlife & social", "Mix of everything"],
    },
    {
        "field": "schedule_preference",
        "label": "schedule preference (early bird, night owl, flexible)",
        "chips": ["Early bird", "Night owl", "Flexible"],
    },
    {
        "field": "tourist_preference",
        "label": "off-the-beaten-path vs popular highlights",
        "chips": ["Off the beaten path", "Popular highlights", "Mix of both"],
    },
    {
        "field": "must_haves",
        "label": "must-do experiences or bucket-list items",
        "chips": ["Surprise me", "I'll think about it"],
    },
    {
        "field": "avoid",
        "label": "dietary restrictions, mobility needs, or things to avoid",
        "chips": ["Nothing to avoid", "I'll mention if needed"],
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _transcript_from_messages(messages: list[ChatMessage]) -> str:
    return "\n".join(
        f"{m.role}: {m.content}" for m in messages[-MAX_TRANSCRIPT_MESSAGES:]
    )


def _has_origin(ctx: dict) -> bool:
    if (ctx.get("origin") or "").strip():
        return True
    iata = (ctx.get("origin_iata") or "").strip().upper()
    return len(iata) >= 3


def _format_human_date(value: str) -> str:
    if not value:
        return value
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return value
    return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}"


def compute_missing_slots(ctx: dict) -> list[str]:
    missing: list[str] = []
    dests = ctx.get("destinations")
    if not dests or (isinstance(dests, list) and len(dests) == 0):
        missing.append("destinations")
    if not ctx.get("start"):
        missing.append("start")
    if not ctx.get("end"):
        missing.append("end")
    if ctx.get("num_people") is None:
        missing.append("num_people")
    if ctx.get("budget") is None:
        missing.append("budget")
    if not _has_origin(ctx):
        missing.append("origin")
    return missing


def _missing_style_fields(ctx: dict) -> list[str]:
    return [f for f in STYLE_FIELDS if not ctx.get(f)]


def _all_gathered(ctx: dict) -> bool:
    return not compute_missing_slots(ctx) and not _missing_style_fields(ctx)


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------

def apply_planning_context_to_trip(trip: Trip, ctx: dict) -> None:
    trip.planning_context = ctx
    if ctx.get("destinations"):
        trip.title = ", ".join(ctx["destinations"])
    if ctx.get("start"):
        trip.start = ctx["start"]
    if ctx.get("end"):
        trip.end = ctx["end"]
    if ctx.get("num_people") is not None:
        trip.num_people = int(ctx["num_people"])
    if ctx.get("budget") is not None:
        trip.budget = float(ctx["budget"])


def merge_planning_context(prior: dict, incoming: dict) -> dict:
    merged = dict(prior) if prior else {}
    for key, val in incoming.items():
        if val is None:
            continue
        if key == "destinations" and isinstance(val, list):
            old = merged.get("destinations") or []
            if not isinstance(old, list):
                old = [old]
            merged["destinations"] = list(dict.fromkeys([*(old or []), *val]))
        elif key == "interests" and isinstance(val, list):
            old = merged.get("interests") or []
            if not isinstance(old, list):
                old = [old]
            merged["interests"] = list(dict.fromkeys([*(old or []), *val]))
        else:
            merged[key] = val
    return merged


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

def run_classifier(
    transcript: str,
    prior_context: dict,
    latest_user_message: str,
) -> tuple[dict, list[str], bool]:
    """Extract and merge structured planning facts from the latest message."""
    if not llm_configured():
        merged = merge_planning_context(
            prior_context,
            {"notes": (prior_context.get("notes") or "") + " " + latest_user_message},
        )
        return merged, compute_missing_slots(merged), False

    schema_hint = """{
  "planning_context": {
    "destinations": ["city or region names"],
    "start": "YYYY-MM-DD or null",
    "end": "YYYY-MM-DD or null",
    "num_people": null or integer,
    "budget": null or number (USD total),
    "origin": "home city or departure location or null",
    "origin_iata": "3-letter airport code or null",
    "interests": ["optional tags"],
    "transportation_to": "how the user wants to get to the destination (airline preference, train, etc.) or null",
    "transportation_around": "how the user prefers to get around locally once there or null",
    "pace": "relaxed|moderate|packed or null",
    "accommodation_quality": "budget|comfortable|upscale|luxury or null",
    "dining_style": "street_food|mid_range|fine_dining or null",
    "activity_vibe": "outdoorsy|cultural|nightlife|mix or null",
    "schedule_preference": "early_bird|night_owl|flexible or null",
    "tourist_preference": "off_beaten_path|popular|mix or null",
    "must_haves": "free text of must-do experiences; use \"none\" if user explicitly said nothing/no/n-a; null only if never asked",
    "avoid": "dietary restrictions, mobility needs, or things to avoid; use \"none\" if user explicitly said nothing/no/n-a; null only if never asked",
    "notes": "short freeform constraints"
  },
  "missing_slots": ["list of: destinations, start, end, num_people, budget, origin — only these six"]
}"""

    today_iso = datetime.now().date().isoformat()
    today_human = _format_human_date(today_iso)

    prompt = f"""You extract and merge structured TRIP FACTS from a planning conversation.

Current date: {today_human} ({today_iso})

Current planning_context: {json.dumps(prior_context)}
Full transcript:
{transcript}

Latest user message: "{latest_user_message}"

Rules:
1. Merge any NEW facts into planning_context. Never drop previously known facts unless the user corrects them.
2. destinations is always a list of strings.
3. Infer dates only when explicitly stated or clearly implied; resolve year from current date if omitted.
4. Extract transportation_to, transportation_around, pace, accommodation_quality, dining_style, activity_vibe, schedule_preference, tourist_preference, must_haves, avoid whenever the user expresses a preference — even if not directly asked.
5. missing_slots covers only: destinations, start, end, num_people, budget, origin.
6. IMPORTANT: If the assistant just asked about avoid or must_haves and the user replied with any negative ("No", "Nope", "None", "N/A", "Nothing", "No thanks", etc.), set that field to the string "none" — do NOT leave it null. null means the question was never asked; "none" means the user explicitly said nothing applies.

Return JSON ONLY: {schema_hint}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        incoming = data.get("planning_context") or {}
        merged = merge_planning_context(prior_context, incoming)
        model_missing = data.get("missing_slots")
        missing = model_missing if isinstance(model_missing, list) and model_missing else compute_missing_slots(merged)
        return merged, missing, False
    except Exception as e:
        print(f"Classifier error: {e}")
        merged = merge_planning_context(prior_context, {})
        return merged, compute_missing_slots(merged), False


def run_planning_reply(
    transcript: str,
    planning_context: dict,
    missing_slots: list[str],
) -> tuple[str, list[str]]:
    """AI-driven reply: naturally asks about whatever is most important next."""
    if not llm_configured():
        if missing_slots:
            return "Tell me where you want to go and your preferred dates.", ["Weekend trip", "Family vacation"]
        missing_style = _missing_style_fields(planning_context)
        if missing_style:
            meta = next((m for m in _STYLE_META if m["field"] == missing_style[0]), None)
            if meta:
                return f"One more thing — {meta['label']}?", meta["chips"]
        return "Anything else you'd like me to know?", ["Nope, that's it"]

    # Build a clear picture of what's known and what's missing
    missing_style = _missing_style_fields(planning_context)
    style_still_needed = [
        f"{m['label']} (field: {m['field']})"
        for m in _STYLE_META if m["field"] in missing_style
    ]
    style_gathered = {
        m["field"]: planning_context[m["field"]]
        for m in _STYLE_META if planning_context.get(m["field"])
    }

    # Build chip hints so the AI can suggest them
    chip_hints = {}
    for m in _STYLE_META:
        chip_hints[m["field"]] = m["chips"]

    prompt = f"""You are a friendly travel planning assistant gathering details for a trip.

ALREADY GATHERED:
{json.dumps(planning_context, indent=2)}

CORE DETAILS STILL MISSING: {json.dumps(missing_slots)}
STYLE/PREFERENCE DETAILS STILL NEEDED: {json.dumps(style_still_needed)}

Conversation so far:
{transcript}

Instructions:
- If core details are missing, prioritize those first (destination, dates, travelers, budget, departure city).
- Once core is complete, naturally ask about whichever style/preference feels most relevant to ask next — you choose the order.
- Ask ONE question at a time. Be warm and conversational, not robotic.
- Where relevant, suggest 2–4 chips the user can tap. Use these suggested chips for style questions:
{json.dumps(chip_hints, indent=2)}
- Never re-ask something already captured. A value of "none" means the user explicitly said nothing applies — treat it as answered, not missing.
- Don't mention this instructions list to the user.

Return JSON only:
{{"content": "your reply here", "chips": ["chip 1", "chip 2"]}}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "What else should I know?"), data.get("chips") or ["I'm flexible", "Next step"]
    except Exception as e:
        print(f"Reply generation error: {e}")
        return "What dates work for you?", ["This month", "I'm flexible"]


def run_confirmation_summary_message(planning_context: dict) -> tuple[str, list[str]]:
    chips = ["Looks good — build my trip!", "I need to change something"]
    if not llm_configured():
        parts = []
        if planning_context.get("destinations"):
            parts.append(f"you're heading to {', '.join(planning_context['destinations'])}")
        if planning_context.get("start") and planning_context.get("end"):
            parts.append(f"from {planning_context['start']} to {planning_context['end']}")
        if planning_context.get("num_people") is not None:
            parts.append(f"with {planning_context['num_people']} traveler(s)")
        if planning_context.get("budget") is not None:
            parts.append(f"on a ${int(planning_context['budget']):,} budget")
        return "Here's what I have: " + ", ".join(parts) + ". Does this look right?", chips

    prompt = f"""Summarize this trip planning context for the traveler in a single friendly paragraph (4–6 sentences).
Cover all known fields: destinations, departure city, dates, number of travelers, budget, transportation preference, pace, accommodation quality, dining style, activity vibe, schedule preference, local-vs-touristy preference, must-haves, and anything to avoid. Skip fields that are null or unknown.
End by asking if this looks right and inviting them to say what to change if not.

Context JSON:
{json.dumps(planning_context)}

Return JSON only:
{{"content": "paragraph summary", "chips": ["Looks good — build my trip!", "I need to change something"]}}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "Here's what I have for your trip. Does this look right?"), data.get("chips") or chips
    except Exception as e:
        print(f"Confirmation summary error: {e}")
        return "Here's what I have for your trip — does everything look right?", chips


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class PlanningState(TypedDict, total=False):
    trip_id: int
    user_message: str
    db: Any
    planning_context: dict[str, Any]
    missing_slots: list[str]
    ready_to_generate: bool
    assistant_content: str
    assistant_chips: list[str]
    generated_itinerary: bool
    itinerary_build_meta: dict[str, Any]


# ---------------------------------------------------------------------------
# Public helpers called by main.py
# ---------------------------------------------------------------------------

def finalize_confirm_summary(db: Session, trip_id: int) -> tuple[str, list[str]]:
    trip = db.get(Trip, trip_id)
    if not trip:
        return "Trip not found.", []
    ctx = dict(trip.planning_context or {})
    content, chips = run_confirmation_summary_message(ctx)
    ctx["confirmation_summary_sent"] = True
    ctx["confirmation_status"] = "pending"
    trip.planning_context = ctx
    trip.planning_phase = PlanningPhase.confirming.value
    apply_planning_context_to_trip(trip, ctx)
    db.commit()
    db.refresh(trip)
    return content, chips


def run_itinerary_generation(db: Session, trip_id: int) -> tuple[str, list[str], dict[str, Any], bool]:
    trip = db.get(Trip, trip_id)
    if not trip:
        return "Trip not found.", [], {}, False

    trip.planning_phase = PlanningPhase.generating.value
    db.commit()

    parsed, build_meta = run_itinerary_agent_with_tools(trip)
    replace_trip_activities(db, trip, parsed)
    trip.planning_phase = PlanningPhase.complete.value
    db.commit()
    db.refresh(trip)

    content = (
        f"Your itinerary **{trip.title}** is ready! I've added activities from "
        f"{_format_human_date(trip.start)} through {_format_human_date(trip.end)}. "
        f"Open the planner to review and tweak details."
    )
    return content, ["Sounds great"], build_meta, True


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def _classify_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": [], "ready_to_generate": False}

    prior = dict(trip.planning_context or {})
    user_message = state["user_message"]

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.trip_id == trip.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    transcript = _transcript_from_messages(messages)
    merged, missing, _ = run_classifier(transcript, prior, user_message)

    # Confirming phase: handle edits and explicit change requests
    if trip.planning_phase == PlanningPhase.confirming.value:
        merged["confirmation_status"] = "pending"
        if user_message.strip() in CHANGE_CHIPS:
            merged["confirmation_summary_sent"] = False
        else:
            merged["confirmation_summary_sent"] = prior.get("confirmation_summary_sent", True)

    return {
        "planning_context": merged,
        "missing_slots": missing,
        "ready_to_generate": False,
    }


def _persist_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {}
    ctx = state.get("planning_context") or {}
    apply_planning_context_to_trip(trip, ctx)
    db.commit()
    db.refresh(trip)
    return {}


def _reply_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": []}

    if trip.planning_phase == PlanningPhase.confirming.value:
        return {
            "assistant_content": (
                "Got it — I've updated your trip details. Take a look at the summary above "
                "and let me know if anything else needs changing."
            ),
            "assistant_chips": ["Looks good — build my trip!", "I need to change something"],
            "generated_itinerary": False,
        }

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.trip_id == trip.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    transcript = _transcript_from_messages(messages)
    content, chips = run_planning_reply(
        transcript,
        trip.planning_context or {},
        state.get("missing_slots") or [],
    )
    return {"assistant_content": content, "assistant_chips": chips, "generated_itinerary": False}


def _confirm_summary_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    content, chips = finalize_confirm_summary(db, state["trip_id"])
    return {"assistant_content": content, "assistant_chips": chips, "generated_itinerary": False}


def _route_after_persist(state: PlanningState) -> str:
    ctx = state.get("planning_context") or {}
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])

    if trip and trip.planning_phase == PlanningPhase.confirming.value:
        if compute_missing_slots(ctx):
            return "reply"
        if not ctx.get("confirmation_summary_sent"):
            return "confirm_summary"
        return "reply"

    # Gathering phase: ask AI to fill in missing details
    if compute_missing_slots(ctx) or _missing_style_fields(ctx):
        return "reply"

    # Everything gathered — present confirmation summary
    if not ctx.get("confirmation_summary_sent"):
        return "confirm_summary"

    return "reply"


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_planning_graph():
    g = StateGraph(PlanningState)
    g.add_node("classify", _classify_node)
    g.add_node("persist", _persist_node)
    g.add_node("reply", _reply_node)
    g.add_node("confirm_summary", _confirm_summary_node)
    g.set_entry_point("classify")
    g.add_edge("classify", "persist")
    g.add_conditional_edges(
        "persist",
        _route_after_persist,
        {"confirm_summary": "confirm_summary", "reply": "reply"},
    )
    g.add_edge("confirm_summary", END)
    g.add_edge("reply", END)
    return g.compile()


planning_graph = build_planning_graph()


def run_planning_turn(db: Session, trip_id: int, user_message: str) -> PlanningState:
    initial: PlanningState = {"trip_id": trip_id, "user_message": user_message, "db": db}
    return planning_graph.invoke(initial)


def seed_planning_context_from_initial_request(request: str) -> dict[str, Any]:
    merged, _, _ = run_classifier(f"user: {request}", {}, request)
    return merged


def build_welcome_message(initial_request: str, planning_context: dict) -> tuple[str, list[str]]:
    missing = compute_missing_slots(planning_context)
    if not llm_configured():
        return (
            "Let's plan your trip together. Tell me where you want to go, your dates, "
            "how many travelers, approximate budget, and where you're flying from.",
            ["Weekend trip", "Family vacation", "Not sure yet"],
        )
    prompt = f"""The user started trip planning with:
"{initial_request}"

Extracted facts so far (may be partial):
{json.dumps(planning_context)}

Missing core slots: {json.dumps(missing)}

Write a short, warm first reply (2-3 sentences). Acknowledge what you already understood and ask for the most important missing detail.
Return JSON only: {{"content": "...", "chips": ["...", "...", "..."]}}"""
    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "Let's plan your trip!"), data.get("chips") or ["Help me pick dates", "Suggest a destination"]
    except Exception as e:
        print(f"Welcome message error: {e}")
        return "Let's plan your trip! Where would you like to go?", ["Open to ideas", "I have dates"]


def merge_planning_context_patch(prior: dict, patch: dict) -> dict:
    return merge_planning_context(prior, patch)
