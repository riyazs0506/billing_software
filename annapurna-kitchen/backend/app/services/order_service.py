"""Order lifecycle: create, edit lines, KOT, merge, table state transitions.

Table lifecycle (03-Application-Workflow):
    empty -> occupied -> bill_pending -> empty
"""
from __future__ import annotations

from datetime import datetime

from ..extensions import db
from ..models import (
    ACTIVE_ORDER_STATUSES,
    ORDER_TYPE_DINE_IN,
    ORDER_TYPE_TAKEAWAY,
    STATUS_BILLED,
    STATUS_BILL_PENDING,
    STATUS_CANCELLED,
    STATUS_EMPTY,
    STATUS_KOT_SENT,
    STATUS_MERGED,
    STATUS_OCCUPIED,
    STATUS_OPEN,
    STATUS_PAID,
    MenuItem,
    Order,
    OrderItem,
    RestaurantTable,
)
from ..utils.money import D
from ..utils.responses import ApiError
from . import numbering


# --- lookups -------------------------------------------------------------

def get_order_or_404(order_id: int) -> Order:
    order = db.session.get(Order, order_id)
    if order is None:
        raise ApiError("Order not found.", status=404, code="not_found")
    return order


def get_table_or_404(table_id: int) -> RestaurantTable:
    table = db.session.get(RestaurantTable, table_id)
    if table is None:
        raise ApiError("Table not found.", status=404, code="not_found")
    return table


# --- table state ---------------------------------------------------------

def refresh_table_status(table: RestaurantTable | None) -> None:
    """Derive a table colour from the orders currently sitting on it."""
    if table is None:
        return
    active = (
        db.session.query(Order)
        .filter(Order.table_id == table.id, Order.status.in_(ACTIVE_ORDER_STATUSES))
        .all()
    )
    if not active:
        table.status = STATUS_EMPTY
    elif any(o.status == STATUS_BILLED for o in active):
        table.status = STATUS_BILL_PENDING
    else:
        table.status = STATUS_OCCUPIED


# --- creation ------------------------------------------------------------

def create_order(
    *,
    order_type: str,
    user_id: int,
    table_id: int | None = None,
    customer_id: int | None = None,
    note: str | None = None,
    client_uid: str | None = None,
) -> Order:
    if client_uid:
        existing = db.session.query(Order).filter_by(client_uid=client_uid).first()
        if existing:
            return existing  # offline replay - idempotent

    table = None
    if order_type == ORDER_TYPE_DINE_IN:
        if not table_id:
            raise ApiError(
                "A dine-in order needs a table.", status=422, code="validation_error"
            )
        table = get_table_or_404(table_id)
        if not table.is_active:
            raise ApiError("That table is out of service.", status=409, code="conflict")
        open_order = table.active_order()
        if open_order is not None:
            raise ApiError(
                "Table "
                + table.table_number
                + " already has an open order ("
                + open_order.order_number
                + "). Open it instead.",
                status=409,
                code="table_busy",
                details={"order_id": open_order.id},
            )
    elif order_type == ORDER_TYPE_TAKEAWAY:
        table_id = None  # takeaway never holds a table
    else:  # pragma: no cover - guarded by the route validator
        raise ApiError("Unsupported order type.", status=422, code="validation_error")

    order = Order(
        order_number=numbering.next_order_number(),
        table_id=table_id,
        customer_id=customer_id,
        order_type=order_type,
        status=STATUS_OPEN,
        created_by=user_id,
        note=note,
        client_uid=client_uid,
    )
    db.session.add(order)
    db.session.flush()

    if table is not None:
        table.status = STATUS_OCCUPIED
    return order


# --- line editing --------------------------------------------------------

def assert_editable(order: Order) -> None:
    if order.status in (STATUS_PAID, STATUS_MERGED, STATUS_CANCELLED):
        raise ApiError(
            "Order " + order.order_number + " is " + order.status
            + " and can no longer be edited.",
            status=409,
            code="conflict",
        )


