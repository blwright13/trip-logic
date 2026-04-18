"""
LangGraph orchestration for conversational trip planning:
classify/merge context -> persist -> (prompt_extra | taste_intro | confirm_summary | reply).
Itinerary generation runs only after explicit confirmation (see run_itinerary_generation).
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from itinerary_agent import run_itinerary_agent_with_tools
from itinerary_gen import replace_trip_activities
from integrations.google_places import configured as places_configured
from llm import complete_text, llm_configured
from models import ChatMessage, PlanningPhase, Trip

# Keep enough history for multi-turn awareness (plan: last ~20 user+assistant pairs -> 40 msgs)
MAX_TRANSCRIPT_MESSAGES = 40

SKIP_EXTRA_CHIPS = (
    "Nothing else—build my trip",
    "Nothing else - build my trip",
    "Build my itinerary now",
)

CONFIRM_CHIPS = frozenset(
    {
        "Confirm and build itinerary",
        "Confirm and build",
    }
)

CHANGE_CHIPS = frozenset(
    {
        "I need to change something",
    }
)

SKIP_TASTE_MESSAGES = frozenset(
    {
        "skip taste quiz",
        "skip taste",
    }
)


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _transcript_from_messages(messages: list[ChatMessage]) -> str:
    lines = []
    for m in messages[-MAX_TRANSCRIPT_MESSAGES:]:
        lines.append(f"{m.role}: {m.content}")
    return "\n".join(lines)


def _has_origin(ctx: dict) -> bool:
    o = (ctx.get("origin") or "").strip()
    if o:
        return True
    iata = (ctx.get("origin_iata") or "").strip().upper()
    return len(iata) >= 3


def _format_human_date(value: str) -> str:
    """Format ISO date strings like 2026-06-01 to 'June 1, 2026'."""
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
    """Merge classifier output into prior context; lists like destinations accumulate uniquely."""
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
        elif key == "taste_signals" and isinstance(val, dict):
            merged["taste_signals"] = {
                "liked": list(val.get("liked") or []),
                "disliked": list(val.get("disliked") or []),
            }
        else:
            merged[key] = val
    return merged


def run_classifier(
    transcript: str,
    prior_context: dict,
    latest_user_message: str,
) -> tuple[dict, list[str], bool]:
    """Single LLM call: merge structured planning context + gaps."""
    if not llm_configured():
        merged = merge_planning_context(
            prior_context,
            {"notes": prior_context.get("notes", "") + " " + latest_user_message},
        )
        missing = compute_missing_slots(merged)
        return merged, missing, False

    schema_hint = """{
  "planning_context": {
    "destinations": ["city or region names as strings"],
    "start": "YYYY-MM-DD or null if unknown",
    "end": "YYYY-MM-DD or null if unknown",
    "num_people": null or integer,
    "budget": null or number USD total trip budget,
    "origin": "home city or departure location (free text) or null",
    "origin_iata": "3-letter departure airport code or null",
    "interests": ["optional tags e.g. food, museums"],
    "pace": "relaxed|moderate|packed or null",
    "transport_style": "walk_transit|rental_car|mixed or null",
    "dietary_notes": "short string or null",
    "notes": "short freeform constraints"
  },
  "missing_slots": ["destinations, start, end, num_people, budget, origin — list unknowns"]
}"""

    today_iso = datetime.now().date().isoformat()
    today_human = _format_human_date(today_iso)

    prompt = f"""You extract and merge structured TRIP FACTS from a planning conversation.

Current date context (authoritative): {today_human} ({today_iso})

Current merged planning_context (may be empty): {json.dumps(prior_context)}
Full transcript (most recent lines may be most important):
{transcript}

Latest user message: "{latest_user_message}"

Task:
1) Merge any NEW facts from the latest message into planning_context. Do not drop previously known facts unless the user corrects them.
2) For destinations, return a list of strings (multi-city trips are allowed).
3) Infer reasonable dates only if the user gave them explicitly or clearly implied; otherwise leave start/end null.
4) If the user gives only month/day (no year), resolve the year using the current date context above so dates are reasonable and not in the distant past.
5) Infer num_people and budget only when stated or clearly implied; else null.
6) origin: where the traveler departs from (city/region). origin_iata only if the user gave a 3-letter airport code explicitly.
7) List missing_slots among: destinations, start, end, num_people, budget, origin — for anything still unknown or ambiguous.

