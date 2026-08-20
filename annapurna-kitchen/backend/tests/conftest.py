"""Shared pytest fixtures.

The suite runs against SQLite so it needs no MySQL server; the application code
under test is identical either way (SQLAlchemy renders the same statements,
and every ENUM/DECIMAL is declared portably).
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from decimal import Decimal

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("TEST_DATABASE_URL", "sqlite://")

from app import create_app  # noqa: E402
from app.extensions import db as _db  # noqa: E402
from app.models import (  # noqa: E402
    DEFAULT_SETTINGS,
    Category,
    Customer,
    Discount,
    MenuItem,
    RawMaterial,
    RecipeYield,
    RestaurantTable,
    Setting,
    User,
)


@pytest.fixture()
def app():
    application = create_app("testing")
    with application.app_context():
        _db.create_all()
        _bootstrap()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    return _db


def _bootstrap() -> None:
    """A miniature restaurant: two accounts, a menu, stock and recipes."""
    for key, value in DEFAULT_SETTINGS.items():
        _db.session.add(Setting(key=key, value=value))

    admin = User(name="Owner", username="admin", role="admin")
    admin.set_password("Admin@12345")
    cashier = User(name="Counter", username="cashier", role="cashier")
    cashier.set_password("Cashier@12345")
    _db.session.add_all([admin, cashier])

    breads = Category(name="Breads", sort_order=1)
    mains = Category(name="Main Course", sort_order=2)
    _db.session.add_all([breads, mains])
    _db.session.flush()

    chapati = MenuItem(category_id=breads.id, name="Chapati", price=Decimal("20.00"))
    butter_chicken = MenuItem(
        category_id=mains.id, name="Butter Chicken", price=Decimal("360.00")
    )
    unavailable = MenuItem(
        category_id=mains.id,
        name="Fish Amritsari",
        price=Decimal("320.00"),
        is_available=False,
    )
    _db.session.add_all([chapati, butter_chicken, unavailable])

    wheat = RawMaterial(
        name="Wheat flour",
        unit="kg",
        current_stock=Decimal("20.000"),
        low_stock_threshold=Decimal("40"),
    )
    chicken = RawMaterial(
        name="Chicken",
        unit="kg",
        current_stock=Decimal("10.000"),
        low_stock_threshold=Decimal("25"),
    )
    _db.session.add_all([wheat, chicken])
    _db.session.flush()

    # The spec's worked example: 20 kg x 12..16 -> 240..320 chapatis.
    _db.session.add(
        RecipeYield(
            menu_item_id=chapati.id,
            raw_material_id=wheat.id,
            min_yield_per_unit=Decimal("12"),
            max_yield_per_unit=Decimal("16"),
            avg_consumption_per_dish=Decimal("0.075"),
        )
    )
    _db.session.add(
        RecipeYield(
            menu_item_id=butter_chicken.id,
            raw_material_id=chicken.id,
            min_yield_per_unit=Decimal("12"),
            max_yield_per_unit=Decimal("15"),
            avg_consumption_per_dish=Decimal("0.075"),
        )
    )

    for number in ("1", "2", "5", "6"):
        _db.session.add(RestaurantTable(table_number=number, seats=4, status="empty"))

    _db.session.add(
        Discount(name="Global discount", type="global", percentage=Decimal("0"), is_active=False)
    )
    _db.session.add(Customer(name="Ramesh Iyer", phone="9840012345"))
    _db.session.commit()


# --- helpers -------------------------------------------------------------

class Api:
    """Thin wrapper that carries a bearer token and unwraps the envelope."""

    def __init__(self, client, token: str):
        self.client = client
        self.token = token

    def _headers(self, extra=None):
        headers = {"Authorization": "Bearer " + self.token}
        if extra:
            headers.update(extra)
        return headers

    def get(self, url, **kwargs):
        return self.client.get(url, headers=self._headers(), **kwargs)

    def post(self, url, json=None, **kwargs):
        return self.client.post(url, json=json, headers=self._headers(), **kwargs)

    def put(self, url, json=None, **kwargs):
        return self.client.put(url, json=json, headers=self._headers(), **kwargs)

    def patch(self, url, json=None, **kwargs):
        return self.client.patch(url, json=json, headers=self._headers(), **kwargs)

    def delete(self, url, **kwargs):
        return self.client.delete(url, headers=self._headers(), **kwargs)


def login(client, username: str, password: str) -> Api:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.get_json()
    return Api(client, response.get_json()["data"]["access_token"])


@pytest.fixture()
def admin_api(client):
    return login(client, "admin", "Admin@12345")


@pytest.fixture()
def cashier_api(client):
    return login(client, "cashier", "Cashier@12345")


@pytest.fixture()
def menu_ids(app):
    return {
        item.name: item.id
        for item in _db.session.query(MenuItem).all()
    }


@pytest.fixture()
def table_ids(app):
    return {
        table.table_number: table.id
        for table in _db.session.query(RestaurantTable).all()
    }


@pytest.fixture()
def material_ids(app):
    return {m.name: m.id for m in _db.session.query(RawMaterial).all()}


def data_of(response):
    body = response.get_json()
    assert body is not None, response.data
    assert body.get("success") is True, body
    return body["data"]


def error_of(response):
    body = response.get_json()
    assert body is not None, response.data
    assert body.get("success") is False, body
    return body["error"]


@pytest.fixture()
def today():
    return date.today()


@pytest.fixture()
def tomorrow():
    return date.today() + timedelta(days=1)
