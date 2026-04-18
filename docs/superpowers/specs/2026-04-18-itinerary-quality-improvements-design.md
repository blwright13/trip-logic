# Itinerary Quality & Consistency Improvements

**Date:** 2026-04-18  
**Status:** Approved  
**Branch:** agentic-layer

---

## Context

TripLogic generates AI-powered travel itineraries via a GPT-4o tool-using agent loop. Current pain points:

1. **Too few activities per day** — The system prompt doesn't enforce a daily structure, so some days get 1-2 activities instead of the expected breakfast + morning activity + lunch + afternoon activity + dinner (5 activities/day).
2. **Generic, ungrounded costs** — Activity costs are often hallucinated; SerpAPI and Google Places are not always called before generating.
3. **No scheduling guardrails** — Activities can overlap, pack unrealistically, or be assigned wrong days.
4. **Vague prompt context** — `context_to_generation_prompt()` doesn't tell the model how many total days there are or what pace means concretely.

**Goal:** Make every generated itinerary reliably full, well-timed, budget-aware, and grounded in real data — without a full agent refactor.

---

## Approach: Prompt-First + Lightweight Post-Processor

### Architecture Overview

```
User confirms trip
       │
       ▼
context_to_generation_prompt()   ← [IMPROVED: adds day count, budget/day, pace density]
       │
       ▼
run_itinerary_agent_with_tools() ← [IMPROVED: new system prompt with daily template + mandatory tool calls]
       │
       ├─► search_flights (required when origin known)
       ├─► search_places  (required: ≥2 calls per destination)
       └─► final JSON
       │
       ▼
merge_parsed_with_canonical()    ← [unchanged]
       │
       ▼
replace_trip_activities()        ← [IMPROVED: runs day coverage validator after saving]
       │
       ▼
Itinerary saved to DB
```

---

## Component Changes

### 1. `backend/planning_prompts.py` — Richer Generation Context

**Function:** `context_to_generation_prompt()`

Add computed fields to the prompt so the LLM knows upfront:
- **Exact day count** — `(end - start).days + 1` calculated from context dates
- **Budget per day** — `budget / num_days` so costs are spread realistically
- **Pace → density mapping**:
  - `relaxed` → aim for 4-5 activities/day (3 meals + 1-2 experiences)
  - `moderate` → aim for 5-6 activities/day (3 meals + 2-3 experiences)
  - `packed` → aim for 6-8 activities/day (3 meals + 3-5 experiences)
- **Required day count reminder** — "You MUST generate activities for all N days"

**Why:** The LLM currently receives no signal about how many total activities to produce or how dense each day should be.

---

### 2. `backend/itinerary_agent.py` — System Prompt Overhaul

Replace the current generic system prompt (lines 173-194) with a structured one that enforces:

**Daily schedule template:**
```
Breakfast:           08:00–08:45  (food, ~45 min)
Morning activity:    09:30–12:00  (sightseeing/entertainment, 90-150 min)
Lunch:               12:30–13:30  (food/cafe, 60 min)
Afternoon activity:  14:30–17:00  (sightseeing/entertainment, 90-150 min)
Dinner:              18:30–20:00  (food, 90 min)
```

**Mandatory tool call rules (added to system prompt):**
1. If `origin` or `origin_iata` is provided, call `search_flights` for the outbound leg (and return if round-trip) before writing the JSON.
2. Call `search_places` at least twice per destination — once for restaurants/cafés, once for attractions/sightseeing.
3. Use real venue names, ratings, and price signals from tool results in activity titles and costs.

**Cost grounding rules:**
- Derive meal costs from Places API `price_level` (1=$15, 2=$30, 3=$60, 4=$100+ per person)
- Derive flight costs from SerpAPI actual prices; fall back to reasonable estimates if unavailable
- Hotels: estimate from destination price level (~$100-300/night budget hotels, ~$300-600 mid, more for luxury)
- Total estimated costs should land within 85-105% of the stated budget

**Output format:** unchanged JSON schema

---

### 3. `backend/itinerary_gen.py` — Day Coverage Validator

Add `validate_day_coverage(trip, activities)` called at the end of `replace_trip_activities()`.

**Logic:**
1. Parse trip start/end to get the set of expected dates
2. Group activities by calendar day
3. For each day, check: does it have at least one `food` category activity? (meals are the minimum bar)
4. If a day has 0 activities: log a warning with the day date — this signals a generation failure worth tracking
5. Check for overlapping activity windows: `start[i] + duration[i] > start[i+1]` for activities on the same day — log overlaps but don't auto-correct (LLM output is trusted; we just surface the issue)

**Why not auto-fill missing days?**  
Auto-filled placeholder meals would be confusing to users and mask the real issue (prompt failure). Logging the gap lets us monitor and improve the prompt further. In a future iteration we could add a re-generation pass.

---

## Files to Modify

| File | Change | Key Lines |
|------|--------|-----------|
| `backend/planning_prompts.py` | Add day count, budget/day, pace density to prompt | 22-54 |
| `backend/itinerary_agent.py` | Replace system prompt with structured daily template + tool call rules | 173-200 |
| `backend/itinerary_gen.py` | Add `validate_day_coverage()`, call from `replace_trip_activities()` | 104-133 |

---

## Verification

1. **Manual test**: Create a 3-day Paris trip (relaxed pace, $3000 budget, origin: DTW)
   - Confirm itinerary has 3 full days of activities
   - Confirm breakfast/lunch/dinner appear on each day
   - Confirm at least one flight activity with real airline data from SerpAPI
   - Confirm Places API venue names appear in activity titles
   - Confirm total costs fall within $2550–$3150

2. **Check logs**: `itinerary_tool_execute` log lines should show `search_flights` + 2+ `search_places` calls

3. **Edge case**: Trip with no origin set — confirm `search_flights` is NOT called, no error, still generates full days

4. **Edge case**: All APIs down (invalid keys) — confirm fallback to `parse_trip_from_prompt` still generates ≥3 activities/day via improved fallback prompt
