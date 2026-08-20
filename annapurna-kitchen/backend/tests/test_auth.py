"""Authentication, role claims, session/shift tracking and token expiry."""
from __future__ import annotations

from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models import Shift, User, utcnow
from tests.conftest import data_of, error_of


def test_valid_login_returns_token_and_role(client):
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "Admin@12345"}
    )
    payload = data_of(response)
    assert payload["access_token"]
    assert payload["refresh_token"]
    assert payload["user"]["role"] == "admin"
    assert payload["user"]["username"] == "admin"
    assert "password_hash" not in payload["user"]


def test_cashier_login_reports_cashier_role(client):
    payload = data_of(
        client.post(
            "/api/auth/login", json={"username": "cashier", "password": "Cashier@12345"}
        )
    )
    assert payload["user"]["role"] == "cashier"


@pytest.mark.parametrize(
    "username,password",
    [("admin", "wrong-password"), ("nobody", "Admin@12345"), ("", "")],
)
def test_invalid_login_is_rejected(client, username, password):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code in (401, 422)


def test_invalid_login_does_not_leak_whether_the_user_exists(client):
    known = client.post(
        "/api/auth/login", json={"username": "admin", "password": "nope"}
    )
    unknown = client.post(
        "/api/auth/login", json={"username": "ghost", "password": "nope"}
    )
    assert known.status_code == unknown.status_code == 401
    assert error_of(known)["message"] == error_of(unknown)["message"]


def test_password_is_hashed_not_stored_in_plaintext(app):
    user = db.session.query(User).filter_by(username="admin").first()
    assert user.password_hash != "Admin@12345"
    assert user.password_hash.startswith("$2")  # bcrypt
    assert user.check_password("Admin@12345")
    assert not user.check_password("Admin@1234")


def test_login_opens_a_shift_and_logout_closes_it(client):
    payload = data_of(
        client.post("/api/auth/login", json={"username": "cashier", "password": "Cashier@12345"})
    )
    shift_id = payload["shift"]["id"]
    assert payload["shift"]["logout_time"] is None

    token = payload["access_token"]
    response = client.post(
        "/api/auth/logout", headers={"Authorization": "Bearer " + token}
    )
    assert response.status_code == 200

    shift = db.session.get(Shift, shift_id)
    assert shift.logout_time is not None


def test_me_returns_the_current_user(cashier_api):
    payload = data_of(cashier_api.get("/api/auth/me"))
    assert payload["user"]["username"] == "cashier"
    assert payload["shift"]["is_open"] is True


def test_request_without_a_token_is_unauthorized(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/reports/dashboard").status_code == 401


def test_expired_token_is_rejected(app, client):
    user = db.session.query(User).filter_by(username="admin").first()
    shift = Shift(user_id=user.id)
    db.session.add(shift)
    db.session.commit()

    expired = create_access_token(
        identity=str(user.id),
        additional_claims={"role": "admin", "shift_id": shift.id},
        expires_delta=timedelta(seconds=-30),
    )
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer " + expired}
    )
    assert response.status_code == 401
    assert error_of(response)["code"] == "token_expired"


def test_session_expires_after_inactivity(app, client):
    payload = data_of(
        client.post("/api/auth/login", json={"username": "cashier", "password": "Cashier@12345"})
    )
    shift = db.session.get(Shift, payload["shift"]["id"])
    idle = app.config["SESSION_IDLE_MINUTES"]
    shift.last_seen_at = utcnow() - timedelta(minutes=idle + 5)
    db.session.commit()

    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer " + payload["access_token"]}
    )
    assert response.status_code == 401
    assert error_of(response)["code"] == "session_expired"


def test_refresh_issues_a_new_access_token(client):
    payload = data_of(
        client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
    )
    response = client.post(
        "/api/auth/refresh",
        headers={"Authorization": "Bearer " + payload["refresh_token"]},
    )
    assert data_of(response)["access_token"]


def test_a_user_can_change_only_their_own_password(cashier_api, client):
    response = cashier_api.post(
        "/api/auth/change-password",
        json={"current_password": "Cashier@12345", "new_password": "NewCashier@2026"},
    )
    assert response.status_code == 200
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "cashier", "password": "NewCashier@2026"},
        ).status_code
        == 200
    )
    # The admin account is untouched by that call.
    assert (
        client.post(
            "/api/auth/login", json={"username": "admin", "password": "Admin@12345"}
        ).status_code
        == 200
    )


def test_change_password_requires_the_current_one(cashier_api):
    response = cashier_api.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "Whatever@2026"},
    )
    assert response.status_code == 403


def test_short_passwords_are_refused(cashier_api):
    response = cashier_api.post(
        "/api/auth/change-password",
        json={"current_password": "Cashier@12345", "new_password": "short"},
    )
    assert response.status_code == 422


def test_cashier_sees_only_their_own_shifts(cashier_api, admin_api):
    cashier_shifts = data_of(cashier_api.get("/api/auth/shifts"))
    assert cashier_shifts
    assert {s["username"] for s in cashier_shifts} == {"cashier"}

    admin_shifts = data_of(admin_api.get("/api/auth/shifts"))
    assert {s["username"] for s in admin_shifts} >= {"admin", "cashier"}
