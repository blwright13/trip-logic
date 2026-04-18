import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from dotenv import load_dotenv
from supabase import Client, create_client

# Ensure auth env vars are available even when this module is imported before main.py calls load_dotenv().
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""

_bearer = HTTPBearer(auto_error=False)
_jwks_cache: dict[str, Any] = {"keys": {}, "expires_at": 0.0}
_jwks_ttl_seconds = 3600
_admin_client: Optional[Client] = None


@dataclass
class AuthUser:
    user_id: str
    email: Optional[str]
    user_metadata: dict[str, Any]
    payload: dict[str, Any]


def _refresh_jwks() -> None:
    if not JWKS_URL:
        return
    with httpx.Client(timeout=8.0) as client:
        response = client.get(JWKS_URL)
        response.raise_for_status()
        body = response.json()
    keys = body.get("keys") or []
    key_map = {k.get("kid"): k for k in keys if k.get("kid")}
    _jwks_cache["keys"] = key_map
    _jwks_cache["expires_at"] = time.time() + _jwks_ttl_seconds


def preload_jwks() -> None:
    """Best-effort preload; app continues even if JWKS cannot be fetched at boot."""
    try:
        _refresh_jwks()
    except Exception:
        pass


def _get_jwk(kid: Optional[str]) -> dict[str, Any]:
    if not kid:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    now = time.time()
    if now >= float(_jwks_cache.get("expires_at", 0)):
        _refresh_jwks()
    key = (_jwks_cache.get("keys") or {}).get(kid)
    if key:
        return key
    # Token signed with a rotated key; force one refetch.
    _refresh_jwks()
    key = (_jwks_cache.get("keys") or {}).get(kid)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return key


def _verify_token(token: str) -> dict[str, Any]:
    if not SUPABASE_URL:
        raise HTTPException(status_code=503, detail="Backend auth is not configured (SUPABASE_URL)")

    try:
        header = jwt.get_unverified_header(token)
        jwk = _get_jwk(header.get("kid"))
        return jwt.decode(
            token,
            jwk,
            algorithms=[header.get("alg", "RS256")],
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid auth token") from exc


def _token_from_credentials(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if not credentials:
        return None
    if credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return credentials.credentials


def _auth_user_from_payload(payload: dict[str, Any]) -> AuthUser:
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="Invalid auth token payload")
    metadata = payload.get("user_metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    email = payload.get("email")
    return AuthUser(
        user_id=user_id,
        email=email if isinstance(email, str) else None,
        user_metadata=metadata,
        payload=payload,
    )


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[AuthUser]:
    token = _token_from_credentials(credentials)
    if not token:
        return None
    payload = _verify_token(token)
    return _auth_user_from_payload(payload)


def get_current_user(user: Optional[AuthUser] = Depends(get_optional_user)) -> AuthUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def get_supabase_admin_client() -> Client:
    global _admin_client
    if _admin_client is not None:
        return _admin_client
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase admin credentials are not configured")
    _admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _admin_client
