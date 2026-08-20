"""Bill calculation, generation, payment completion and receipt data.

``POST /api/billing/bills/<id>/complete`` is the atomic transaction described
in section 37 of the build spec. Everything between the first write and the
commit either lands together or is rolled back together.
"""
from __future__ import annotations

from datetime import datetime

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin, current_user
from ..models import BILL_PAID, BILL_PENDING, Bill, Order
from ..services import billing_service, discount_engine, order_service
from ..utils.responses import ApiError, ok
from ..utils.validators import as_int, as_string, require

bp = Blueprint("billing", __name__, url_prefix="/api/billing")


def _get_bill(bill_id: int) -> Bill:
    row = db.session.get(Bill, bill_id)
    if row is None:
        raise ApiError("Bill not found.", status=404, code="not_found")
    return row


# --- preview -------------------------------------------------------------

@bp.post("/calculate")
@cashier_or_admin
def calculate():
    """Live totals for the bottom bar: subtotal, discount, CGST, SGST, total."""
    payload = require(request.get_json(silent=True), "order_id")
    order = order_service.get_order_or_404(as_int(payload["order_id"], "order_id", minimum=1))
    item_ids = payload.get("order_item_ids")
    return ok(billing_service.calculate(order, item_ids))


@bp.get("/active-discount")
@cashier_or_admin
def active_discount():
    """What the discount engine would apply right now."""
    active = discount_engine.evaluate()
    return ok(active.to_dict())


@bp.get("/tax-config")
@cashier_or_admin
def tax_config():
    return ok(billing_service.tax_config())


# --- generation ----------------------------------------------------------

@bp.post("/generate")
@cashier_or_admin
def generate():
    """The primary POS action. One call, no confirmation round-trip."""
    payload = require(request.get_json(silent=True), "order_id")
    order = order_service.get_order_or_404(as_int(payload["order_id"], "order_id", minimum=1))

    bill = billing_service.generate_bill(
        order,
        user_id=current_user().id,
        order_item_ids=payload.get("order_item_ids"),
        customer_id=payload.get("customer_id"),
    )
    db.session.commit()
    return ok(
        {
            "bill": bill.to_dict(with_items=True),
            "order": order.to_dict(with_items=True, with_bills=True),
            "receipt": billing_service.receipt_payload(bill),
        },
        status=201,
    )


# --- completion (atomic) -------------------------------------------------

@bp.post("/bills/<int:bill_id>/complete")
@cashier_or_admin
def complete(bill_id: int):
    """Validate tender, record payments, deduct stock, release the table."""
    bill = _get_bill(bill_id)
    payload = require(request.get_json(silent=True), "payments")
    payments = payload["payments"]
    if not isinstance(payments, list):
        raise ApiError("payments must be a list.", status=422, code="validation_error")

    try:
        result = billing_service.complete_bill(
            bill,
            payments,
            user_id=current_user().id,
            client_uid=payload.get("client_uid"),
        )
        db.session.commit()
    except Exception:
        # Nothing partial survives: no half-deducted stock, no orphan payment.
        db.session.rollback()
        raise

    db.session.refresh(bill)
    result["receipt"] = billing_service.receipt_payload(bill)
    result["order"] = bill.order.to_dict(with_items=True, with_bills=True)
    result["table"] = bill.order.table.to_dict() if bill.order.table else None
    return ok(result)


