"""Table lifecycle (empty/occupied/bill-pending, merge, split, release)
and every payment mode including split tenders."""
from __future__ import annotations

from decimal import Decimal

from app.extensions import db
from app.models import Bill, Order
from tests.conftest import data_of, error_of


def _order(api, table_id, menu_ids, name="Chapati", quantity=2):
    order = data_of(
        api.post("/api/orders", json={"order_type": "dine_in", "table_id": table_id})
    )
    api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids[name], "quantity": quantity},
    )
    return order


def _status(api, table_id):
    return data_of(api.get("/api/tables/" + str(table_id)))["status"]


# --- lifecycle -----------------------------------------------------------

def test_tables_start_empty(cashier_api):
    tables = data_of(cashier_api.get("/api/tables"))
    assert tables
    assert all(t["status"] == "empty" for t in tables)


def test_lifecycle_empty_to_occupied_to_bill_pending_to_empty(
    cashier_api, menu_ids, table_ids
):
    table_id = table_ids["5"]
    assert _status(cashier_api, table_id) == "empty"

    order = _order(cashier_api, table_id, menu_ids)
    assert _status(cashier_api, table_id) == "occupied"

    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert _status(cashier_api, table_id) == "bill_pending"

    cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": bill["total"]}]},
    )
    assert _status(cashier_api, table_id) == "empty"


def test_assigning_an_already_occupied_table_returns_the_open_order(
    cashier_api, menu_ids, table_ids
):
    order = _order(cashier_api, table_ids["1"], menu_ids)
    again = data_of(cashier_api.post("/api/tables/" + str(table_ids["1"]) + "/assign"))
    assert again["created"] is False
    assert again["order"]["id"] == order["id"]


def test_a_second_order_cannot_be_opened_on_a_busy_table(cashier_api, menu_ids, table_ids):
    _order(cashier_api, table_ids["1"], menu_ids)
    response = cashier_api.post(
        "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
    )
    assert response.status_code == 409
    assert error_of(response)["code"] == "table_busy"


def test_release_refuses_while_the_order_is_unsettled(cashier_api, menu_ids, table_ids):
    _order(cashier_api, table_ids["2"], menu_ids)
    response = cashier_api.post("/api/tables/" + str(table_ids["2"]) + "/release")
    assert response.status_code == 409


def test_table_counts_are_reported(cashier_api, menu_ids, table_ids):
    _order(cashier_api, table_ids["1"], menu_ids)
    body = cashier_api.get("/api/tables").get_json()
    assert body["counts"]["occupied"] == 1
    assert body["counts"]["empty"] == len(body["data"]) - 1


# --- merge ---------------------------------------------------------------

def test_merging_two_tables_into_one_bill(cashier_api, menu_ids, table_ids):
    first = _order(cashier_api, table_ids["1"], menu_ids, quantity=2)   # 40.00
    second = _order(cashier_api, table_ids["2"], menu_ids, quantity=3)  # 60.00

    merged = data_of(
        cashier_api.post(
            "/api/tables/merge",
            json={"target_order_id": first["id"], "source_order_id": second["id"]},
        )
    )
    assert merged["order"]["subtotal"] == "100.00"
    assert len(merged["order"]["items"]) == 2

    # The source table is freed, the target keeps the group.
    assert _status(cashier_api, table_ids["2"]) == "empty"
    assert _status(cashier_api, table_ids["1"]) == "occupied"

    source = db.session.get(Order, second["id"])
    assert source.status == "merged"
    assert source.merged_into_order_id == first["id"]

    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": first["id"]})
    )["bill"]
    assert bill["subtotal"] == "100.00"


def test_an_order_cannot_be_merged_into_itself(cashier_api, menu_ids, table_ids):
    order = _order(cashier_api, table_ids["1"], menu_ids)
    response = cashier_api.post(
        "/api/tables/merge",
        json={"target_order_id": order["id"], "source_order_id": order["id"]},
    )
    assert response.status_code == 422


def test_a_billed_order_cannot_be_merged(cashier_api, menu_ids, table_ids):
    first = _order(cashier_api, table_ids["1"], menu_ids)
    second = _order(cashier_api, table_ids["2"], menu_ids)
    cashier_api.post("/api/billing/generate", json={"order_id": second["id"]})

    response = cashier_api.post(
        "/api/tables/merge",
        json={"target_order_id": first["id"], "source_order_id": second["id"]},
    )
    assert response.status_code == 409


# --- split ---------------------------------------------------------------

def test_splitting_one_table_into_two_bills(cashier_api, menu_ids, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 4},
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Butter Chicken"], "quantity": 1},
    )
    full = data_of(cashier_api.get("/api/orders/" + str(order["id"])))
    chapati_line = next(i for i in full["items"] if i["name"] == "Chapati")
    chicken_line = next(i for i in full["items"] if i["name"] == "Butter Chicken")

    result = data_of(
        cashier_api.post(
            "/api/tables/split",
            json={
                "order_id": order["id"],
                "groups": [
                    {"order_item_ids": [chapati_line["id"]]},
                    {"order_item_ids": [chicken_line["id"]]},
                ],
            },
        )
    )
    bills = result["bills"]
    assert len(bills) == 2
    assert {b["subtotal"] for b in bills} == {"80.00", "360.00"}
    assert {b["total"] for b in bills} == {"84.00", "378.00"}
    assert _status(cashier_api, table_ids["5"]) == "bill_pending"

    # Each split bill is paid separately; the table frees only when both land.
    cashier_api.post(
        "/api/billing/bills/" + str(bills[0]["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": bills[0]["total"]}]},
    )
    assert _status(cashier_api, table_ids["5"]) == "bill_pending"

    cashier_api.post(
        "/api/billing/bills/" + str(bills[1]["id"]) + "/complete",
        json={"payments": [{"mode": "card", "amount": bills[1]["total"]}]},
    )
    assert _status(cashier_api, table_ids["5"]) == "empty"


