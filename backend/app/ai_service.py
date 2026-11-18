"""Groq (hosted LLM) integration.

Groq is used for two things only:
  1. turning a sentence like "I spent 350 rupees at Domino's yesterday" into a structured transaction
  2. writing friendly explanations of statistics that Python already calculated.

Raw LLM output is never trusted: it is parsed and validated with Pydantic before use.
If Groq is unavailable, deterministic fallbacks keep the app useful.
"""
import json
import logging
from datetime import date

import httpx
from pydantic import ValidationError

from .config import CATEGORIES, settings
from .schemas import ExtractedTransaction

log = logging.getLogger("pennywise.ai")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class AIError(Exception):
    """Base class. `status_code` is what the API returns; `message` is shown to the user."""

    status_code = 502

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class AIUnavailable(AIError):
    status_code = 503


def groq_configured() -> bool:
    return bool(settings.GROQ_API_KEY.strip())


def _call_groq(messages: list[dict], json_mode: bool = False) -> str:
    """Low-level HTTP call. Kept separate so tests can replace it."""
    if not groq_configured():
        raise AIUnavailable("AI features need a Groq API key. Add GROQ_API_KEY to backend/.env. Normal expense tracking still works.")
    payload = {"model": settings.GROQ_MODEL, "messages": messages, "temperature": 0.2, "max_tokens": 600}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    try:
        r = httpx.post(
            GROQ_URL,
            json=payload,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            timeout=20.0,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as exc:
        log.warning("Groq HTTP error %s", exc.response.status_code)
        raise AIError("The AI service rejected the request. Check your Groq key and model name, then try again.")
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        log.warning("Groq call failed: %s", exc)
        raise AIError("The AI service is not responding right now. Please try again in a moment.")


# ---------------- natural-language extraction ----------------
def extract_transaction(text: str, today: date | None = None) -> ExtractedTransaction:
    today = today or date.today()
    system = (
        "You extract one expense from the user's sentence. Reply with ONLY a JSON object with keys: "
        '"merchant" (string), "amount" (number in Indian rupees, no symbols), '
        f'"category" (one of: {", ".join(CATEGORIES)}), '
        '"date" (YYYY-MM-DD or null), "description" (short string). '
        f"Today is {today.isoformat()}; resolve words like 'yesterday' relative to it. "
        "If there is no clear amount, set amount to 0."
    )
    raw = _call_groq([{"role": "system", "content": system}, {"role": "user", "content": text}], json_mode=True)
    return parse_extraction(raw, today)


def parse_extraction(raw: str, today: date | None = None) -> ExtractedTransaction:
    """Parse + validate raw LLM text. Raises AIError if it is not a usable transaction."""
    today = today or date.today()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("not an object")
        # Pydantic parses the JSON number into a Decimal via its string form to avoid float noise.
        if "amount" in data and isinstance(data["amount"], (int, float, str)):
            data["amount"] = str(data["amount"])
        tx = ExtractedTransaction.model_validate(data)
    except (ValueError, ValidationError) as exc:
        log.warning("Invalid LLM output: %s", exc)
        raise AIError("I couldn't understand that expense. Try something like: 'Spent 350 at Domino's yesterday'.")
    if tx.date and tx.date > today:
        tx.date = today  # an expense cannot happen in the future
    return tx


# ---------------- explanations (numbers come from Python) ----------------
def inr(x: float) -> str:
    s = f"{abs(x):,.2f}".rstrip("0").rstrip(".")
    return f"-₹{s}" if x < 0 else f"₹{s}"


def fallback_answer(question: str, stats: dict) -> str:
    q = question.lower()
    if not stats["transaction_count"]:
        return f"You haven't logged any expenses in {stats['month']} yet. Add one and I'll start crunching numbers."
    if any(w in q for w in ("save", "saving", "saved", "round")):
        return (
            f"You've saved {inr(stats['total_virtual_savings_rs'])} in total through round-ups "
            f"({inr(stats['roundup_savings_this_month_rs'])} this month, rounding to the nearest ₹{stats['rounding_increment_rs']:g}). "
            "This is virtual savings only."
        )
    if any(w in q for w in ("budget", "left", "remain")):
        rem = stats["budget_remaining_rs"]
        if rem >= 0:
            return f"You have {inr(rem)} left of your {inr(stats['monthly_budget_rs'])} budget for {stats['month']} ({stats['budget_used_percent']}% used)."
        return f"You're {inr(-rem)} over your {inr(stats['monthly_budget_rs'])} budget for {stats['month']}."
    if any(w in q for w in ("most", "biggest", "top", "category", "where")):
        merchants = ", ".join(f"{m['merchant']} ({inr(m['spent_rs'])})" for m in stats["top_merchants"])
        return (
            f"Your biggest category in {stats['month']} is {stats['top_category']} at {inr(stats['top_category_spent_rs'])}. "
            f"Top merchants: {merchants}."
        )
    return (
        f"In {stats['month']} you've spent {inr(stats['total_spent_rs'])} across {stats['transaction_count']} transactions, "
        f"with {inr(stats['budget_remaining_rs'])} left in your budget and {inr(stats['total_virtual_savings_rs'])} saved via round-ups."
    )


def fallback_insights(stats: dict) -> list[str]:
    if not stats["transaction_count"]:
        return ["Add your first expense and PennyWise will start spotting patterns."]
    out = [
        f"{stats['top_category']} is your biggest spend this month at {inr(stats['top_category_spent_rs'])}.",
        f"You've used {stats['budget_used_percent']}% of your budget, with {inr(stats['budget_remaining_rs'])} remaining.",
        f"Round-ups have quietly added {inr(stats['total_virtual_savings_rs'])} to your vault.",
    ]
    return out


CHAT_SYSTEM = (
    "You are PennyWise, a friendly personal-finance assistant. Answer using ONLY the numbers in the STATS JSON provided. "
    "Never calculate new totals, never invent figures, and if the stats don't contain the answer, say so. "
    "Savings are virtual round-ups, not real bank transfers. Keep answers under 90 words, in a warm tone."
)


def answer_question(question: str, stats: dict) -> tuple[str, str]:
    """Returns (answer, source) where source is 'groq' or 'fallback'."""
    try:
        text = _call_groq(
            [
                {"role": "system", "content": CHAT_SYSTEM},
                {"role": "user", "content": f"STATS: {json.dumps(stats)}\n\nQUESTION: {question}"},
            ]
        ).strip()
        if not text:
            raise AIError("empty")
        return text, "groq"
    except AIError:
        return fallback_answer(question, stats), "fallback"


def generate_insights(stats: dict) -> tuple[list[str], str]:
    if not stats["transaction_count"]:
        return fallback_insights(stats), "fallback"
    try:
        raw = _call_groq(
            [
                {
                    "role": "system",
                    "content": CHAT_SYSTEM
                    + ' Reply with ONLY JSON: {"insights": ["...", "...", "..."]} containing 3 short, specific, friendly tips.',
                },
                {"role": "user", "content": f"STATS: {json.dumps(stats)}"},
            ],
            json_mode=True,
        )
        items = json.loads(raw).get("insights")
        if not isinstance(items, list) or not items or not all(isinstance(i, str) and i.strip() for i in items):
            raise AIError("bad insights")
        return [i.strip() for i in items[:3]], "groq"
    except (AIError, ValueError, AttributeError):
        return fallback_insights(stats), "fallback"
