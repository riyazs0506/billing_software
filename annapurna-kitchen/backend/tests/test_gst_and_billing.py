"""GST arithmetic, bill generation and the end-to-end acceptance scenario."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.extensions import db
from app.models import Bill, MenuItem, RawMaterial
from app.services import gst_calculator
from tests.conftest import data_of, error_of


# --- pure calculator -----------------------------------------------------

def test_exclusive_gst_matches_a_manual_calculation():
    # 2 chapatis @ 20 + 1 butter chicken @ 360 = 400.00, 5% GST, no discount
    totals = gst_calculator.calculate_totals(
        [Decimal("40.00"), Decimal("360.00")], gst_rate="5.00", discount_percentage="0"
    )
    assert totals.subtotal == Decimal("400.00")
    assert totals.discount_applied == Decimal("0.00")
    assert totals.taxable_value == Decimal("400.00")
    assert totals.cgst_rate == Decimal("2.50")
    assert totals.sgst_rate == Decimal("2.50")
    assert totals.cgst == Decimal("10.00")
    assert totals.sgst == Decimal("10.00")
    assert totals.total == Decimal("420.00")


def test_discount_is_applied_before_gst():
    totals = gst_calculator.calculate_totals(
        [Decimal("400.00")], gst_rate="5.00", discount_percentage="10"
    )
    assert totals.discount_applied == Decimal("40.00")
    assert totals.taxable_value == Decimal("360.00")  # discount first
    assert totals.cgst == Decimal("9.00")
    assert totals.sgst == Decimal("9.00")
    assert totals.total == Decimal("378.00")


def test_inclusive_pricing_keeps_the_charged_amount_unchanged():
    totals = gst_calculator.calculate_totals(
        [Decimal("420.00")], gst_rate="5.00", tax_mode="inclusive"
    )
    assert totals.total == Decimal("420.00")
    assert totals.taxable_value == Decimal("400.00")
    assert totals.cgst == Decimal("10.00")
    assert totals.sgst == Decimal("10.00")
    # The printed lines add back up to the amount charged.
    assert totals.taxable_value + totals.cgst + totals.sgst == totals.total


def test_tax_can_be_switched_off_entirely():
    totals = gst_calculator.calculate_totals([Decimal("400.00")], tax_enabled=False)
    assert totals.cgst == Decimal("0.00")
    assert totals.sgst == Decimal("0.00")
    assert totals.total == Decimal("400.00")


def test_rounding_is_half_up_at_two_places():
    # 99.99 x 5% = 4.9995 -> split 2.4998 / 2.4998, each rounds to 2.50
    totals = gst_calculator.calculate_totals([Decimal("99.99")], gst_rate="5.00")
    assert totals.cgst == Decimal("2.50")
    assert totals.sgst == Decimal("2.50")
    assert totals.total == Decimal("104.99")


def test_no_float_artifacts_creep_in():
    totals = gst_calculator.calculate_totals(
        [Decimal("0.10"), Decimal("0.20")], gst_rate="18.00"
    )
    assert totals.subtotal == Decimal("0.30")
    assert str(totals.subtotal) == "0.30"


# --- API level -----------------------------------------------------------

def _open_order(api, table_id, menu_ids, lines):
    order = data_of(
        api.post("/api/orders", json={"order_type": "dine_in", "table_id": table_id})
    )
    for name, quantity in lines:
        api.post(
            "/api/orders/" + str(order["id"]) + "/items",
            json={"menu_item_id": menu_ids[name], "quantity": quantity},
        )
    return order


def test_calculate_preview_matches_the_generated_bill(cashier_api, menu_ids, table_ids):
    order = _open_order(
        cashier_api, table_ids["5"], menu_ids, [("Chapati", 2), ("Butter Chicken", 1)]
    )
    preview = data_of(
        cashier_api.post("/api/billing/calculate", json={"order_id": order["id"]})
    )
    assert preview["totals"]["subtotal"] == "400.00"
    assert preview["totals"]["total"] == "420.00"

    generated = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )
    assert generated["bill"]["subtotal"] == preview["totals"]["subtotal"]
    assert generated["bill"]["total"] == preview["totals"]["total"]
    assert generated["bill"]["cgst"] == "10.00"
    assert generated["bill"]["sgst"] == "10.00"
    assert generated["bill"]["status"] == "pending"
    assert generated["bill"]["bill_number"]


def test_full_acceptance_scenario(cashier_api, menu_ids, table_ids, material_ids):
    """Dine-in on table 5 -> KOT -> bill -> split payment -> stock + table."""
    wheat_before = db.session.get(RawMaterial, material_ids["Wheat flour"]).current_stock
    chicken_before = db.session.get(RawMaterial, material_ids["Chicken"]).current_stock

    order = _open_order(
        cashier_api, table_ids["5"], menu_ids, [("Chapati", 2), ("Butter Chicken", 1)]
    )

    # table 5 becomes occupied
    table = data_of(cashier_api.get("/api/tables/" + str(table_ids["5"])))
    assert table["status"] == "occupied"

    # KOT
    kot = data_of(cashier_api.post("/api/orders/" + str(order["id"]) + "/kot"))
    assert kot["kot"]["table_number"] == "5"
    assert {i["name"] for i in kot["kot"]["items"]} == {"Chapati", "Butter Chicken"}
    assert kot["order"]["status"] == "kot_sent"

    # Bill
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert bill["total"] == "420.00"

    table = data_of(cashier_api.get("/api/tables/" + str(table_ids["5"])))
    assert table["status"] == "bill_pending"

    # Split payment: 500 was the spec example; here the bill is 420 so
    # 300 cash + 120 UPI settles it exactly.
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={
                "payments": [
                    {"mode": "cash", "amount": "300.00", "tendered": "500.00"},
                    {"mode": "upi", "amount": "120.00", "reference": "UPI-9931"},
                ]
            },
        )
    )
    assert result["bill"]["status"] == "paid"
    assert result["bill"]["balance_due"] == "0.00"
    assert {p["mode"] for p in result["bill"]["payments"]} == {"cash", "upi"}
    cash = next(p for p in result["bill"]["payments"] if p["mode"] == "cash")
    assert cash["change_given"] == "200.00"

    # Receipt has everything the printer needs
    receipt = result["receipt"]
    assert receipt["business"]["gstin"]
    assert receipt["order"]["table_number"] == "5"
    assert receipt["bill"]["cgst"] == "10.00"
    assert len(receipt["items"]) == 2

    # Table 5 released
    table = data_of(cashier_api.get("/api/tables/" + str(table_ids["5"])))
    assert table["status"] == "empty"

    # Stock deducted: 2 chapatis x 0.075 kg, 1 butter chicken x 0.075 kg
    wheat_after = db.session.get(RawMaterial, material_ids["Wheat flour"]).current_stock
    chicken_after = db.session.get(RawMaterial, material_ids["Chicken"]).current_stock
    assert Decimal(str(wheat_before)) - Decimal(str(wheat_after)) == Decimal("0.150")
    assert Decimal(str(chicken_before)) - Decimal(str(chicken_after)) == Decimal("0.075")


def test_takeaway_needs_no_table(cashier_api, menu_ids):
    order = data_of(cashier_api.post("/api/orders", json={"order_type": "takeaway"}))
    assert order["table_id"] is None
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 4},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert bill["subtotal"] == "80.00"
    assert bill["order_type"] == "takeaway"


def test_dine_in_without_a_table_is_rejected(cashier_api):
    response = cashier_api.post("/api/orders", json={"order_type": "dine_in"})
    assert response.status_code == 422


def test_unavailable_items_cannot_be_ordered(cashier_api, menu_ids, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    response = cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Fish Amritsari"], "quantity": 1},
    )
    assert response.status_code == 409
    assert error_of(response)["code"] == "item_unavailable"


def test_an_empty_order_cannot_be_billed(cashier_api, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["2"]}
        )
    )
    response = cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    assert response.status_code == 409
    assert error_of(response)["code"] == "nothing_to_bill"


def test_price_is_frozen_at_order_time(cashier_api, admin_api, menu_ids, table_ids):
    order = _open_order(cashier_api, table_ids["1"], menu_ids, [("Chapati", 2)])

    admin_api.put(
        "/api/menu/items/" + str(menu_ids["Chapati"]), json={"price": "30.00"}
    )

    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert bill["subtotal"] == "40.00"  # still the price when it was ordered


def test_quick_sale_does_order_bill_and_payment_in_one_call(cashier_api, menu_ids):
    result = data_of(
        cashier_api.post(
            "/api/billing/quick-sale",
            json={
                "order_type": "takeaway",
                "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 5}],
                "payments": [{"mode": "cash", "amount": "105.00"}],
            },
        )
    )
    assert result["bill"]["status"] == "paid"
    assert result["bill"]["subtotal"] == "100.00"
    assert result["bill"]["total"] == "105.00"


def test_a_failed_completion_rolls_everything_back(
    cashier_api, menu_ids, table_ids, material_ids
):
    """A short payment must leave no stock deduction and no paid bill."""
    stock_before = db.session.get(RawMaterial, material_ids["Wheat flour"]).current_stock
    order = _open_order(cashier_api, table_ids["6"], menu_ids, [("Chapati", 4)])
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]

    response = cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": "10.00"}]},
    )
    assert response.status_code == 422
    assert error_of(response)["code"] == "payment_short"

    db.session.expire_all()
    assert db.session.get(Bill, bill["id"]).status == "pending"
    assert db.session.get(Bill, bill["id"]).payments == []
    assert (
        db.session.get(RawMaterial, material_ids["Wheat flour"]).current_stock
        == stock_before
    )
