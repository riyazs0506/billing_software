"""Reusable request validation (§40 of the build spec).

Each helper raises ``ApiError`` with a 422 status so the frontend can render
inline field errors from a single, predictable shape.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .money import D
from .responses import ApiError

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,50}$")
PHONE_RE = re.compile(r"^[0-9]{10,15}$")


def _fail(field: str, message: str):
    raise ApiError(message, status=422, code="validation_error", details={"field": field})


def require(payload: dict | None, *fields: str) -> dict:
    payload = payload or {}
    missing = [f for f in fields if payload.get(f) in (None, "")]
    if missing:
        raise ApiError(
            "Missing required field(s): " + ", ".join(missing),
            status=422,
            code="validation_error",
            details={"fields": missing},
        )
    return payload


def as_string(value, field: str, *, min_len: int = 1, max_len: int = 255) -> str:
    text = str(value or "").strip()
    if len(text) < min_len:
        _fail(field, f"{field} must be at least {min_len} character(s).")
    if len(text) > max_len:
        _fail(field, f"{field} must be at most {max_len} characters.")
    return text


def as_decimal(
    value,
    field: str,
    *,
    minimum: Decimal | str | None = None,
    maximum: Decimal | str | None = None,
    allow_none: bool = False,
) -> Decimal | None:
    if value in (None, "") and allow_none:
        return None
    try:
        number = D(value)
    except (InvalidOperation, ValueError, TypeError):
        _fail(field, f"{field} must be a number.")
        return None  # pragma: no cover - _fail always raises
    if minimum is not None and number < D(minimum):
        _fail(field, f"{field} must be greater than or equal to {minimum}.")
    if maximum is not None and number > D(maximum):
        _fail(field, f"{field} must be less than or equal to {maximum}.")
    return number


def as_int(value, field: str, *, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        _fail(field, f"{field} must be a whole number.")
        return 0  # pragma: no cover
    if minimum is not None and number < minimum:
        _fail(field, f"{field} must be at least {minimum}.")
    if maximum is not None and number > maximum:
        _fail(field, f"{field} must be at most {maximum}.")
    return number


def as_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def as_date(value, field: str, *, allow_none: bool = False) -> date | None:
    if value in (None, "") and allow_none:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        _fail(field, f"{field} must be an ISO date (YYYY-MM-DD).")
        return None  # pragma: no cover


def as_enum(value, field: str, allowed: set[str] | tuple[str, ...]) -> str:
    text = str(value or "").strip().lower()
    if text not in set(allowed):
        _fail(field, f"{field} must be one of: {', '.join(sorted(allowed))}.")
    return text


# --- domain specific -----------------------------------------------------

def validate_username(value) -> str:
    text = str(value or "").strip()
    if not USERNAME_RE.match(text):
        _fail(
            "username",
            "Username must be 3-50 characters using letters, digits, dot, dash or underscore.",
        )
    return text


def validate_password(value) -> str:
    text = str(value or "")
    if len(text) < 8:
        _fail("password", "Password must be at least 8 characters.")
    if len(text) > 128:
        _fail("password", "Password must be at most 128 characters.")
    return text


def validate_phone(value, *, allow_none: bool = False) -> str | None:
    if value in (None, "") and allow_none:
        return None
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    if not PHONE_RE.match(digits):
        _fail("phone", "Phone must contain 10 to 15 digits.")
    return digits


def validate_percentage(value, field: str = "percentage") -> Decimal:
    return as_decimal(value, field, minimum="0", maximum="100")


def validate_date_range(start, end, *, allow_none: bool = False):
    start_d = as_date(start, "start_date", allow_none=allow_none)
    end_d = as_date(end, "end_date", allow_none=allow_none)
    if start_d and end_d and end_d < start_d:
        _fail("end_date", "end_date cannot be earlier than start_date.")
    return start_d, end_d
