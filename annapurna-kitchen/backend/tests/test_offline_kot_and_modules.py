"""Offline queue idempotency, KOT payloads, customers, expenses, settings,
backup logging."""
from __future__ import annotations

from app.extensions import db
from app.models import Bill
from tests.conftest import data_of, error_of


# --- offline queue -------------------------------------------------------

def test_sync_replays_a_queued_sale(cashier_api, menu_ids):
    result = data_of(
        cashier_api.post(
            "/api/billing/sync",
            json={
                "operations": [
                    {
                        "client_uid": "offline-0001",
                        "order_type": "takeaway",
                        "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 3}],
                        "payments": [{"mode": "cash", "amount": "63.00"}],
                    }
                ]
            },
        )
    )
    assert result["synced"] == 1
    assert result["failed"] == 0
    assert result["results"][0]["bill"]["status"] == "paid"
    assert result["results"][0]["bill"]["total"] == "63.00"


def test_replaying_the_same_operation_does_not_duplicate_the_bill(cashier_api, menu_ids):
    operation = {
        "client_uid": "offline-dup-1",
        "order_type": "takeaway",
        "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 2}],
        "payments": [{"mode": "cash", "amount": "42.00"}],
    }
    first = data_of(cashier_api.post("/api/billing/sync", json={"operations": [operation]}))
    second = data_of(cashier_api.post("/api/billing/sync", json={"operations": [operation]}))

    assert first["synced"] == 1
    assert second["synced"] == 0
    assert second["duplicates"] == 1
    assert second["results"][0]["bill"]["id"] == first["results"][0]["bill"]["id"]
    assert db.session.query(Bill).count() == 1


def test_quick_sale_is_idempotent_on_its_client_uid(cashier_api, menu_ids):
    payload = {
        "client_uid": "quick-uid-77",
        "order_type": "takeaway",
        "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 1}],
        "payments": [{"mode": "upi", "amount": "21.00"}],
    }
    first = data_of(cashier_api.post("/api/billing/quick-sale", json=payload))
    second = data_of(cashier_api.post("/api/billing/quick-sale", json=payload))

    assert second["already_completed"] is True
    assert second["bill"]["id"] == first["bill"]["id"]
    assert db.session.query(Bill).count() == 1


def test_one_bad_operation_does_not_block_the_rest(cashier_api, menu_ids):
    result = data_of(
        cashier_api.post(
            "/api/billing/sync",
            json={
                "operations": [
                    {
                        "client_uid": "batch-bad",
                        "order_type": "takeaway",
                        "items": [{"menu_item_id": 99999, "quantity": 1}],
                        "payments": [{"mode": "cash", "amount": "10.00"}],
                    },
                    {
                        "client_uid": "batch-good",
                        "order_type": "takeaway",
                        "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 1}],
                        "payments": [{"mode": "cash", "amount": "21.00"}],
                    },
                ]
            },
        )
    )
    assert result["failed"] == 1
    assert result["synced"] == 1


def test_a_sync_failure_reports_a_reason(cashier_api, menu_ids):
    result = data_of(
        cashier_api.post(
            "/api/billing/sync",
            json={
                "operations": [
                    {
                        "client_uid": "short-pay",
                        "order_type": "takeaway",
                        "items": [{"menu_item_id": menu_ids["Chapati"], "quantity": 5}],
                        "payments": [{"mode": "cash", "amount": "1.00"}],
                    }
                ]
            },
        )
    )
    assert result["results"][0]["status"] == "failed"
    assert result["results"][0]["code"] == "payment_short"


def test_an_order_replayed_with_the_same_uid_is_not_duplicated(cashier_api, menu_ids):
    body = {"order_type": "takeaway", "client_uid": "order-uid-1"}
    first = data_of(cashier_api.post("/api/orders", json=body))
    second = data_of(cashier_api.post("/api/orders", json=body))
    assert first["id"] == second["id"]


# --- KOT -----------------------------------------------------------------

def test_kot_contains_what_the_kitchen_needs(cashier_api, menu_ids, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 2, "note": "Less oil"},
    )
    kot = data_of(cashier_api.post("/api/orders/" + str(order["id"]) + "/kot"))["kot"]

    assert kot["order_number"]
    assert kot["order_type"] == "dine_in"
    assert kot["table_number"] == "5"
    assert kot["printed_at"]
    assert kot["kot_sequence"] == 1
    assert kot["items"][0]["quantity"] == 2
    assert kot["items"][0]["note"] == "Less oil"
    assert kot["items"][0]["category"] == "Breads"


def test_a_second_kot_only_fires_the_new_lines(cashier_api, menu_ids, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 2},
    )
    cashier_api.post("/api/orders/" + str(order["id"]) + "/kot")

    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Butter Chicken"], "quantity": 1},
    )
    second = data_of(cashier_api.post("/api/orders/" + str(order["id"]) + "/kot"))["kot"]
    assert [i["name"] for i in second["items"]] == ["Butter Chicken"]
    assert second["kot_sequence"] == 2


def test_sending_a_kot_with_nothing_new_is_refused(cashier_api, menu_ids, table_ids):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 1},
    )
    cashier_api.post("/api/orders/" + str(order["id"]) + "/kot")
    response = cashier_api.post("/api/orders/" + str(order["id"]) + "/kot")
    assert response.status_code == 409
    assert error_of(response)["code"] == "nothing_to_send"


