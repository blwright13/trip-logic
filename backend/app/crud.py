from __future__ import annotations

import secrets
import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from . import models, schemas


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email.lower()).first()


def create_user(db: Session, email: str, password_hash: str) -> models.User:
    user = models.User(email=email.lower(), password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(db: Session, user_id: int) -> models.AuthSession:
    session = models.AuthSession(token=secrets.token_urlsafe(32), user_id=user_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, token: str) -> Optional[models.AuthSession]:
    return db.query(models.AuthSession).filter(models.AuthSession.token == token).first()


def delete_session(db: Session, token: str) -> None:
    db.query(models.AuthSession).filter(models.AuthSession.token == token).delete()
    db.commit()


def list_trips(db: Session, user_id: int) -> List[models.Trip]:
    return db.query(models.Trip).filter(models.Trip.owner_id == user_id).order_by(models.Trip.created_at.desc()).all()


def get_trip(db: Session, trip_id: int, user_id: int) -> Optional[models.Trip]:
    return db.query(models.Trip).filter(models.Trip.id == trip_id, models.Trip.owner_id == user_id).first()


def get_trip_by_public_id(db: Session, public_id: str, user_id: int) -> Optional[models.Trip]:
    return (
        db.query(models.Trip)
        .filter(models.Trip.public_id == public_id, models.Trip.owner_id == user_id)
        .first()
    )


def create_trip(db: Session, user_id: int, trip: schemas.TripCreate) -> models.Trip:
    db_trip = models.Trip(
        public_id=str(uuid.uuid4()),
        owner_id=user_id,
        title=trip.title,
        start_date=trip.start_date,
        end_date=trip.end_date,
        travelers=trip.travelers,
        budget=trip.budget,
        plans=trip.model_dump(mode="json")["plans"],
        chat_messages=trip.model_dump(mode="json")["chat_messages"],
    )
    db.add(db_trip)
    db.commit()
    db.refresh(db_trip)
    return db_trip


def update_trip(db: Session, db_trip: models.Trip, update: schemas.TripUpdate) -> models.Trip:
    payload = update.model_dump(exclude_unset=True, mode="json")
    for key, value in payload.items():
        setattr(db_trip, key, value)
    db.add(db_trip)
    db.commit()
    db.refresh(db_trip)
    return db_trip


def delete_trip(db: Session, db_trip: models.Trip) -> None:
    db.delete(db_trip)
    db.commit()
