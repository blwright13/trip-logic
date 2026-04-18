"""Shared OpenAI client for the API."""
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

if OPENAI_API_KEY:
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
else:
    openai_client = None


def llm_configured() -> bool:
    return openai_client is not None


def complete_text(prompt: str) -> str:
    """Single user-message completion; returns trimmed assistant text."""
    if not openai_client:
        raise RuntimeError("OpenAI client is not configured")
    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    content = response.choices[0].message.content
    return (content or "").strip()