def test_kot_can_be_reprinted_in_full_after_a_printer_failure(
    cashier_api, menu_ids, table_ids
):
    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 2},
    )
    cashier_api.post("/api/orders/" + str(order["id"]) + "/kot")

    reprint = data_of(cashier_api.get("/api/orders/" + str(order["id"]) + "/kot"))
    assert reprint["is_reprint"] is True
    assert len(reprint["items"]) == 1


# --- customers -----------------------------------------------------------

def test_cashier_can_search_and_add_a_customer_during_billing(cashier_api):
    found = data_of(cashier_api.get("/api/customers/search?q=9840"))
    assert found[0]["name"] == "Ramesh Iyer"

    created = data_of(
        cashier_api.post("/api/customers", json={"name": "New Guest", "phone": "9000011111"})
    )
    assert created["phone"] == "9000011111"


def test_adding_an_existing_phone_returns_that_customer(cashier_api):
    response = cashier_api.post(
        "/api/customers", json={"name": "Someone Else", "phone": "9840012345"}
    )
    assert response.status_code == 200
    assert response.get_json()["existing"] is True


def test_customer_phone_is_validated(cashier_api):
    assert cashier_api.post(
        "/api/customers", json={"name": "Bad", "phone": "123"}
    ).status_code == 422


def test_customer_history_records_their_bills(
    admin_api, cashier_api, menu_ids, table_ids
):
    customer = data_of(cashier_api.get("/api/customers/search?q=Ramesh"))[0]
    order = data_of(
        cashier_api.post(
            "/api/orders",
            json={
                "order_type": "dine_in",
                "table_id": table_ids["1"],
                "customer_id": customer["id"],
            },
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 5},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    cashier_api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": "cash", "amount": bill["total"]}]},
    )

    history = data_of(admin_api.get("/api/customers/" + str(customer["id"]) + "/history"))
    assert history["customer"]["order_count"] == 1
    assert history["customer"]["total_spent"] == "105.00"
    assert len(history["bills"]) == 1


# --- expenses ------------------------------------------------------------

def test_expense_crud(admin_api):
    created = data_of(
        admin_api.post(
            "/api/expenses",
            json={"description": "Gas cylinder", "category": "Gas", "amount": "1900.00"},
        )
    )
    updated = data_of(
        admin_api.put("/api/expenses/" + str(created["id"]), json={"amount": "2000.00"})
    )
    assert updated["amount"] == "2000.00"

    listing = admin_api.get("/api/expenses").get_json()
    assert listing["total_amount"] == "2000.00"

    assert admin_api.delete("/api/expenses/" + str(created["id"])).status_code == 200
    assert admin_api.get("/api/expenses").get_json()["meta"]["total"] == 0


def test_expense_amount_must_be_positive(admin_api):
    assert admin_api.post(
        "/api/expenses", json={"description": "X", "amount": "0"}
    ).status_code == 422


# --- settings ------------------------------------------------------------

def test_settings_round_trip(admin_api):
    data_of(
        admin_api.put(
            "/api/settings",
            json={
                "settings": {
                    "business.name": "Annapurna Kitchen Coimbatore",
                    "tax.gst_rate": "12.00",
                }
            },
        )
    )
    settings = data_of(admin_api.get("/api/settings"))
    assert settings["flat"]["business.name"] == "Annapurna Kitchen Coimbatore"
    assert settings["flat"]["tax.gst_rate"] == "12.00"
    assert settings["nested"]["business"]["name"] == "Annapurna Kitchen Coimbatore"


def test_changing_the_gst_rate_changes_new_bills(
    admin_api, cashier_api, menu_ids, table_ids
):
    admin_api.put("/api/settings", json={"settings": {"tax.gst_rate": "18.00"}})

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
    assert bill["cgst_rate"] == "9.00"
    assert bill["cgst"] == "18.00"
    assert bill["total"] == "236.00"


def test_inclusive_tax_mode_is_honoured(admin_api, cashier_api, menu_ids, table_ids):
    admin_api.put("/api/settings", json={"settings": {"tax.mode": "inclusive"}})

    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["1"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 21},
    )
    bill = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]
    assert bill["subtotal"] == "420.00"
    assert bill["total"] == "420.00"  # price already contains the tax
    assert bill["taxable_value"] == "400.00"
    assert bill["cgst"] == "10.00"


def test_an_invalid_gst_rate_is_refused(admin_api):
    assert admin_api.put(
        "/api/settings", json={"settings": {"tax.gst_rate": "250"}}
    ).status_code == 422
    assert admin_api.put(
        "/api/settings", json={"settings": {"tax.mode": "sideways"}}
    ).status_code == 422


def test_printer_test_payload_is_available(admin_api):
    payload = data_of(admin_api.post("/api/settings/printer/test"))
    assert payload["kind"] == "test"
    assert payload["lines"]
    assert payload["paper_width"] in ("58", "80")


def test_cashier_reads_public_settings_only(cashier_api):
    public = data_of(cashier_api.get("/api/settings/public"))
    assert "business.name" in public["flat"]
    assert not any(key.startswith("inventory.") for key in public["flat"])


# --- backup --------------------------------------------------------------

def test_backup_attempt_is_logged_even_when_it_fails(admin_api, app):
    """The suite runs on an in-memory database, which cannot be dumped -
    the point is that the failure surfaces instead of passing silently."""
    response = admin_api.post("/api/backup/run")
    assert response.status_code in (201, 500)

    listing = data_of(admin_api.get("/api/backup"))
    assert listing["backups"], "the attempt must be recorded either way"
    assert listing["backups"][0]["status"] in ("success", "failed")
    if listing["backups"][0]["status"] == "failed":
        assert listing["backups"][0]["message"]
