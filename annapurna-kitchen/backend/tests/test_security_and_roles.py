"""Role enforcement on the server, and proof that no staff-management
module exists anywhere in the application.

07-Role-Access: "a cashier token cannot call an admin-only endpoint even by
direct API request". These tests bypass the UI entirely and hit the API.
"""
from __future__ import annotations

import os
import pathlib
import re

import pytest

from tests.conftest import data_of, error_of

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent

# Endpoints a cashier must never reach, whatever the frontend shows.
ADMIN_ONLY_GET = [
    "/api/reports/dashboard",
    "/api/reports/daily",
    "/api/reports/item-wise",
    "/api/reports/staff-wise",
    "/api/reports/expenses",
    "/api/reports/profit-loss",
    "/api/reports/summary",
    "/api/reports/export/daily",
    "/api/inventory/dashboard",
    "/api/inventory/materials",
    "/api/inventory/yields",
    "/api/expenses",
    "/api/settings",
    "/api/backup",
    "/api/customers",
    "/api/discounts",
    "/api/payments",
    "/api/auth/roles",
]


@pytest.mark.parametrize("url", ADMIN_ONLY_GET)
def test_cashier_cannot_reach_admin_endpoints(cashier_api, url):
    response = cashier_api.get(url)
    assert response.status_code == 403, url
    assert error_of(response)["code"] == "forbidden"


@pytest.mark.parametrize("url", ADMIN_ONLY_GET)
def test_admin_can_reach_admin_endpoints(admin_api, url):
    assert admin_api.get(url).status_code == 200, url


def test_cashier_cannot_write_admin_resources(cashier_api, menu_ids, material_ids):
    calls = [
        ("post", "/api/menu/items", {"name": "X", "category_id": 1, "price": "10"}),
        ("put", "/api/menu/items/" + str(menu_ids["Chapati"]), {"price": "1"}),
        ("delete", "/api/menu/items/" + str(menu_ids["Chapati"]), None),
        ("patch", "/api/menu/items/" + str(menu_ids["Chapati"]) + "/availability", {}),
        ("post", "/api/menu/categories", {"name": "Hacked"}),
        ("post", "/api/inventory/materials", {"name": "X", "unit": "kg"}),
        (
            "post",
            "/api/inventory/materials/" + str(material_ids["Chicken"]) + "/stock",
            {"current_stock": "999"},
        ),
        ("post", "/api/expenses", {"description": "X", "amount": "1"}),
        ("put", "/api/settings", {"settings": {"tax.gst_rate": "0"}}),
        ("post", "/api/backup/run", {}),
        ("post", "/api/tables", {"table_number": "99"}),
        ("post", "/api/discounts", {"type": "special_date", "percentage": "99"}),
    ]
    for method, url, payload in calls:
        call = getattr(cashier_api, method)
        response = call(url) if payload is None else call(url, json=payload)
        assert response.status_code == 403, method + " " + url


def test_cashier_can_use_every_operational_endpoint(cashier_api, menu_ids, table_ids):
    """The cashier keeps exactly the access 07-Role-Access grants."""
    assert cashier_api.get("/api/menu/items/grid").status_code == 200
    assert cashier_api.get("/api/tables").status_code == 200
    assert cashier_api.get("/api/inventory/alerts").status_code == 200
    assert cashier_api.get("/api/discounts/active").status_code == 200
    assert cashier_api.get("/api/customers/search?q=Ram").status_code == 200
    assert cashier_api.get("/api/settings/public").status_code == 200
    assert cashier_api.get("/api/payments/modes").status_code == 200
    assert cashier_api.get("/api/auth/shifts").status_code == 200

    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    assert cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 1},
    ).status_code == 201
    assert cashier_api.post("/api/orders/" + str(order["id"]) + "/kot").status_code == 201
    assert cashier_api.post(
        "/api/billing/generate", json={"order_id": order["id"]}
    ).status_code == 201


def test_a_forged_role_claim_does_not_grant_admin(client, app):
    """The database is the authority on role, not the token payload."""
    from flask_jwt_extended import create_access_token

    from app.extensions import db
    from app.models import Shift, User

    cashier = db.session.query(User).filter_by(username="cashier").first()
    shift = Shift(user_id=cashier.id)
    db.session.add(shift)
    db.session.commit()

    forged = create_access_token(
        identity=str(cashier.id),
        additional_claims={"role": "admin", "shift_id": shift.id},
    )
    response = client.get(
        "/api/reports/dashboard", headers={"Authorization": "Bearer " + forged}
    )
    assert response.status_code == 403


