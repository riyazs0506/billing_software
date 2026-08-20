"""Authentication + login/logout shift tracking.

There is intentionally no user-creation, user-edit or user-delete endpoint
here. Admin and Cashier accounts are provisioned by the seed / setup script
(see backend/seed.py and the README); the application exposes no staff CRUD.
"""
from __future__ import annotations

from flask import Blueprint, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ..extensions import db
from ..middleware import auth_required, current_user, role_required
from ..models import ROLE_ADMIN, Shift, User, utcnow
from ..utils.responses import ApiError, ok
from ..utils.validators import require

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _issue_tokens(user: User, shift: Shift) -> dict:
    claims = {"role": user.role, "name": user.name, "shift_id": shift.id}
    identity = str(user.id)
    return {
        "access_token": create_access_token(identity=identity, additional_claims=claims),
        "refresh_token": create_refresh_token(identity=identity, additional_claims=claims),
        "user": user.to_dict(),
        "shift": shift.to_dict(),
    }


@bp.post("/login")
def login():
    payload = require(request.get_json(silent=True), "username", "password")
    username = str(payload["username"]).strip()
    password = str(payload["password"])

    user = db.session.query(User).filter(User.username == username).first()
    # One generic message for both branches so usernames cannot be enumerated.
    if user is None or not user.check_password(password):
        raise ApiError("Incorrect username or password.", status=401, code="invalid_credentials")
    if not user.is_active:
        raise ApiError("This account has been disabled.", status=403, code="account_disabled")

    # Close any session left dangling by a browser crash.
    db.session.query(Shift).filter(
        Shift.user_id == user.id, Shift.logout_time.is_(None)
    ).update({"logout_time": utcnow()}, synchronize_session=False)

    shift = Shift(user_id=user.id)
    db.session.add(shift)
    db.session.commit()

    return ok(_issue_tokens(user, shift))


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    claims = get_jwt()
    user = db.session.get(User, int(get_jwt_identity()))
    if user is None or not user.is_active:
        raise ApiError("This account is no longer active.", status=401, code="unauthorized")

    shift = db.session.get(Shift, claims.get("shift_id")) if claims.get("shift_id") else None
    if shift is None or shift.logout_time is not None:
        raise ApiError("Session ended. Please log in again.", status=401, code="session_ended")

    shift.last_seen_at = utcnow()
    db.session.commit()
    return ok(
        {
            "access_token": create_access_token(
                identity=str(user.id),
                additional_claims={
                    "role": user.role,
                    "name": user.name,
                    "shift_id": shift.id,
                },
            ),
            "user": user.to_dict(),
        }
    )


@bp.post("/logout")
@auth_required
def logout():
    """Records the logout time - this is the shift log, not staff management."""
    claims = get_jwt()
    shift = db.session.get(Shift, claims.get("shift_id")) if claims.get("shift_id") else None
    if shift is not None and shift.logout_time is None:
        shift.logout_time = utcnow()
        db.session.commit()
    return ok({"message": "Signed out.", "shift": shift.to_dict() if shift else None})


@bp.get("/me")
@auth_required
def me():
    user = current_user()
    claims = get_jwt()
    shift = db.session.get(Shift, claims.get("shift_id")) if claims.get("shift_id") else None
    return ok({"user": user.to_dict(), "shift": shift.to_dict() if shift else None})


@bp.get("/session")
@auth_required
def session_check():
    """Cheap liveness probe the frontend uses to detect an expired session."""
    return ok({"valid": True, "user": current_user().to_dict()})


@bp.get("/shifts")
@auth_required
def shifts():
    """Shift log. Admin sees every session; a cashier only sees their own.

    Read-only audit data (07-Role-Access: "Shift Log View - all staff / own
    shifts only"). No assignment, scheduling or rostering exists.
    """
    user = current_user()
    query = db.session.query(Shift).order_by(Shift.login_time.desc())
    if user.role != ROLE_ADMIN:
        query = query.filter(Shift.user_id == user.id)
    elif request.args.get("user_id"):
        query = query.filter(Shift.user_id == int(request.args["user_id"]))

    limit = min(int(request.args.get("limit", 50)), 200)
    return ok([s.to_dict() for s in query.limit(limit).all()])


@bp.post("/change-password")
@auth_required
def change_password():
    """A signed-in user rotating their own password.

    This is self-service account hygiene, not staff account management: it
    cannot target another user and cannot change a role.
    """
    from ..utils.validators import validate_password

    payload = require(request.get_json(silent=True), "current_password", "new_password")
    user = current_user()
    if not user.check_password(str(payload["current_password"])):
        raise ApiError("Current password is incorrect.", status=403, code="forbidden")

    new_password = validate_password(payload["new_password"])
    if new_password == str(payload["current_password"]):
        raise ApiError(
            "The new password must be different.", status=422, code="validation_error"
        )
    user.set_password(new_password)
    db.session.commit()
    return ok({"message": "Password updated."})


@bp.get("/roles")
@role_required(ROLE_ADMIN)
def roles():
    """The two fixed application roles, for report filters."""
    return ok([{"value": "admin", "label": "Admin"}, {"value": "cashier", "label": "Cashier"}])
