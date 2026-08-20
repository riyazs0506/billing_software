"""Yield engine, live output, auto-deduction and low-stock alerts."""
from __future__ import annotations

from decimal import Decimal

from app.extensions import db
from app.models import RawMaterial, StockMovement
from app.services import yield_calculator
from tests.conftest import data_of, error_of


# --- the calculation itself ----------------------------------------------

def test_the_spec_worked_example(app, material_ids):
    """20 kg wheat, 12-16 chapatis/kg -> 240-320 chapatis."""
    wheat = db.session.get(RawMaterial, material_ids["Wheat flour"])
    snapshot = yield_calculator.material_snapshot(wheat)

    chapati = next(
        link for link in snapshot["linked_items"] if link["menu_item_name"] == "Chapati"
    )
    assert chapati["min_output"] == "240"
    assert chapati["max_output"] == "320"
    assert chapati["display"] == "240-320"


def test_the_same_engine_handles_any_material(app, material_ids):
    """Nothing is hardcoded to chapatis: 10 kg chicken at 12-15 -> 120-150."""
    chicken = db.session.get(RawMaterial, material_ids["Chicken"])
    snapshot = yield_calculator.material_snapshot(chicken)
    link = snapshot["linked_items"][0]
    assert link["min_output"] == "120"
    assert link["max_output"] == "150"


def test_output_is_stock_times_yield(app):
    assert yield_calculator.possible_output("15", "8") == Decimal("120")
    assert yield_calculator.possible_output("5", "10") == Decimal("50")
    # Partial servings are floored - you cannot sell a fraction of a plate.
    assert yield_calculator.possible_output("2.5", "12") == Decimal("30")
    assert yield_calculator.possible_output("1.4", "12") == Decimal("16")


def test_zero_stock_yields_nothing(app, material_ids, admin_api):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "0"},
    )
    wheat = db.session.get(RawMaterial, material_ids["Wheat flour"])
    snapshot = yield_calculator.material_snapshot(wheat)
    assert snapshot["linked_items"][0]["min_output"] == "0"


def test_ad_hoc_calculator_endpoint(admin_api):
    result = data_of(
        admin_api.get("/api/inventory/calculate?stock=20&min_yield=12&max_yield=16")
    )
    assert result["min_output"] == "240"
    assert result["max_output"] == "320"
    assert result["display"] == "240-320"


# --- daily stock entry ---------------------------------------------------

def test_admin_updates_daily_stock_and_the_range_recalculates(admin_api, material_ids):
    before = data_of(admin_api.get("/api/inventory/dashboard"))
    wheat_before = next(m for m in before["materials"] if m["name"] == "Wheat flour")
    chapati_before = next(
        l for l in wheat_before["linked_items"] if l["menu_item_name"] == "Chapati"
    )
    assert chapati_before["display"] == "240-320"

    updated = data_of(
        admin_api.post(
            "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
            json={"current_stock": "30"},
        )
    )
    chapati_after = next(
        l for l in updated["linked_items"] if l["menu_item_name"] == "Chapati"
    )
    assert chapati_after["display"] == "360-480"


def test_stock_entry_is_recorded_as_a_movement(admin_api, material_ids, app):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "25", "note": "Morning delivery"},
    )
    movement = (
        db.session.query(StockMovement)
        .filter_by(raw_material_id=material_ids["Wheat flour"])
        .order_by(StockMovement.id.desc())
        .first()
    )
    assert movement.reason == "stock_entry"
    assert Decimal(str(movement.balance_after)) == Decimal("25.000")
    assert movement.note == "Morning delivery"


def test_negative_stock_is_refused(admin_api, material_ids):
    response = admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "-5"},
    )
    assert response.status_code == 422


def test_bulk_stock_entry(admin_api, material_ids):
    result = data_of(
        admin_api.post(
            "/api/inventory/stock/bulk",
            json={
                "entries": [
                    {"raw_material_id": material_ids["Wheat flour"], "current_stock": "40"},
                    {"raw_material_id": material_ids["Chicken"], "current_stock": "12"},
                ]
            },
        )
    )
    assert {m["name"]: m["current_stock"] for m in result} == {
        "Wheat flour": "40.000",
        "Chicken": "12.000",
    }