def add_item(
    order: Order, menu_item_id: int, quantity: int, note: str | None = None
) -> OrderItem:
    assert_editable(order)
    menu_item = db.session.get(MenuItem, menu_item_id)
    if menu_item is None or menu_item.is_deleted:
        raise ApiError("Menu item not found.", status=404, code="not_found")
    if not menu_item.is_available:
        raise ApiError(
            menu_item.name + " is marked unavailable.",
            status=409,
            code="item_unavailable",
        )
    if quantity < 1:
        raise ApiError("Quantity must be at least 1.", status=422, code="validation_error")

    # Merge into an existing unbilled, un-fired line of the same dish and price.
    for line in order.unbilled_items:
        if (
            line.menu_item_id == menu_item_id
            and not line.kot_sent
            and (line.note or "") == (note or "")
            and D(line.price_at_order) == D(menu_item.price)
        ):
            line.quantity += quantity
            return line

    line = OrderItem(
        menu_item_id=menu_item_id,
        quantity=quantity,
        price_at_order=menu_item.price,
        note=note,
    )
    # Append through the relationship (rather than setting order_id) so the
    # already-loaded collection stays correct within this request - the
    # quick-sale path adds lines and bills them without an intervening query.
    order.items.append(line)
    db.session.add(line)
    db.session.flush()
    return line


def get_line(order: Order, item_id: int) -> OrderItem:
    for line in order.items:
        if line.id == item_id:
            return line
    raise ApiError("Order line not found.", status=404, code="not_found")


def update_quantity(order: Order, item_id: int, quantity: int) -> OrderItem | None:
    assert_editable(order)
    line = get_line(order, item_id)
    if line.bill_id is not None:
        raise ApiError("That line is already billed.", status=409, code="conflict")
    if quantity <= 0:
        db.session.delete(line)
        db.session.flush()
        return None
    line.quantity = quantity
    return line


def remove_item(order: Order, item_id: int) -> None:
    assert_editable(order)
    line = get_line(order, item_id)
    if line.bill_id is not None:
        raise ApiError("That line is already billed.", status=409, code="conflict")
    db.session.delete(line)
    db.session.flush()


# --- KOT -----------------------------------------------------------------

def build_kot_payload(order: Order, only_new: bool = True) -> dict:
    lines = [i for i in order.live_items if (not i.kot_sent if only_new else True)]
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "order_type": order.order_type,
        "table_number": order.table.table_number if order.table else None,
        "created_by_name": order.creator.name if order.creator else None,
        "printed_at": datetime.now().isoformat(timespec="seconds"),
        "kot_sequence": order.kot_print_count + 1,
        "is_reprint": not only_new,
        "items": [
            {
                "name": line.menu_item.name if line.menu_item else "",
                "category": (
                    line.menu_item.category.name
                    if line.menu_item and line.menu_item.category
                    else None
                ),
                "quantity": line.quantity,
                "note": line.note,
            }
            for line in lines
        ],
    }


def send_kot(order: Order) -> dict:
    assert_editable(order)
    pending = [i for i in order.live_items if not i.kot_sent]
    if not pending:
        raise ApiError(
            "Nothing new to send to the kitchen.", status=409, code="nothing_to_send"
        )
    payload = build_kot_payload(order, only_new=True)
    for line in pending:
        line.kot_sent = True
    order.kot_sent_at = datetime.now()
    order.kot_print_count += 1
    if order.status == STATUS_OPEN:
        order.status = STATUS_KOT_SENT
    return payload


# --- merge ---------------------------------------------------------------

def merge_orders(target: Order, source: Order) -> Order:
    """Fold a source order unbilled lines into the target (large group)."""
    if target.id == source.id:
        raise ApiError(
            "Cannot merge an order into itself.", status=422, code="validation_error"
        )
    assert_editable(target)
    assert_editable(source)
    if any(i.bill_id is not None for i in source.items):
        raise ApiError(
            "That order already has a bill and cannot be merged.",
            status=409,
            code="conflict",
        )
    if target.order_type != source.order_type:
        raise ApiError(
            "Only orders of the same type can be merged.",
            status=422,
            code="validation_error",
        )

    source_table = source.table
    for line in list(source.items):
        line.order_id = target.id
    db.session.flush()

    source.status = STATUS_MERGED
    source.merged_into_order_id = target.id
    source.table_id = None
    db.session.flush()

    refresh_table_status(source_table)
    refresh_table_status(target.table)
    db.session.refresh(target)
    if any(i.kot_sent for i in target.live_items) and target.status == STATUS_OPEN:
        target.status = STATUS_KOT_SENT
    return target
