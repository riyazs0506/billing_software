"""Orders: create, edit lines, send KOT, list open orders."""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import cashier_or_admin, current_user
from ..models import ACTIVE_ORDER_STATUSES, ORDER_TYPES, Order
from ..services import order_service
from ..utils.responses import ApiError, ok
from ..utils.validators import as_enum, as_int, as_string, require

bp = Blueprint("orders", __name__, url_prefix="/api/orders")


@bp.get("")
@cashier_or_admin
def list_orders():
    query = db.session.query(Order)
    status = request.args.get("status")
    if status == "active":
        query = query.filter(Order.status.in_(ACTIVE_ORDER_STATUSES))
    elif status:
        query = query.filter(Order.status == status)
    if request.args.get("order_type"):
        query = query.filter(Order.order_type == request.args["order_type"])
    if request.args.get("table_id"):
        query = query.filter(Order.table_id == int(request.args["table_id"]))

    limit = min(int(request.args.get("limit", 50)), 200)
    rows = query.order_by(Order.id.desc()).limit(limit).all()
    return ok([r.to_dict(with_items=True) for r in rows])


@bp.get("/<int:order_id>")
@cashier_or_admin
def get_order(order_id: int):
    order = order_service.get_order_or_404(order_id)
    return ok(order.to_dict(with_items=True, with_bills=True))


@bp.post("")
@cashier_or_admin
def create_order():
    payload = require(request.get_json(silent=True), "order_type")
    order = order_service.create_order(
        order_type=as_enum(payload["order_type"], "order_type", set(ORDER_TYPES)),
        user_id=current_user().id,
        table_id=payload.get("table_id"),
        customer_id=payload.get("customer_id"),
        note=payload.get("note"),
        client_uid=payload.get("client_uid"),
    )

    # An order may be created with its lines already attached (fast POS path,
    # and the shape the offline queue replays).
    for line in payload.get("items") or []:
        order_service.add_item(
            order,
            as_int(line.get("menu_item_id"), "menu_item_id", minimum=1),
            as_int(line.get("quantity", 1), "quantity", minimum=1),
            note=line.get("note"),
        )
    db.session.commit()
    return ok(order.to_dict(with_items=True), status=201)


@bp.post("/<int:order_id>/items")
@cashier_or_admin
def add_item(order_id: int):
    order = order_service.get_order_or_404(order_id)
    payload = require(request.get_json(silent=True), "menu_item_id")
    line = order_service.add_item(
        order,
        as_int(payload["menu_item_id"], "menu_item_id", minimum=1),
        as_int(payload.get("quantity", 1), "quantity", minimum=1),
        note=payload.get("note"),
    )
    db.session.commit()
    return ok({"item": line.to_dict(), "order": order.to_dict(with_items=True)}, status=201)


@bp.put("/<int:order_id>/items/<int:item_id>")
@cashier_or_admin
def update_item(order_id: int, item_id: int):
    order = order_service.get_order_or_404(order_id)
    payload = require(request.get_json(silent=True), "quantity")
    order_service.update_quantity(
        order, item_id, as_int(payload["quantity"], "quantity", minimum=0)
    )
    db.session.commit()
    db.session.refresh(order)
    return ok(order.to_dict(with_items=True))


@bp.delete("/<int:order_id>/items/<int:item_id>")
@cashier_or_admin
def remove_item(order_id: int, item_id: int):
    order = order_service.get_order_or_404(order_id)
    order_service.remove_item(order, item_id)
    db.session.commit()
    db.session.refresh(order)
    return ok(order.to_dict(with_items=True))


@bp.put("/<int:order_id>")
@cashier_or_admin
def update_order(order_id: int):
    order = order_service.get_order_or_404(order_id)
    order_service.assert_editable(order)
    payload = request.get_json(silent=True) or {}
    if "customer_id" in payload:
        order.customer_id = payload["customer_id"] or None
    if "note" in payload:
        order.note = as_string(payload["note"], "note", min_len=0, max_len=255) or None
    db.session.commit()
    return ok(order.to_dict(with_items=True))


# --- KOT -----------------------------------------------------------------

@bp.post("/<int:order_id>/kot")
@cashier_or_admin
def send_kot(order_id: int):
    """Fire new lines to the kitchen and return the KOT print payload."""
    order = order_service.get_order_or_404(order_id)
    payload = order_service.send_kot(order)
    db.session.commit()
    return ok({"kot": payload, "order": order.to_dict(with_items=True)}, status=201)


@bp.get("/<int:order_id>/kot")
@cashier_or_admin
def reprint_kot(order_id: int):
    """Full KOT payload for a reprint after a printer failure."""
    order = order_service.get_order_or_404(order_id)
    return ok(order_service.build_kot_payload(order, only_new=False))


@bp.post("/<int:order_id>/cancel")
@cashier_or_admin
def cancel_order(order_id: int):
    order = order_service.get_order_or_404(order_id)
    order_service.assert_editable(order)
    if any(i.bill_id is not None for i in order.items):
        raise ApiError(
            "This order already has a bill and cannot be cancelled.",
            status=409,
            code="conflict",
        )
    table = order.table
    order.status = "cancelled"
    order.table_id = None
    db.session.flush()
    order_service.refresh_table_status(table)
    db.session.commit()
    return ok({"message": "Order " + order.order_number + " cancelled."})
