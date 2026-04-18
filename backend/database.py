import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

_backend_dir = Path(__file__).resolve().parent
_default_sqlite = f"sqlite:///{_backend_dir / 'triplogic.db'}"

# USE_LOCAL_SQLITE=1 forces backend/triplogic.db so you can keep DATABASE_URL in .env for deploy.
_use_local_sqlite = os.getenv("USE_LOCAL_SQLITE", "").lower() in ("1", "true", "yes")
if _use_local_sqlite:
    DATABASE_URL = _default_sqlite
else:
    DATABASE_URL = os.getenv("DATABASE_URL", _default_sqlite)

_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_activity_info_url_column() -> None:
    """Add info_url to activities if missing (SQLite / simple deploys without Alembic)."""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "activities" not in tables:
            return
        cols = {c["name"] for c in inspector.get_columns("activities")}
        if "info_url" in cols:
            return
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE activities ADD COLUMN info_url VARCHAR"))
            conn.commit()
    except Exception:
        pass


def _ensure_trip_user_id_column() -> None:
    """Add user_id to trips if missing (SQLite / simple deploys without Alembic)."""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "trips" not in tables:
            return
        cols = {c["name"] for c in inspector.get_columns("trips")}
        if "user_id" in cols:
            return
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE trips ADD COLUMN user_id VARCHAR"))
            conn.commit()
    except Exception:
        pass


def create_tables():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
    _ensure_activity_info_url_column()
    _ensure_trip_user_id_column()
