# TripLogic

Trip planner migrated off Jaseci to:

- `frontend/`: React + TypeScript + Vite
- `backend/`: FastAPI + SQLAlchemy
- local SQLite for development, with SQLAlchemy ready for MySQL later

## Features

- Landing page with quick-start search and destination cards
- Planner page with three itinerary modes: balanced, budget, and foodie
- Budget tracking by category
- Trip summary page
- AI chat backed by Gemini with trip-aware tool lookup against the saved trip in SQLite
- Trip CRUD and itinerary endpoints persisted locally in SQLite for development

## Backend setup

1. Create a backend env file:

```bash
cp backend/.env.example backend/.env
```

2. Install backend dependencies and run FastAPI:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will start on `http://localhost:8000`.
The SQLite database file will be created at `backend/triplogic.db` on first startup.

Use Python `3.12` or `3.13` for the backend right now. Python `3.14` currently fails during `pydantic-core` installation in this stack.

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The Vite app will start on `http://localhost:5173` and proxy `/api` to FastAPI.

## Environment

Required backend env vars:

- `DATABASE_URL` optional for local dev; defaults to `sqlite:///./triplogic.db`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional, defaults to `gemini-2.5-flash`
- `ALLOWED_ORIGINS`

## API endpoints

- `GET /api/health`
- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/{trip_id}`
- `PATCH /api/trips/{trip_id}`
- `DELETE /api/trips/{trip_id}`
- `GET /api/trips/{trip_id}/itinerary?plan=A`
- `POST /api/demo-chat`
- `POST /api/trips/{trip_id}/chat`

## Notes

- The legacy `.jac` files are still present in the repo as migration reference, but they are no longer the active application.
- FastAPI auto-creates the `trips` table on startup. For production, replace that with migrations.
- When you are ready to move to MySQL, set `DATABASE_URL` to a MySQL SQLAlchemy URL and install the extra driver with `pip install -r requirements-mysql.txt`.
