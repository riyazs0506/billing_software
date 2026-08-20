"""Customer database.

The cashier may search and add a customer while billing (07-Role-Access).
Browsing the whole database and viewing history is admin-only.
"""
from __future__ import annotations

from flask import Blueprint, request
from sqlalchemy import func, or_

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin
from ..models import BILL_PAID, Bill, Customer, Order, Setting
from ..utils.money import D, money
from ..utils.responses import ApiError, ok, paginated
from ..utils.validators import as_int, as_string, require, validate_phone

bp = Blueprint("customers", __name__, url_prefix="/api/customers")


def _get(customer_id: int) -> Customer:
    row = db.session.get(Customer, customer_id)
    if row is None:
        raise ApiError("Customer not found.", status=404, code="not_found")
    return row


def _stats(customer: Customer) -> dict:
    row = (
        db.session.query(
            func.count(Bill.id), func.coalesce(func.sum(Bill.total), 0), func.max(Bill.paid_at)
        )
        .join(Order, Order.id == Bill.order_id)
        .filter(Bill.status == BILL_PAID, Order.customer_id == customer.id)
        .one()
    )
    count = int(row[0] or 0)
    spent = money(row[1])
    return {
        "order_count": count,
        "total_spent": str(spent),
        "average_spend": str(money(D(spent) / count)) if count else "0.00",
        "last_visit": row[2].isoformat() if row[2] else None,
    }


@bp.get("/search")
@cashier_or_admin
def search():
    """Fast lookup by phone or name from the billing screen."""
    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return ok([])
    needle = "%" + term + "%"
    rows = (
        db.session.query(Customer)
        .filter(or_(Customer.phone.like(needle), Customer.name.like(needle)))
        .order_by(Customer.name.asc())
        .limit(10)
        .all()
    )
    return ok([r.to_dict() for r in rows])


@bp.post("")
@cashier_or_admin
def create_customer():
    """Add a customer mid-bill. Re-adding an existing phone returns that row."""
    payload = require(request.get_json(silent=True), "name", "phone")
    phone = validate_phone(payload["phone"])

    existing = db.session.query(Customer).filter(Customer.phone == phone).first()
    if existing is not None:
        return ok(existing.to_dict(), status=200, existing=True)

    row = Customer(
        name=as_string(payload["name"], "name", max_len=100),
        phone=phone,
        note=as_string(payload.get("note") or "", "note", min_len=0, max_len=255) or None,
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.get("")
@admin_required
def list_customers():
    query = db.session.query(Customer)
    if request.args.get("search"):
        needle = "%" + request.args["search"].strip() + "%"
        query = query.filter(or_(Customer.phone.like(needle), Customer.name.like(needle)))

    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(int(request.args.get("per_page", 25)), 100)
    total = query.count()
    rows = (
        query.order_by(Customer.name.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return paginated(
        [r.to_dict(stats=_stats(r)) for r in rows],
        total,
        page,
        per_page,
        loyalty_enabled=Setting.get_bool("loyalty.enabled", False),
    )


@bp.get("/<int:customer_id>")
@admin_required
def get_customer(customer_id: int):
    row = _get(customer_id)
    return ok(row.to_dict(stats=_stats(row)))


@bp.put("/<int:customer_id>")
@admin_required
def update_customer(customer_id: int):
    row = _get(customer_id)
    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        row.name = as_string(payload["name"], "name", max_len=100)
    if "phone" in payload:
        phone = validate_phone(payload["phone"])
        clash = (
            db.session.query(Customer)
            .filter(Customer.phone == phone, Customer.id != row.id)
            .first()
        )
        if clash:
            raise ApiError("Another customer already uses that phone.", status=409, code="conflict")
        row.phone = phone
    if "note" in payload:
        row.note = as_string(payload["note"], "note", min_len=0, max_len=255) or None
    if "loyalty_points" in payload:
        row.loyalty_points = as_int(payload["loyalty_points"], "loyalty_points", minimum=0)

    db.session.commit()
    return ok(row.to_dict(stats=_stats(row)))


@bp.delete("/<int:customer_id>")
@admin_required
def delete_customer(customer_id: int):
    row = _get(customer_id)
    if row.orders.count():
        raise ApiError(
            "This customer has order history and cannot be deleted.",
            status=409,
            code="conflict",
        )
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Customer deleted."})


@bp.get("/<int:customer_id>/history")
@admin_required
def history(customer_id: int):
    row = _get(customer_id)
    limit = min(int(request.args.get("limit", 25)), 100)
    bills = (
        db.session.query(Bill)
        .join(Order, Order.id == Bill.order_id)
        .filter(Order.customer_id == row.id, Bill.status == BILL_PAID)
        .order_by(Bill.paid_at.desc())
        .limit(limit)
        .all()
    )
    return ok(
        {
            "customer": row.to_dict(stats=_stats(row)),
            "bills": [b.to_dict(with_items=True) for b in bills],
        }
    )