def test_unauthenticated_requests_are_rejected(client):
    for url in ADMIN_ONLY_GET + ["/api/menu/items", "/api/tables", "/api/orders"]:
        assert client.get(url).status_code == 401, url


def test_health_and_index_are_public(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api").status_code == 200


# --- staff management must not exist -------------------------------------

STAFF_URLS = [
    "/api/staff",
    "/api/staff/",
    "/api/staffs",
    "/api/employees",
    "/api/employee",
    "/api/users",
    "/api/user",
    "/api/accounts",
    "/api/staff-management",
    "/api/staff/1",
    "/api/users/1",
    "/api/employees/1",
]


@pytest.mark.parametrize("url", STAFF_URLS)
def test_no_staff_management_endpoints_exist(admin_api, url):
    """Even an admin token gets a 404 - the routes simply do not exist."""
    for method in ("get", "post", "put", "delete"):
        response = getattr(admin_api, method)(url)
        assert response.status_code in (404, 405), method.upper() + " " + url


def test_the_url_map_contains_no_staff_routes(app):
    rules = [str(rule) for rule in app.url_map.iter_rules()]
    offenders = [
        rule
        for rule in rules
        if re.search(r"/(staff|employee|users?|accounts)(/|$)", rule, re.IGNORECASE)
        # the staff-wise *report* reads transaction data and is required
        and "reports/staff-wise" not in rule
    ]
    assert offenders == [], offenders


def test_no_staff_route_or_service_files_exist():
    forbidden = {
        "staff_routes.py",
        "staff_service.py",
        "staffservice.js",
        "staffmanagement.jsx",
        "staff.jsx",
        "employeemanagement.jsx",
        "employee_routes.py",
        "user_routes.py",
    }
    found = []
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [
            d
            for d in dirs
            if d not in {"node_modules", ".venv", "__pycache__", ".git", "dist", "build"}
        ]
        for name in files:
            if name.lower() in forbidden:
                found.append(os.path.join(root, name))
    assert found == [], found


def test_no_staff_crud_service_functions_exist():
    """Guards against a staff CRUD sneaking back in under another filename."""
    patterns = re.compile(
        r"(def\s+(create|update|delete)_staff)"
        r"|(def\s+(create|update|delete)_employee)"
        r"|(class\s+Staff\b)"
        r"|(class\s+Employee\b)",
        re.IGNORECASE,
    )
    offenders = []
    for path in (BACKEND_ROOT / "app").rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="replace")
        if patterns.search(text):
            offenders.append(str(path))
    assert offenders == [], offenders


def test_users_can_only_be_provisioned_outside_the_application(admin_api):
    """No endpoint creates, edits, disables or deletes another account."""
    attempts = [
        ("post", "/api/auth/users", {"username": "mallory", "password": "Pass@12345"}),
        ("post", "/api/auth/register", {"username": "mallory", "password": "Pass@12345"}),
        ("post", "/api/auth/staff", {"name": "Mallory", "role": "admin"}),
        ("delete", "/api/auth/users/2", None),
        ("put", "/api/auth/users/2", {"role": "admin"}),
    ]
    for method, url, payload in attempts:
        call = getattr(admin_api, method)
        response = call(url) if payload is None else call(url, json=payload)
        assert response.status_code in (404, 405), method.upper() + " " + url


def test_the_staff_wise_report_still_works(admin_api):
    """Removing staff management must not remove the staff-wise report."""
    report = data_of(admin_api.get("/api/reports/staff-wise"))
    assert "staff" in report
    assert isinstance(report["staff"], list)


# --- misc hardening ------------------------------------------------------

def test_stack_traces_are_not_leaked_in_production_mode(app, client, monkeypatch):
    monkeypatch.setitem(app.config, "DEBUG", False)
    response = client.get("/api/does-not-exist")
    body = response.get_json()
    assert response.status_code == 404
    assert "trace" not in str(body)


def test_password_hash_is_never_serialised(admin_api):
    payload = data_of(admin_api.get("/api/auth/me"))
    assert "password_hash" not in payload["user"]
    assert "password" not in payload["user"]

    shifts = data_of(admin_api.get("/api/auth/shifts"))
    assert all("password_hash" not in row for row in shifts)


def test_settings_reject_keys_outside_the_editable_allowlist(admin_api):
    response = admin_api.put(
        "/api/settings", json={"settings": {"security.jwt_secret": "haha"}}
    )
    assert response.status_code == 422
