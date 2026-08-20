"""Table tracking: status board, assign, merge, split, release.

No reservation logic exists anywhere here - tables only reflect active orders.
"""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin, current_user
from ..models import (
    ACTIVE_ORDER_STATUSES,
    BILL_PAID,
    STATUS_EMPTY,
    Order,
    RestaurantTable,
)
from ..services import billing_service, order_service
from ..utils.responses import ApiError, ok
from ..utils.validators import as_bool, as_int, as_string, require

bp = Blueprint("tables", __name__, url_prefix="/api/tables")


@bp.get("")
@cashier_or_admin
def list_tables():
    rows = (
        db.session.query(RestaurantTable)
        .order_by(RestaurantTable.id.asc())
        .all()
    )
    if as_bool(request.args.get("active_only"), True):
        rows = [r for r in rows if r.is_active]
    with_order = as_bool(request.args.get("with_orders"), True)
    payload = [r.to_dict(with_order=with_order) for r in rows]
    return ok(
        payload,
        counts={
            "empty": sum(1 for r in payload if r["status"] == "empty"),
            "occupied": sum(1 for r in payload if r["status"] == "occupied"),
            "bill_pending": sum(1 for r in payload if r["status"] == "bill_pending"),
        },
    )


@bp.get("/<int:table_id>")
@cashier_or_admin
def get_table(table_id: int):
    table = order_service.get_table_or_404(table_id)
    return ok(table.to_dict(with_order=True))


@bp.post("")
@admin_required
def create_table():
    payload = require(request.get_json(silent=True), "table_number")
    number = as_string(payload["table_number"], "table_number", max_len=10)
    if (
        db.session.query(RestaurantTable)
        .filter(RestaurantTable.table_number == number)
        .first()
    ):
        raise ApiError("That table number already exists.", status=409, code="conflict")

    row = RestaurantTable(
        table_number=number,
        seats=as_int(payload.get("seats", 4), "seats", minimum=1, maximum=50),
        status=STATUS_EMPTY,
        is_active=as_bool(payload.get("is_active"), True),
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/<int:table_id>")
@admin_required
def update_table(table_id: int):
    table = order_service.get_table_or_404(table_id)
    payload = request.get_json(silent=True) or {}
    if "table_number" in payload:
        number = as_string(payload["table_number"], "table_number", max_len=10)
        clash = (
            db.session.query(RestaurantTable)
            .filter(RestaurantTable.table_number == number, RestaurantTable.id != table.id)
            .first()
        )
        if clash:
            raise ApiError("That table number already exists.", status=409, code="conflict")
        table.table_number = number
    if "seats" in payload:
        table.seats = as_int(payload["seats"], "seats", minimum=1, maximum=50)
    if "is_active" in payload:
        if not as_bool(payload["is_active"], True) and table.active_order():
            raise ApiError(
                "Close the open order before taking this table out of service.",
                status=409,
                code="conflict",
            )
        table.is_active = as_bool(payload["is_active"], True)
    db.session.commit()
    return ok(table.to_dict(with_order=True))


@bp.delete("/<int:table_id>")
@admin_required
def delete_table(table_id: int):
    table = order_service.get_table_or_404(table_id)
    if table.active_order():
        raise ApiError(
            "This table has an open order.", status=409, code="conflict"
        )
    if table.orders.count():
        table.is_active = False  # keep history intact
        db.session.commit()
        return ok({"message": "Table retired (order history preserved)."})
    db.session.delete(table)
    db.session.commit()
    return ok({"message": "Table deleted."})


# --- operations ----------------------------------------------------------

@bp.post("/<int:table_id>/assign")
@cashier_or_admin
def assign(table_id: int):
    """Open a new dine-in order on an empty table, or return the open one."""
    table = order_service.get_table_or_404(table_id)
    existing = table.active_order()
    if existing is not None:
        return ok(
            {"order": existing.to_dict(with_items=True), "created": False},
            table=table.to_dict(),
        )

    payload = request.get_json(silent=True) or {}
    order = order_service.create_order(
        order_type="dine_in",
        user_id=current_user().id,
        table_id=table.id,
        customer_id=payload.get("customer_id"),
        note=payload.get("note"),
        client_uid=payload.get("client_uid"),
    )
    db.session.commit()
    return ok(
        {"order": order.to_dict(with_items=True), "created": True},
        table=table.to_dict(),
        status=201,
    )


@bp.post("/merge")
@cashier_or_admin
def merge():
    """Merge two occupied tables into one bill (large group)."""
    payload = require(request.get_json(silent=True), "target_order_id", "source_order_id")
    target = order_service.get_order_or_404(
        as_int(payload["target_order_id"], "target_order_id", minimum=1)
    )
    source = order_service.get_order_or_404(
        as_int(payload["source_order_id"], "source_order_id", minimum=1)
    )
    merged = order_service.merge_orders(target, source)
    db.session.commit()
    return ok(
        {
            "order": merged.to_dict(with_items=True),
            "merged_order_id": source.id,
            "message": "Orders merged into " + merged.order_number + ".",
        }
    )


@bp.post("/split")
@cashier_or_admin
def split():
    """Split one table order into multiple bills for separate payments.

    Each group of order-item ids becomes its own pending invoice; unlisted
    lines stay unbilled and can be billed separately afterwards.
    """
    payload = require(request.get_json(silent=True), "order_id", "groups")
    order = order_service.get_order_or_404(as_int(payload["order_id"], "order_id", minimum=1))

    groups = payload["groups"]
    if not isinstance(groups, list) or len(groups) < 2:
        raise ApiError(
            "Provide at least two groups of item ids to split a bill.",
            status=422,
            code="validation_error",
        )

    seen: set[int] = set()
    for group in groups:
        ids = group.get("order_item_ids") if isinstance(group, dict) else group
        if not isinstance(ids, list) or not ids:
            raise ApiError(
                "Each split group needs at least one order item.",
                status=422,
                code="validation_error",
            )
        overlap = seen.intersection(ids)
        if overlap:
            raise ApiError(
                "An item cannot appear in two split groups.",
                status=422,
                code="validation_error",
                details={"duplicate_item_ids": sorted(overlap)},
            )
        seen.update(ids)

    bills = []
    for group in groups:
        ids = group.get("order_item_ids") if isinstance(group, dict) else group
        customer_id = group.get("customer_id") if isinstance(group, dict) else None
        bill = billing_service.generate_bill(
            order,
            user_id=current_user().id,
            order_item_ids=[int(i) for i in ids],
            customer_id=customer_id,
        )
        bills.append(bill)

    db.session.commit()
    return ok(
        {
            "order": order.to_dict(with_items=True, with_bills=True),
            "bills": [b.to_dict(with_items=True) for b in bills],
        },
        status=201,
    )


@bp.post("/<int:table_id>/release")
@cashier_or_admin
def release(table_id: int):
    """Force a table back to Empty once its orders are settled."""
    table = order_service.get_table_or_404(table_id)
    open_orders = (
        db.session.query(Order)
        .filter(Order.table_id == table.id, Order.status.in_(ACTIVE_ORDER_STATUSES))
        .all()
    )
    blocking = [
        o
        for o in open_orders
        if o.unbilled_items or any(b.status != BILL_PAID for b in o.bills)
    ]
    if blocking:
        raise ApiError(
            "Table "
            + table.table_number
            + " still has an unsettled order ("
            + ", ".join(o.order_number for o in blocking)
            + ").",
            status=409,
            code="conflict",
        )
    for order in open_orders:
        order.status = "paid"
    order_service.refresh_table_status(table)
    db.session.commit()
    return ok(table.to_dict(with_order=True))