# --- deduction on billing ------------------------------------------------

def test_billing_deducts_configured_consumption(
    cashier_api, menu_ids, table_ids, material_ids
):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 10},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={"payments": [{"mode": "cash", "amount": bill["total"]}]},
        )
    )

    # 10 chapatis x 0.075 kg = 0.750 kg
    deduction = result["deductions"][0]
    assert deduction["raw_material_name"] == "Wheat flour"
    assert deduction["consumed"] == "0.750"
    assert deduction["stock_before"] == "20.000"
    assert deduction["stock_after"] == "19.250"

    # ...and the possible-output range recalculates live
    wheat = next(m for m in result["inventory"] if m["name"] == "Wheat flour")
    chapati = next(l for l in wheat["linked_items"] if l["menu_item_name"] == "Chapati")
    assert chapati["display"] == "231-308"  # 19.25 x 12 .. 19.25 x 16


def test_deduction_is_logged_against_the_bill(
    cashier_api, menu_ids, table_ids, material_ids, app
):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 4},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "upi", "amount": bill["total"]}]},
    )

    movement = (
        db.session.query(StockMovement)
        .filter_by(reason="billing_deduction")
        .order_by(StockMovement.id.desc())
        .first()
    )
    assert movement.bill_id == bill["id"]
    assert Decimal(str(movement.change_qty)) == Decimal("-0.300")


def test_stock_never_goes_negative(cashier_api, admin_api, menu_ids, table_ids, material_ids):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "0.100"},
    )
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 20},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": bill["total"]}]},
    )
    wheat = db.session.get(RawMaterial, material_ids["Wheat flour"])
    assert Decimal(str(wheat.current_stock)) == Decimal("0.000")


# --- low stock -----------------------------------------------------------

def test_low_stock_alert_fires_below_the_threshold(admin_api, material_ids):
    # Threshold is 40 chapatis. 3 kg x 12 = 36 minimum output -> alert.
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "3"},
    )
    alerts = data_of(admin_api.get("/api/inventory/alerts"))
    names = [a["raw_material_name"] for a in alerts]
    assert "Wheat flour" in names
    alert = next(a for a in alerts if a["raw_material_name"] == "Wheat flour")
    assert alert["lowest_min_output"] == "36"
    assert "Chapati" in alert["message"]


def test_no_alert_above_the_threshold(admin_api, material_ids):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "20"},
    )
    alerts = data_of(admin_api.get("/api/inventory/alerts"))
    assert "Wheat flour" not in [a["raw_material_name"] for a in alerts]


def test_the_cashier_also_sees_low_stock_alerts(cashier_api, admin_api, material_ids):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Chicken"]) + "/stock",
        json={"current_stock": "1"},
    )
    alerts = data_of(cashier_api.get("/api/inventory/alerts"))
    assert "Chicken" in [a["raw_material_name"] for a in alerts]
    # ...but cannot change stock
    assert cashier_api.post(
        "/api/inventory/materials/" + str(material_ids["Chicken"]) + "/stock",
        json={"current_stock": "99"},
    ).status_code == 403


def test_the_billing_grid_carries_the_alert_banner(cashier_api, admin_api, material_ids):
    admin_api.post(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"]) + "/stock",
        json={"current_stock": "2"},
    )
    grid = data_of(cashier_api.get("/api/menu/items/grid"))
    assert grid["low_stock_alerts"]


# --- yield configuration -------------------------------------------------

def test_max_yield_below_min_yield_is_refused(admin_api, menu_ids, material_ids):
    response = admin_api.post(
        "/api/inventory/yields",
        json={
            "menu_item_id": menu_ids["Fish Amritsari"],
            "raw_material_id": material_ids["Chicken"],
            "min_yield_per_unit": "10",
            "max_yield_per_unit": "4",
            "avg_consumption_per_dish": "0.1",
        },
    )
    assert response.status_code == 422


def test_a_material_linked_to_recipes_cannot_be_deleted(admin_api, material_ids):
    response = admin_api.delete(
        "/api/inventory/materials/" + str(material_ids["Wheat flour"])
    )
    assert response.status_code == 409
    assert "recipe" in error_of(response)["message"].lower()
