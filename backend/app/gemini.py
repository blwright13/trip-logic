from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from .config import settings


logger = logging.getLogger("triplogic.gemini")


class GeminiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


def _extract_retry_after_seconds(data: dict[str, Any]) -> Optional[int]:
    for detail in data.get("details", []):
        retry_delay = detail.get("retryDelay")
        if not isinstance(retry_delay, str):
            continue
        if retry_delay.endswith("s"):
            retry_delay = retry_delay[:-1]
        try:
            return max(1, int(float(retry_delay)))
        except ValueError:
            continue
    return None


def _parse_error_response(response: httpx.Response) -> GeminiError:
    status_code = response.status_code
    retry_after: int | None = None
    message = "Gemini request failed"

    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        error = payload.get("error", {})
        if isinstance(error, dict):
            api_message = error.get("message")
            if isinstance(api_message, str) and api_message.strip():
                first_line = api_message.strip().splitlines()[0].strip()
                message = first_line
            retry_after = _extract_retry_after_seconds(error)

    if status_code == 429:
        message = f"Gemini rate limit exceeded. {message}"

    return GeminiError(message, status_code=status_code, retry_after=retry_after)


async def generate_text(prompt: str, *, temperature: float = 0.8) -> str:
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(url, params={"key": settings.gemini_api_key}, json=payload)

    if response.status_code >= 400:
        logger.error("Gemini API error: %s", response.text)
        raise _parse_error_response(response)

    data = response.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise GeminiError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = " ".join(part.get("text", "").strip() for part in parts if part.get("text")).strip()
    if not text:
        raise GeminiError("Gemini returned an empty response")

    return text


async def generate_chat_response(prompt: str) -> dict[str, Any]:
    text = await generate_text(prompt)
    chips = [
        "Tell me more",
        "Update my itinerary",
        "What else can I do?",
    ]
    return {"response": text, "chips": chips}