Return JSON ONLY (no markdown) matching this shape:
{schema_hint}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        incoming = data.get("planning_context") or {}
        merged = merge_planning_context(prior_context, incoming)
        model_missing = data.get("missing_slots")
        if isinstance(model_missing, list) and model_missing:
            missing = model_missing
        else:
            missing = compute_missing_slots(merged)
        return merged, missing, False
    except Exception as e:
        print(f"Classifier error: {e}")
        merged = merge_planning_context(prior_context, {})
        missing = compute_missing_slots(merged)
        return merged, missing, False


def run_planning_reply(
    transcript: str,
    planning_context: dict,
    missing_slots: list[str],
) -> tuple[str, list[str]]:
    """Assistant reply: next question or acknowledgment."""
    if not llm_configured():
        return (
            "Tell me where you want to go and your preferred dates.",
            ["Suggest dates", "Surprise me"],
        )

    prompt = f"""You are a friendly travel planning assistant. The user is still gathering details for ONE trip.

Known structured facts (authoritative — do not contradict):
{json.dumps(planning_context)}

Slots still missing or unclear: {json.dumps(missing_slots)}

Conversation so far:
{transcript}

Write a short, warm reply (2-4 sentences). Ask ONE clear follow-up about the highest-priority missing item.
Offer 2-3 short chip labels the user might tap as quick replies (strings only).

Return JSON only:
{{"content": "...", "chips": ["...", "...", "..."]}}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "What else should I know about this trip?"), data.get("chips") or [
            "Next step",
            "I'm flexible",
        ]
    except Exception as e:
        print(f"Reply generation error: {e}")
        return "What dates work for you?", ["This month", "I'm flexible"]


def run_extra_context_prompt_message(planning_context: dict) -> tuple[str, list[str]]:
    """One-shot assistant message before optional extras (then taste / confirm)."""
    if not llm_configured():
        return (
            "Before we continue: any must-see spots, airline preferences, dietary needs, or restaurants? "
            "Or tap the chip when you are ready for the next step.",
            list(SKIP_EXTRA_CHIPS[:2]),
        )

    prompt = f"""The user has locked in core trip details:
{json.dumps(planning_context)}

Write a short friendly message (2-3 sentences) asking if they want to add ANY extra preferences before we move on:
specific sights, airlines, restaurants, accessibility, kids' needs, nightlife, etc.
Offer 2-3 chip labels: one should be exactly "Nothing else—build my trip" for users who are done.

Return JSON only:
{{"content": "...", "chips": ["Nothing else—build my trip", "...", "..."]}}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        chips = data.get("chips") or list(SKIP_EXTRA_CHIPS[:2])
        if "Nothing else—build my trip" not in chips:
            chips = ["Nothing else—build my trip"] + [c for c in chips if c][:2]
        return data.get("content", "Any last preferences before we continue?"), chips[:4]
    except Exception as e:
        print(f"Extra context prompt error: {e}")
        return (
            "Before we continue, is there anything else—airlines, restaurants, must-sees?",
            ["Nothing else—build my trip", "Prefer morning flights"],
        )


def run_taste_intro_message(planning_context: dict) -> tuple[str, list[str]]:
    _ = planning_context
    return (
        "Quick taste check: rate a few sample spots so I can match your style. Use the cards below, "
        "or skip if you prefer.",
        ["Skip taste quiz"],
    )


def run_confirmation_summary_message(planning_context: dict) -> tuple[str, list[str]]:
    chips = ["Confirm and build itinerary", "I need to change something"]
    if not llm_configured():
        lines = []
        if planning_context.get("destinations"):
            lines.append(f"- Destinations: {', '.join(planning_context['destinations'])}")
        if planning_context.get("origin") or planning_context.get("origin_iata"):
            lines.append(
                f"- Departing from: {planning_context.get('origin') or ''} "
                f"{planning_context.get('origin_iata') or ''}".strip()
            )
        if planning_context.get("start") and planning_context.get("end"):
            lines.append(f"- Dates: {planning_context['start']} → {planning_context['end']}")
        if planning_context.get("num_people") is not None:
            lines.append(f"- Travelers: {planning_context['num_people']}")
        if planning_context.get("budget") is not None:
            lines.append(f"- Budget (USD): {planning_context['budget']}")
        body = "\n".join(lines) if lines else "- (see notes)"
        return (
            f"Here is what I have:\n{body}\n\nIf this looks right, confirm to build your itinerary. "
            f"Or tell me what to change.",
            chips,
        )

    prompt = f"""Summarize this trip planning context for the traveler in clear bullet points (max 8 bullets). Include destinations, dates, travelers, budget, departure origin, and any preferences or taste signals.

Context JSON:
{json.dumps(planning_context)}

End by asking them to confirm to build the itinerary, or say what to change.

Return JSON only:
{{"content": "markdown-friendly plain text summary", "chips": ["Confirm and build itinerary", "I need to change something"]}}"""

    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "Please review your trip details."), data.get("chips") or chips
    except Exception as e:
        print(f"Confirmation summary error: {e}")
        return "Review your trip details on the right, then confirm to build your itinerary.", chips


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


