# Auth, Login/Logout & Profile Management — Design Spec

**Date:** 2026-04-18  
**Branch:** agentic-layer  
**Status:** Approved

---

## Overview

Add secure authentication to TripLogic using Supabase Auth. Anonymous users can plan trips freely; a sign-up gate appears at "Confirm & Build Itinerary." After sign-up, the anonymous trip is claimed by the new account and generation proceeds. Authenticated users get a private trip list and an editable travel-preferences profile.

---

## Decisions

| Question | Decision |
|---|---|
| Auth provider | Supabase Auth (email/password + Google OAuth) |
| Profile data | Display name, home city, preferred currency, travel style tags |
| Trip ownership | Private — trips belong to their creator only |
| Anonymous access | Full planning chat is available; gate triggers at "Confirm & Build" |
| Gate behavior | Sign-up modal opens; after auth, trip is claimed, then generation runs |

---

## Architecture

### Request Flow

```
Browser
  └─ Supabase JS SDK → signs in user, returns JWT access token
  └─ Every fetch → Authorization: Bearer <jwt>

FastAPI
  └─ get_current_user() dependency
       ├─ Verifies JWT via Supabase JWKS endpoint (cached on startup)
       ├─ Extracts user_id (sub) from token payload
       └─ Returns user_id or raises 401

Database (SQLite / Postgres)
  └─ All trip queries filter by user_id
```

### Profile Storage

User profile metadata (display name, home city, currency, travel style tags) is stored in Supabase's `user_metadata` field — no additional DB table required.

---

## Backend Changes

### New file: `backend/auth.py`

- `get_current_user(token: str)` — FastAPI dependency
- Fetches Supabase JWKS on startup, caches public key
- Verifies JWT signature and expiry using `python-jose`
- Extracts and returns `sub` (Supabase UUID) as `user_id`
- Raises `HTTP 401` on invalid or missing token
- `get_optional_user()` variant — returns `None` instead of raising, for endpoints that work both authenticated and anonymous

### `backend/models.py`

- `Trip` gets `user_id = Column(String, nullable=True)` — Supabase UUID
- Nullable so existing anonymous trips are not broken

### Modified endpoints

All trip endpoints (`GET /api/trips`, `POST /api/trips`, `GET /api/trips/{id}`, `PUT /api/trips/{id}`, `DELETE /api/trips/{id}`) receive `current_user = Depends(get_optional_user)`:

- **Authenticated:** filter/scope all queries by `user_id`
- **Unauthenticated:** trip creation and planning chat work; trip listing and management return empty or 403

### New endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `PATCH` | `/api/trips/{id}/claim` | Required | Sets `user_id` on an anonymous trip. Returns 409 if already owned by another user. |
| `GET` | `/api/profile` | Required | Returns user metadata from the verified JWT payload. |
| `PATCH` | `/api/profile` | Required | Updates Supabase user metadata via Supabase Admin SDK (`user_metadata`). |

### New dependencies

- `python-jose[cryptography]` — JWT verification
- `supabase` (Python SDK) — Admin API calls for profile updates
- `httpx` — JWKS fetch

---

## Frontend Changes

### New: `AuthContext` (`src/contexts/AuthContext.tsx`)

- Wraps the entire app
- Exposes: `user`, `session`, `signIn(email, password)`, `signUp(email, password, metadata)`, `signOut()`, `loading`
- Initializes from `supabase.auth.onAuthStateChange`
- Stores JWT in memory (Supabase JS default); auto-refreshes via Supabase SDK

### New: `AuthModal` component (`src/components/AuthModal.tsx`)

- Sign up / Log in tab switcher
- Email + password fields
- "Continue with Google" button (Supabase OAuth)
- CTA: "Create account & build itinerary" (sign-up) / "Log in" (login)
- Header shows trip destination when used as a planning gate
- Used from: TopNav (standalone), PlanningPage (gate)

### Modified: `PlanningPage`

- "Confirm & Build Itinerary" button checks `user` from `AuthContext`
- If anonymous: opens `AuthModal`
- On successful auth: calls `PATCH /api/trips/{id}/claim`, then calls `POST /api/trips/{id}/planning/confirm`
- Handles 409 from claim gracefully (trip already owned — show error)

### Modified: `TopNav`

- **Anonymous:** Log in + Sign up buttons (open `AuthModal`)
- **Authenticated:** Avatar pill (initials from display name) with dropdown:
  - My Profile → `/profile`
  - My Trips → `/trips`
  - Log out → calls `signOut()`

### New: `/profile` page (`src/pages/ProfilePage.tsx`)

Fields:
- Display name (editable text input)
- Email (read-only, from Supabase)
- Home city (editable text input)
- Preferred currency (dropdown: USD, EUR, GBP, JPY, etc.)
- Travel style tags (multi-select pill toggle: Budget-conscious, Foodie, Adventure, Luxury, etc.)
- Change password link (triggers Supabase password reset email)
- Log out button
- Save changes → `PATCH /api/profile`

### Protected routes

`/trips` and `/profile` redirect to `/` and open `AuthModal` if `user` is null.

### New dependency

- `@supabase/supabase-js` — Supabase JS client

---

## Data Model

```sql
-- Added to trips table
ALTER TABLE trips ADD COLUMN user_id VARCHAR;  -- Supabase UUID, nullable
```

Migration handled inline in `database.py` alongside the existing `info_url` column migration pattern.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Existing anonymous trips | `user_id` is null; not visible in any user's `/trips`; accessible directly by trip ID until claimed |
| Claim conflict | `PATCH /claim` returns 409; frontend shows error "This trip was already saved to another account" |
| Expired JWT | Supabase JS auto-refreshes; backend returns 401 → frontend triggers re-auth |
| Google OAuth callback | Supabase handles redirect; `onAuthStateChange` fires on return; frontend resumes normally |
| Sign-up then immediate claim failure | Frontend surfaces error without losing the trip ID; user can retry |

---

## File Checklist

**Backend (new/modified):**
- `backend/auth.py` (new)
- `backend/models.py` (add `user_id`)
- `backend/database.py` (add `user_id` migration)
- `backend/main.py` (new endpoints, auth dependency on existing endpoints)
- `backend/requirements.txt` (add `python-jose`, `supabase`, `httpx`)

**Frontend (new/modified):**
- `trip-companion-ai/src/contexts/AuthContext.tsx` (new)
- `trip-companion-ai/src/components/AuthModal.tsx` (new)
- `trip-companion-ai/src/components/TopNav.tsx` (modify)
- `trip-companion-ai/src/pages/ProfilePage.tsx` (new)
- `trip-companion-ai/src/pages/PlanningPage.tsx` (modify)
- `trip-companion-ai/src/App.tsx` (add AuthProvider, `/profile` route, protected route wrapper)
- `trip-companion-ai/src/lib/supabase.ts` (new — Supabase client singleton)
- `trip-companion-ai/package.json` (add `@supabase/supabase-js`)

**Config:**
- `.env` / `.env.example` — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `.gitignore` — ensure `.superpowers/` is ignored
