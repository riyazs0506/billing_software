"""Server-side authorization.

07-Role-Access: "every API route independently checks the JWT role claim - a
cashier token cannot call an admin-only endpoint even by direct API request."
Hiding a button in the UI is not security; these decorators are.
"""
from __future__ import annotations

from datetime import timedelta
from functools import wraps

from flask import current_app, g
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from ..extensions import db
from ..models import ROLE_ADMIN, ROLE_CASHIER, Shift, User, utcnow
from ..utils.responses import ApiError


def _load_current_user() -> User:
    identity = get_jwt_identity()
    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        raise ApiError("Invalid session token.", status=401, code="unauthorized")

    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        raise ApiError(
            "This account is no longer active.", status=401, code="unauthorized"
        )
    return user


def _enforce_idle_timeout(claims: dict) -> None:
    """Auto-logout after inactivity, on top of the token's own expiry."""
    shift_id = claims.get("shift_id")
    if not shift_id:
        return
    shift = db.session.get(Shift, shift_id)
    if shift is None or shift.logout_time is not None:
        raise ApiError(
            "Your session has ended. Please log in again.",
            status=401,
            code="session_ended",
        )

    idle_minutes = current_app.config["SESSION_IDLE_MINUTES"]
    if idle_minutes > 0 and shift.last_seen_at:
        idle_for = utcnow() - shift.last_seen_at
        if idle_for > timedelta(minutes=idle_minutes):
            shift.logout_time = utcnow()
            db.session.commit()
            raise ApiError(
                "Signed out after " + str(idle_minutes) + " minutes of inactivity.",
                status=401,
                code="session_expired",
            )
    shift.last_seen_at = utcnow()
    db.session.commit()
    g.current_shift = shift


def auth_required(fn):
    """Any authenticated role."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        g.current_user = _load_current_user()
        _enforce_idle_timeout(claims)
        return fn(*args, **kwargs)

    return wrapper


def role_required(*roles: str):
    """Restrict a route to the given application roles."""
    allowed = set(roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user = _load_current_user()
            g.current_user = user

            # The database is the authority on role, not the token payload.
            if user.role not in allowed or claims.get("role") != user.role:
                raise ApiError(
                    "Your role does not have access to this resource.",
                    status=403,
                    code="forbidden",
                    details={"required": sorted(allowed), "actual": user.role},
                )
            _enforce_idle_timeout(claims)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    return role_required(ROLE_ADMIN)(fn)


def cashier_or_admin(fn):
    return role_required(ROLE_ADMIN, ROLE_CASHIER)(fn)


def current_user() -> User:
    user = getattr(g, "current_user", None)
    if user is None:  # pragma: no cover - decorators always populate it
        raise ApiError("Not authenticated.", status=401, code="unauthorized")
    return user