def _finalize_extra_context(
    prior: dict,
    merged: dict,
    user_message: str,
) -> dict:
    """After user answered the optional extra-context prompt, merge into extra_context."""
    out = dict(merged)
    u = (user_message or "").strip()
    if u in SKIP_EXTRA_CHIPS or u.lower() in ("skip", "no", "nope", "nothing"):
        out["extra_context"] = prior.get("extra_context") or ""
    else:
        old = (out.get("extra_context") or prior.get("extra_context") or "").strip()
        out["extra_context"] = (old + "\n" + u).strip() if old else u
    out["extra_context_prompt_sent"] = True
    return out


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
    """
    Full itinerary build: generating phase, agent+tools, activities replace, complete.
    Returns (assistant_content, assistant_chips, itinerary_build_meta, ok).
    """
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
    chips = ["Sounds great"]
    return content, chips, build_meta, True


def _classify_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": [], "ready_to_generate": False}

    prior = dict(trip.planning_context or {})
    user_message = state["user_message"]
    u_low = (user_message or "").strip().lower()

    # Confirming phase: merge edits; stay in review until explicit confirm via API or chip in main
    if trip.planning_phase == PlanningPhase.confirming.value:
        messages = (
            db.query(ChatMessage)
            .filter(ChatMessage.trip_id == trip.id)
            .order_by(ChatMessage.created_at)
            .all()
        )
        transcript = _transcript_from_messages(messages)
        merged, missing, _ = run_classifier(transcript, prior, user_message)
        merged = merge_planning_context(prior, merged)
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

    # Skip taste via chat
    if (
        prior.get("taste_calibration_status") == "pending"
        and u_low in SKIP_TASTE_MESSAGES
    ):
        merged = dict(prior)
        merged["taste_calibration_status"] = "skipped"
        return {
            "planning_context": merged,
            "missing_slots": [],
            "ready_to_generate": False,
        }

    # First reply after optional extra prompt (merge freeform extra once)
    if (
        prior.get("extra_context_prompt_sent")
        and len(compute_missing_slots(prior)) == 0
        and not prior.get("post_extra_merged")
    ):
        merged = dict(prior)
        merged = _finalize_extra_context(prior, merged, user_message)
        merged["post_extra_merged"] = True
        if places_configured():
            merged["taste_calibration_status"] = "pending"
        else:
            merged["taste_calibration_status"] = "skipped"
        merged["taste_intro_sent"] = False
        merged["confirmation_summary_sent"] = False
        return {
            "planning_context": merged,
            "missing_slots": [],
            "ready_to_generate": False,
        }

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.trip_id == trip.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    transcript = _transcript_from_messages(messages)
    merged, missing, _ = run_classifier(transcript, prior, user_message)

    if prior.get("extra_context_prompt_sent"):
        merged["extra_context_prompt_sent"] = True

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
                "Got it — I updated your trip details. Review the summary on the right, "
                "then confirm to build your itinerary."
            ),
            "assistant_chips": ["Confirm and build itinerary", "I need to change something"],
            "generated_itinerary": False,
        }

    ctx = trip.planning_context or {}
    if (
        ctx.get("taste_calibration_status") == "pending"
        and ctx.get("taste_intro_sent")
        and trip.planning_phase == PlanningPhase.gathering.value
    ):
        return {
            "assistant_content": (
                "Use the taste cards on the right to like or dislike sample places, "
                "or tap Skip taste quiz."
            ),
            "assistant_chips": ["Skip taste quiz"],
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


def _prompt_extra_node(state: PlanningState) -> dict[str, Any]:
    """Ask for optional preferences; set extra_context_prompt_sent on trip."""
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": []}

    ctx = dict(trip.planning_context or {})
    ctx["extra_context_prompt_sent"] = True
    trip.planning_context = ctx
    db.commit()
    db.refresh(trip)

    content, chips = run_extra_context_prompt_message(ctx)
    return {
        "assistant_content": content,
        "assistant_chips": chips,
        "generated_itinerary": False,
        "planning_context": ctx,
    }


def _taste_intro_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if not trip:
        return {"assistant_content": "Trip not found.", "assistant_chips": []}

    ctx = dict(trip.planning_context or {})
    ctx["taste_intro_sent"] = True
    trip.planning_context = ctx
    apply_planning_context_to_trip(trip, ctx)
    db.commit()
    db.refresh(trip)

    content, chips = run_taste_intro_message(ctx)
    return {
        "assistant_content": content,
        "assistant_chips": chips,
        "generated_itinerary": False,
        "planning_context": ctx,
    }


def _confirm_summary_node(state: PlanningState) -> dict[str, Any]:
    db: Session = state["db"]
    trip_id = state["trip_id"]
    content, chips = finalize_confirm_summary(db, trip_id)
    return {
        "assistant_content": content,
        "assistant_chips": chips,
        "generated_itinerary": False,
    }


def _route_after_persist(state: PlanningState) -> str:
    ctx = state.get("planning_context") or {}
    db: Session = state["db"]
    trip = db.get(Trip, state["trip_id"])
    if trip and trip.planning_phase == PlanningPhase.confirming.value:
        if len(compute_missing_slots(ctx)) > 0:
            return "reply"
        if not ctx.get("confirmation_summary_sent"):
            return "confirm_summary"
        return "reply"
    if len(compute_missing_slots(ctx)) > 0:
        return "reply"
    if not ctx.get("extra_context_prompt_sent"):
        return "prompt_extra"
    if not ctx.get("post_extra_merged"):
        return "reply"
    if ctx.get("taste_calibration_status") == "pending" and not ctx.get("taste_intro_sent"):
        return "taste_intro"
    if ctx.get("taste_calibration_status") == "skipped" and not ctx.get("confirmation_summary_sent"):
        return "confirm_summary"
    return "reply"


def build_planning_graph():
    g = StateGraph(PlanningState)
    g.add_node("classify", _classify_node)
    g.add_node("persist", _persist_node)
    g.add_node("reply", _reply_node)
    g.add_node("prompt_extra", _prompt_extra_node)
    g.add_node("taste_intro", _taste_intro_node)
    g.add_node("confirm_summary", _confirm_summary_node)
    g.set_entry_point("classify")
    g.add_edge("classify", "persist")
    g.add_conditional_edges(
        "persist",
        _route_after_persist,
        {
            "prompt_extra": "prompt_extra",
            "taste_intro": "taste_intro",
            "confirm_summary": "confirm_summary",
            "reply": "reply",
        },
    )
    g.add_edge("prompt_extra", END)
    g.add_edge("taste_intro", END)
    g.add_edge("confirm_summary", END)
    g.add_edge("reply", END)
    return g.compile()


planning_graph = build_planning_graph()


def run_planning_turn(db: Session, trip_id: int, user_message: str) -> PlanningState:
    """Run one planning turn after the user message has been persisted."""
    initial: PlanningState = {
        "trip_id": trip_id,
        "user_message": user_message,
        "db": db,
    }
    return planning_graph.invoke(initial)


def seed_planning_context_from_initial_request(request: str) -> dict[str, Any]:
    """Optional one-shot merge from landing text before any chat messages exist."""
    merged, _, _ = run_classifier(f"user: {request}", {}, request)
    return merged


def build_welcome_message(initial_request: str, planning_context: dict) -> tuple[str, list[str]]:
    """First assistant message after POST /trips — grounded in seeded context."""
    missing = compute_missing_slots(planning_context)
    if not llm_configured():
        return (
            "Let's plan your trip together. Tell me where you want to go, your dates, "
            "how many travelers, approximate budget, and where you're flying from.",
            ["Weekend trip", "Family vacation", "Not sure yet"],
        )
    prompt = f"""The user started trip planning with this message:
"{initial_request}"

Extracted/planned facts so far (may be partial):
{json.dumps(planning_context)}

Missing slots still needed: {json.dumps(missing)}

Write a short, warm first reply (2-3 sentences). Acknowledge what you already understood from their message, and ask for the most important missing details.
Return JSON only: {{"content": "...", "chips": ["...", "...", "..."]}}"""
    try:
        text = _strip_json(complete_text(prompt))
        data = json.loads(text)
        return data.get("content", "Let's plan your trip!"), data.get("chips") or [
            "Help me pick dates",
            "Suggest a destination",
        ]
    except Exception as e:
        print(f"Welcome message error: {e}")
        return "Let's plan your trip! Where would you like to go?", ["Open to ideas", "I have dates"]


def merge_planning_context_patch(prior: dict, patch: dict) -> dict:
    """Merge a partial planning_context dict from PATCH (same rules as classifier merge)."""
    return merge_planning_context(prior, patch)
