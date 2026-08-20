"""Payment endpoints: modes, partial tenders and per-bill payment history."""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin, current_user
from ..models import BILL_PAID, PAYMENT_MODES, Bill, Payment
from ..services import payment_service
from ..utils.money import D, money
from ..utils.responses import ApiError, ok
from ..utils.validators import require

bp = Blueprint("payments", __name__, url_prefix="/api/payments")


@bp.get("/modes")
@cashier_or_admin
def modes():
    return ok(
        [
            {"value": "cash", "label": "Cash", "icon": "cash"},
            {"value": "card", "label": "Card", "icon": "card"},
            {"value": "upi", "label": "UPI", "icon": "upi"},
        ]
    )


@bp.get("/bill/<int:bill_id>")
@cashier_or_admin
def for_bill(bill_id: int):
    bill = db.session.get(Bill, bill_id)
    if bill is None:
        raise ApiError("Bill not found.", status=404, code="not_found")
    return ok(
        {
            "bill_id": bill.id,
            "bill_total": str(bill.total),
            "amount_paid": str(bill.amount_paid()),
            "balance_due": str(bill.balance_due()),
            "payments": [p.to_dict() for p in bill.payments],
        }
    )


@bp.post("/validate")
@cashier_or_admin
def validate():
    """Pre-flight check for the split-payment modal, before committing."""
    payload = require(request.get_json(silent=True), "bill_id", "payments")
    bill = db.session.get(Bill, int(payload["bill_id"]))
    if bill is None:
        raise ApiError("Bill not found.", status=404, code="not_found")

    cleaned = payment_service.normalise(payload["payments"])
    received = money(sum((p["amount"] for p in cleaned), D(0)))
    total = money(bill.total)
    already = bill.amount_paid()
    balance = money(total - already - received)

    return ok(
        {
            "bill_total": str(total),
            "already_paid": str(already),
            "entered": str(received),
            "balance": str(balance),
            "settles": abs(balance) <= payment_service.EPSILON,
            "breakdown": [
                {"mode": p["mode"], "amount": str(p["amount"])} for p in cleaned
            ],
        }
    )


@bp.post("/bill/<int:bill_id>")
@cashier_or_admin
def add_partial(bill_id: int):
    """Record an additional tender against a bill that is still short.

    The bill is only flipped to paid once the full total is settled - a bill
    is never marked paid on a partial amount.
    """
    bill = db.session.get(Bill, bill_id)
    if bill is None:
        raise ApiError("Bill not found.", status=404, code="not_found")
    if bill.status == BILL_PAID:
        raise ApiError("This bill is already settled.", status=409, code="conflict")

    payload = require(request.get_json(silent=True), "payments")
    cleaned = payment_service.normalise(payload["payments"])
    incoming = money(sum((p["amount"] for p in cleaned), D(0)))
    if money(bill.amount_paid() + incoming) > money(D(bill.total) + payment_service.EPSILON):
        raise ApiError(
            "That would over-pay the bill.", status=422, code="payment_excess"
        )

    for entry in cleaned:
        db.session.add(
            Payment(
                bill_id=bill.id,
                mode=entry["mode"],
                amount=entry["amount"],
                reference=entry.get("reference"),
                tendered=entry.get("tendered"),
                change_given=entry.get("change_given"),
                created_by=current_user().id,
            )
        )
    db.session.commit()
    db.session.refresh(bill)
    return ok(
        {
            "bill_id": bill.id,
            "amount_paid": str(bill.amount_paid()),
            "balance_due": str(bill.balance_due()),
            "status": bill.status,
            "payments": [p.to_dict() for p in bill.payments],
        },
        status=201,
    )


@bp.get("")
@admin_required
def list_payments():
    query = db.session.query(Payment)
    if request.args.get("mode"):
        mode = request.args["mode"].lower()
        if mode not in PAYMENT_MODES:
            raise ApiError("Unknown payment mode.", status=422, code="validation_error")
        query = query.filter(Payment.mode == mode)
    limit = min(int(request.args.get("limit", 100)), 500)
    rows = query.order_by(Payment.id.desc()).limit(limit).all()
    return ok([r.to_dict() for r in rows])
