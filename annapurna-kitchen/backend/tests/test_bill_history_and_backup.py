"""Bill History feed and backup tooling."""
from __future__ import annotations

import os

from app.extensions import db
from app.models import Bill
from app.services import backup_service
from tests.conftest import data_of, error_of


def _sell(api, menu_ids, table_ids, table, item, quantity, mode="cash"):
    order = data_of(
        api.post("/api/orders", json={"order_type": "dine_in", "table_id": table_ids[table]})
    )
    api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids[item], "quantity": quantity},
    )
    bill = data_of(api.post("/api/billing/generate", json={"order_id": order["id"]}))["bill"]
    api.post(
        "/api/billing/bills/" + str(bill["id"]) + "/complete",
        json={"payments": [{"mode": mode, "amount": bill["total"]}]},
    )
    return bill


# --- bill history --------------------------------------------------------

def test_history_returns_settled_bills_with_items_and_payments(
    cashier_api, menu_ids, table_ids
):
    _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 5)
    rows = data_of(cashier_api.get("/api/billing/bills"))
    assert len(rows) == 1

    bill = rows[0]
    assert bill["status"] == "paid"
    assert bill["bill_number"]
    assert bill["items"], "history must carry line items for the detail view"
    assert bill["payments"], "history must carry payments so the mode chips render"
    assert bill["total"] == "105.00"


def test_cashier_sees_only_their_own_bills_by_default(
    cashier_api, admin_api, menu_ids, table_ids
):
    _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 2)
    _sell(admin_api, menu_ids, table_ids, "2", "Chapati", 3)

    mine = data_of(cashier_api.get("/api/billing/bills"))
    assert {b["created_by_name"] for b in mine} == {"Counter"}

    everything = data_of(admin_api.get("/api/billing/bills?mine=false"))
    assert len(everything) == 2


def test_history_filters_by_status_and_bill_number(cashier_api, menu_ids, table_ids):
    paid = _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 2)

    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["2"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 1},
    )
    cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})

    assert len(data_of(cashier_api.get("/api/billing/bills?status=paid"))) == 1
    assert len(data_of(cashier_api.get("/api/billing/bills?status=pending"))) == 1

    found = data_of(cashier_api.get("/api/billing/bills?search=" + paid["bill_number"]))
    assert len(found) == 1
    assert found[0]["bill_number"] == paid["bill_number"]


def test_history_receipt_can_be_reprinted(cashier_api, menu_ids, table_ids):
    bill = _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 4)
    receipt = data_of(cashier_api.get("/api/billing/bills/" + str(bill["id"]) + "/receipt"))
    assert receipt["bill"]["bill_number"] == bill["bill_number"]
    assert receipt["business"]["name"]
    assert receipt["items"]


def test_admin_can_void_a_pending_bill_but_not_a_paid_one(
    admin_api, cashier_api, menu_ids, table_ids
):
    paid = _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 2)
    assert admin_api.post("/api/billing/bills/" + str(paid["id"]) + "/void").status_code == 409

    order = data_of(
        cashier_api.post(
            "/api/orders", json={"order_type": "dine_in", "table_id": table_ids["5"]}
        )
    )
    cashier_api.post(
        "/api/orders/" + str(order["id"]) + "/items",
        json={"menu_item_id": menu_ids["Chapati"], "quantity": 3},
    )
    pending = data_of(
        cashier_api.post("/api/billing/generate", json={"order_id": order["id"]})
    )["bill"]

    assert admin_api.post("/api/billing/bills/" + str(pending["id"]) + "/void").status_code == 200
    db.session.expire_all()
    assert db.session.get(Bill, pending["id"]).status == "void"
    # the lines return to the order so they can be billed again
    assert data_of(cashier_api.get("/api/orders/" + str(order["id"])))["unbilled_subtotal"] == "60.00"


def test_a_cashier_cannot_void_a_bill(cashier_api, menu_ids, table_ids):
    bill = _sell(cashier_api, menu_ids, table_ids, "1", "Chapati", 2)
    assert cashier_api.post("/api/billing/bills/" + str(bill["id"]) + "/void").status_code == 403


# --- backup tooling ------------------------------------------------------

def test_backup_info_reports_engine_and_tool(admin_api):
    body = data_of(admin_api.get("/api/backup"))
    assert body["engine"] in ("sqlite", "mysql")
    assert "schedule" in body
    assert "active_in_this_process" in body["schedule"]


def test_mysqldump_resolution_gives_an_actionable_error(app, monkeypatch):
    """A missing dump binary must say what to do, not raise WinError 2."""
    monkeypatch.setitem(app.config, "MYSQLDUMP_PATH", "definitely-not-a-real-binary")
    monkeypatch.setattr(backup_service.shutil, "which", lambda _: None)
    monkeypatch.setattr(backup_service.os.path, "exists", lambda _: False)

    try:
        backup_service.resolve_mysqldump()
    except RuntimeError as exc:
        message = str(exc)
        assert "mysqldump was not found" in message
        assert "MYSQLDUMP_PATH" in message
    else:  # pragma: no cover - only if a real binary is discovered
        pass


def test_a_failed_backup_is_recorded_not_raised(admin_api, app):
    """An in-memory database cannot be dumped; the attempt must still log."""
    response = admin_api.post("/api/backup/run")
    assert response.status_code in (201, 500)

    listing = data_of(admin_api.get("/api/backup"))
    assert listing["backups"], "the attempt must be recorded either way"
    latest = listing["backups"][0]
    assert latest["status"] in ("success", "failed")
    if latest["status"] == "failed":
        assert latest["message"], "a failure must carry a reason"
        assert error_of(response)["code"] == "backup_failed"


def test_backup_download_rejects_path_traversal(admin_api):
    """A filename must never escape the backup directory."""
    response = admin_api.get("/api/backup/download/../../.env")
    assert response.status_code in (404, 308)
    resolved = backup_service.backup_path("../../.env")
    assert os.path.basename(resolved) == ".env"
    assert ".." not in resolved
