# TripLogic

AI-powered trip planning application with FastAPI backend and React frontend.

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL (or Supabase)
- Gemini API key

## Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env
# Edit .env with your credentials

# Run the server
uvicorn main:app --reload
```

The API will be available at http://localhost:8000

## Frontend Setup

```bash
cd trip-companion-ai

# Install dependencies
npm install

# Run the development server
npm run dev
```

The frontend will be available at http://localhost:8080

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/trips` | Create trip from natural language |
| GET | `/api/trips` | List all trips |
| GET | `/api/trips/{id}` | Get trip with activities |
| PUT | `/api/trips/{id}` | Update trip metadata |
| DELETE | `/api/trips/{id}` | Delete trip |
| POST | `/api/trips/{id}/chat` | Send message, get AI response |
| GET | `/api/trips/{id}/chat` | Get chat history |
| GET | `/api/trips/{id}/itinerary` | Activities grouped by day |

## Environment Variables

- `GEMINI_API_KEY`: Google Gemini API key for AI features
- `DATABASE_URL`: PostgreSQL connection string
- `FRONTEND_URL`: Frontend URL for CORS (default: http://localhost:8080)