def test_an_item_cannot_appear_in_two_split_groups(cashier_api, menu_ids, table_ids):
    order = _order(cashier_api, table_ids["5"], menu_ids)
    full = data_of(cashier_api.get("/api/orders/" + str(order["id"])))
    line_id = full["items"][0]["id"]

    response = cashier_api.post(
        "/api/tables/split",
        json={
            "order_id": order["id"],
            "groups": [{"order_item_ids": [line_id]}, {"order_item_ids": [line_id]}],
        },
    )
    assert response.status_code == 422


def test_a_split_needs_at_least_two_groups(cashier_api, menu_ids, table_ids):
    order = _order(cashier_api, table_ids["5"], menu_ids)
    full = data_of(cashier_api.get("/api/orders/" + str(order["id"])))
    response = cashier_api.post(
        "/api/tables/split",
        json={
            "order_id": order["id"],
            "groups": [{"order_item_ids": [full["items"][0]["id"]]}],
        },
    )
    assert response.status_code == 422


# --- payments ------------------------------------------------------------

def _pending_bill(api, menu_ids, table_ids, table="1", quantity=2):
    order = _order(api, table_ids[table], menu_ids, quantity=quantity)
    return data_of(api.post("/api/billing/generate", json={"order_id": order["id"]}))["bill"]


def test_cash_payment(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={"payments": [{"mode": "cash", "amount": bill["total"]}]},
        )
    )
    assert result["bill"]["status"] == "paid"


def test_card_payment(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids, table="2")
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={"payments": [{"mode": "card", "amount": bill["total"], "reference": "XXXX4411"}]},
        )
    )
    assert result["bill"]["payments"][0]["mode"] == "card"
    assert result["bill"]["payments"][0]["reference"] == "XXXX4411"


def test_upi_payment(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids, table="5")
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={"payments": [{"mode": "upi", "amount": bill["total"], "reference": "UPI-771"}]},
        )
    )
    assert result["bill"]["payments"][0]["mode"] == "upi"


def test_split_payment_across_three_modes(cashier_api, menu_ids, table_ids):
    # 20 chapatis = 400.00 + 5% = 420.00
    bill = _pending_bill(cashier_api, menu_ids, table_ids, table="6", quantity=20)
    assert bill["total"] == "420.00"

    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={
                "payments": [
                    {"mode": "cash", "amount": "200.00"},
                    {"mode": "card", "amount": "120.00"},
                    {"mode": "upi", "amount": "100.00"},
                ]
            },
        )
    )
    assert result["bill"]["status"] == "paid"
    assert result["bill"]["amount_paid"] == "420.00"
    assert len(result["bill"]["payments"]) == 3


def test_a_short_payment_is_refused(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    response = cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": "1.00"}]},
    )
    assert response.status_code == 422
    error = error_of(response)
    assert error["code"] == "payment_short"
    assert error["details"]["shortfall"]


def test_an_over_payment_is_refused(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    response = cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": "9999.00"}]},
    )
    assert response.status_code == 422
    assert error_of(response)["code"] == "payment_excess"


def test_cash_change_is_computed_from_the_tendered_amount(
    cashier_api, menu_ids, table_ids
):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)  # 42.00
    result = data_of(
        cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={
                "payments": [
                    {"mode": "cash", "amount": bill["total"], "tendered": "100.00"}
                ]
            },
        )
    )
    payment = result["bill"]["payments"][0]
    assert payment["tendered"] == "100.00"
    assert payment["change_given"] == str(Decimal("100.00") - Decimal(bill["total"]))


def test_tendering_less_than_the_cash_amount_is_refused(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    response = cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": bill["total"], "tendered": "1.00"}]},
    )
    assert response.status_code == 422


def test_an_unsupported_payment_mode_is_refused(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    response = cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "crypto", "amount": bill["total"]}]},
    )
    assert response.status_code == 422


def test_zero_and_negative_amounts_are_refused(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids)
    for amount in ("0", "-50"):
        response = cashier_api.post(
            "/api/billing/bills/" + str(bill["id"]) + "/complete",
            json={"payments": [{"mode": "cash", "amount": amount}]},
        )
        assert response.status_code == 422


def test_payment_validation_endpoint_previews_the_balance(
    cashier_api, menu_ids, table_ids
):
    bill = _pending_bill(cashier_api, menu_ids, table_ids, quantity=20)
    result = data_of(
        cashier_api.post(
            "/api/payments/validate",
            json={
                "bill_id": bill["id"],
                "payments": [{"mode": "cash", "amount": "300.00"}],
            },
        )
    )
    assert result["bill_total"] == "420.00"
    assert result["balance"] == "120.00"
    assert result["settles"] is False


def test_a_partial_tender_leaves_the_bill_pending(cashier_api, menu_ids, table_ids):
    bill = _pending_bill(cashier_api, menu_ids, table_ids, quantity=20)
    result = data_of(
        cashier_api.post(
            "/api/payments/bill/" + str(bill["id"]),
            json={"payments": [{"mode": "cash", "amount": "200.00"}]},
        )
    )
    assert result["status"] == "pending"
    assert result["balance_due"] == "220.00"
    assert db.session.get(Bill, bill["id"]).status == "pending"