@bp.post("/quick-sale")
@cashier_or_admin
def quick_sale():
    """Order -> bill -> payment in a single call.

    This is what the counter uses for takeaway and what the offline queue
    replays, so it carries the idempotency key end to end.
    """
    payload = require(request.get_json(silent=True), "order_type", "items", "payments")
    client_uid = payload.get("client_uid")

    if client_uid:
        twin = db.session.query(Bill).filter_by(client_uid=client_uid).first()
        if twin is not None:
            return ok(
                {
                    "bill": twin.to_dict(with_items=True),
                    "receipt": billing_service.receipt_payload(twin),
                    "already_completed": True,
                },
                status=200,
            )

    try:
        order = order_service.create_order(
            order_type=payload["order_type"],
            user_id=current_user().id,
            table_id=payload.get("table_id"),
            customer_id=payload.get("customer_id"),
            note=payload.get("note"),
            client_uid=(client_uid + "-order") if client_uid else None,
        )
        for line in payload["items"]:
            order_service.add_item(
                order,
                as_int(line.get("menu_item_id"), "menu_item_id", minimum=1),
                as_int(line.get("quantity", 1), "quantity", minimum=1),
                note=line.get("note"),
            )
        if payload.get("send_kot", True):
            try:
                order_service.send_kot(order)
            except ApiError:
                pass  # nothing new to fire is not a failure here

        bill = billing_service.generate_bill(order, user_id=current_user().id)
        result = billing_service.complete_bill(
            bill,
            payload["payments"],
            user_id=current_user().id,
            client_uid=client_uid,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    db.session.refresh(bill)
    result["receipt"] = billing_service.receipt_payload(bill)
    result["order"] = bill.order.to_dict(with_items=True)
    return ok(result, status=201)


# --- reading bills -------------------------------------------------------

@bp.get("/bills")
@cashier_or_admin
def list_bills():
    query = db.session.query(Bill)
    user = current_user()

    if request.args.get("status"):
        query = query.filter(Bill.status == request.args["status"])
    if request.args.get("order_id"):
        query = query.filter(Bill.order_id == int(request.args["order_id"]))
    if request.args.get("search"):
        query = query.filter(Bill.bill_number.like("%" + request.args["search"] + "%"))
    if request.args.get("date"):
        day = datetime.strptime(request.args["date"], "%Y-%m-%d").date()
        query = query.filter(db.func.date(Bill.created_at) == day)

    # A cashier sees the counter's own recent bills; the full ledger is admin.
    if not user.is_admin and request.args.get("mine", "true") != "false":
        query = query.filter(Bill.created_by == user.id)

    limit = min(int(request.args.get("limit", 50)), 200)
    rows = query.order_by(Bill.id.desc()).limit(limit).all()
    return ok([r.to_dict(with_items=True) for r in rows])


@bp.get("/bills/pending")
@cashier_or_admin
def pending_bills():
    rows = (
        db.session.query(Bill)
        .filter(Bill.status == BILL_PENDING)
        .order_by(Bill.id.desc())
        .all()
    )
    return ok([r.to_dict(with_items=True) for r in rows])


@bp.get("/bills/<int:bill_id>")
@cashier_or_admin
def get_bill(bill_id: int):
    return ok(_get_bill(bill_id).to_dict(with_items=True))


@bp.get("/bills/<int:bill_id>/receipt")
@cashier_or_admin
def receipt(bill_id: int):
    """Everything the thermal / browser receipt template needs."""
    return ok(billing_service.receipt_payload(_get_bill(bill_id)))


@bp.post("/bills/<int:bill_id>/void")
@admin_required
def void(bill_id: int):
    """Release an unpaid bill so its lines can be re-billed. Admin only."""
    bill = _get_bill(bill_id)
    billing_service.void_bill(bill)
    db.session.commit()
    return ok({"message": "Bill " + bill.bill_number + " voided."})


# --- offline queue -------------------------------------------------------

@bp.post("/sync")
@cashier_or_admin
def sync():
    """Replay queued offline operations.

    Each operation carries a client_uid; replaying one that already landed
    returns the original result instead of creating a duplicate bill.
    """
    payload = require(request.get_json(silent=True), "operations")
    operations = payload["operations"]
    if not isinstance(operations, list):
        raise ApiError("operations must be a list.", status=422, code="validation_error")

    results = []
    for op in operations:
        uid = as_string(op.get("client_uid"), "client_uid", max_len=64)
        try:
            existing = db.session.query(Bill).filter_by(client_uid=uid).first()
            if existing is not None:
                results.append(
                    {
                        "client_uid": uid,
                        "status": "duplicate",
                        "bill": existing.to_dict(with_items=True),
                    }
                )
                continue

            order = order_service.create_order(
                order_type=op["order_type"],
                user_id=current_user().id,
                table_id=op.get("table_id"),
                customer_id=op.get("customer_id"),
                note=op.get("note"),
                client_uid=uid + "-order",
            )
            for line in op.get("items", []):
                order_service.add_item(
                    order,
                    int(line["menu_item_id"]),
                    int(line.get("quantity", 1)),
                    note=line.get("note"),
                )
            bill = billing_service.generate_bill(order, user_id=current_user().id)
            billing_service.complete_bill(
                bill, op.get("payments", []), user_id=current_user().id, client_uid=uid
            )
            db.session.commit()
            results.append(
                {
                    "client_uid": uid,
                    "status": "synced",
                    "bill": bill.to_dict(with_items=True),
                }
            )
        except ApiError as exc:
            db.session.rollback()
            results.append(
                {"client_uid": uid, "status": "failed", "error": exc.message, "code": exc.code}
            )
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            results.append({"client_uid": uid, "status": "failed", "error": str(exc)})

    return ok(
        {
            "results": results,
            "synced": sum(1 for r in results if r["status"] == "synced"),
            "duplicates": sum(1 for r in results if r["status"] == "duplicate"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
        }
    )
