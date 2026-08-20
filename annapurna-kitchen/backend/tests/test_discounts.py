"""Global toggle, special-date override, and the no-retroactive-change rule."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Bill, Discount
from app.services import discount_engine
from tests.conftest import data_of


def _order_with_chapatis(api, table_id, menu_ids, quantity=20):
    order = data_of(
        api.post("/api/orders", json={"order_type": "dine_in", "table_id": table_id})
    )
    api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": quantity},
    )
    return order


def test_no_discount_by_default(app):
    active = discount_engine.evaluate()
    assert active.percentage == Decimal("0")
    assert active.discount_id is None


def test_global_toggle_applies_to_new_bills(admin_api, cashier_api, menu_ids, table_ids):
    admin_api.put("/api/discounts/global", json={"is_active": True, "percentage": "10"})

    order = _order_with_chapatis(cashier_api, table_ids["1"], menu_ids)
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]

    assert bill["subtotal"] == "400.00"
    assert bill["discount_percentage"] == "10.00"
    assert bill["discount_applied"] == "40.00"
    assert bill["taxable_value"] == "360.00"
    assert bill["total"] == "378.00"


def test_switching_the_global_toggle_off_stops_the_discount(
    admin_api, cashier_api, menu_ids, table_ids
):
    admin_api.put("/api/discounts/global", json={"is_active": True, "percentage": "10"})
    admin_api.put("/api/discounts/global", json={"is_active": False})

    order = _order_with_chapatis(cashier_api, table_ids["1"], menu_ids)
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert bill["discount_applied"] == "0.00"
    assert bill["total"] == "420.00"


def test_special_date_activates_itself_within_its_range(admin_api, app):
    today = date.today()
    admin_api.post(
        "/api/discounts",
        json={
            "type": "special_date",
            "name": "Diwali",
            "percentage": "15",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=2)).isoformat(),
        },
    )
    active = discount_engine.evaluate()
    assert active.percentage == Decimal("15.00")
    assert active.label == "Diwali"


def test_special_date_outside_its_range_does_nothing(admin_api, app):
    future = date.today() + timedelta(days=10)
    admin_api.post(
        "/api/discounts",
        json={
            "type": "special_date",
            "name": "Anniversary",
            "percentage": "20",
            "start_date": future.isoformat(),
            "end_date": (future + timedelta(days=1)).isoformat(),
        },
    )
    assert discount_engine.evaluate().percentage == Decimal("0")
    # ...but it does apply on the scheduled day, with no manual toggling.
    assert discount_engine.evaluate(future).percentage == Decimal("20.00")


def test_special_date_overrides_the_global_toggle(admin_api, app):
    admin_api.put("/api/discounts/global", json={"is_active": True, "percentage": "10"})
    today = date.today()
    admin_api.post(
        "/api/discounts",
        json={
            "type": "special_date",
            "name": "Pongal",
            "percentage": "25",
            "start_date": today.isoformat(),
            "end_date": today.isoformat(),
        },
    )
    active = discount_engine.evaluate()
    assert active.percentage == Decimal("25.00")
    assert active.type == "special_date"


def test_an_inactive_special_date_is_ignored(admin_api, app):
    today = date.today()
    created = data_of(
        admin_api.post(
            "/api/discounts",
            json={
                "type": "special_date",
                "percentage": "30",
                "start_date": today.isoformat(),
                "end_date": today.isoformat(),
                "is_active": False,
            },
        )
    )
    assert created["is_active"] is False
    assert discount_engine.evaluate().percentage == Decimal("0")


def test_completed_bills_are_never_recalculated(
    admin_api, cashier_api, menu_ids, table_ids
):
    order = _order_with_chapatis(cashier_api, table_ids["1"], menu_ids)
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": "420.00"}]},
    )

    # Turn a big discount on afterwards.
    admin_api.put("/api/discounts/global", json={"is_active": True, "percentage": "50"})

    db.session.expire_all()
    stored = db.session.get(Bill, bill["id"])
    assert str(stored.total) == "420.00"
    assert str(stored.discount_applied) == "0.00"
    assert str(stored.discount_percentage) == "0.00"


def test_percentage_must_be_between_0_and_100(admin_api):
    assert admin_api.put("/api/discounts/global", json={"percentage": "-5"}).status_code == 422
    assert admin_api.put("/api/discounts/global", json={"percentage": "150"}).status_code == 422


def test_special_date_range_must_be_ordered(admin_api):
    today = date.today()
    response = admin_api.post(
        "/api/discounts",
        json={
            "type": "special_date",
            "percentage": "10",
            "start_date": today.isoformat(),
            "end_date": (today - timedelta(days=3)).isoformat(),
        },
    )
    assert response.status_code == 422


def test_the_global_switch_cannot_be_deleted(admin_api, app):
    row = db.session.query(Discount).filter_by(type="global").first()
    response = admin_api.delete("/api/discounts/" + str(row.id))
    assert response.status_code == 409


def test_cashier_can_read_but_not_change_the_active_discount(cashier_api):
    assert cashier_api.get("/api/discounts/active").status_code == 200
    assert cashier_api.put(
        "/api/discounts/global", json={"is_active": True, "percentage": "90"}
    ).status_code == 403
    assert cashier_api.get("/api/discounts").status_code == 403
