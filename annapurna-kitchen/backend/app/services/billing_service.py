"""Bill generation and the atomic "complete bill" transaction.

Order of operations for completion (build spec section 37):

    validate order -> subtotal -> discount -> CGST -> SGST -> final amount
    -> validate payment -> create bill -> create payments -> deduct raw
    materials -> update inventory -> update order status -> update table
    status -> record sale -> commit -> print receipt

Anything that fails before the commit rolls the whole thing back, so inventory
is never half-deducted and a paid bill is never half-created.
"""
from __future__ import annotations

from datetime import datetime

from ..extensions import db
from ..models import (
    BILL_PAID,
    BILL_PENDING,
    STATUS_BILLED,
    STATUS_PAID,
    Bill,
    Customer,
    Order,
    OrderItem,
    Setting,
)
from ..utils.money import D, money
from ..utils.responses import ApiError
from . import (
    discount_engine,
    gst_calculator,
    inventory_service,
    numbering,
    order_service,
    payment_service,
)


# --- tax configuration ---------------------------------------------------

def tax_config() -> dict:
    return {
        "gst_rate": Setting.get("tax.gst_rate", "5.00"),
        "tax_mode": Setting.get("tax.mode", "exclusive"),
        "tax_enabled": Setting.get_bool("tax.enabled", True),
    }


# --- preview -------------------------------------------------------------

def _resolve_lines(order: Order, order_item_ids: list[int] | None) -> list[OrderItem]:
    """Which lines this bill covers. A subset means a split bill."""
    unbilled = order.unbilled_items
    if not order_item_ids:
        lines = unbilled
    else:
        wanted = set(order_item_ids)
        by_id = {i.id: i for i in unbilled}
        missing = sorted(wanted - set(by_id))
        if missing:
            raise ApiError(
                "Some selected lines are not billable: "
                + ", ".join(str(m) for m in missing),
                status=409,
                code="conflict",
            )
        lines = [by_id[i] for i in order_item_ids if i in by_id]

    if not lines:
        raise ApiError(
            "There is nothing left to bill on this order.",
            status=409,
            code="nothing_to_bill",
        )
    return lines


def calculate(order: Order, order_item_ids: list[int] | None = None, on_date=None) -> dict:
    """Non-mutating preview of what the bill will look like."""
    lines = _resolve_lines(order, order_item_ids)
    active = discount_engine.evaluate(on_date)
    cfg = tax_config()

    totals = gst_calculator.calculate_totals(
        [line.line_total() for line in lines],
        gst_rate=cfg["gst_rate"],
        discount_percentage=active.percentage,
        tax_mode=cfg["tax_mode"],
        tax_enabled=cfg["tax_enabled"],
    )
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "order_type": order.order_type,
        "table_number": order.table.table_number if order.table else None,
        "items": [line.to_dict() for line in lines],
        "discount": active.to_dict(),
        "totals": totals.to_dict(),
    }


# --- generation ----------------------------------------------------------

def generate_bill(
    order: Order,
    *,
    user_id: int,
    order_item_ids: list[int] | None = None,
    customer_id: int | None = None,
    on_date=None,
) -> Bill:
    """Create a pending invoice covering the selected lines.

    Called once per bill; splitting a table simply means calling it more than
    once with different ``order_item_ids``.
    """
    order_service.assert_editable(order)
    lines = _resolve_lines(order, order_item_ids)

    active = discount_engine.evaluate(on_date)
    cfg = tax_config()
    totals = gst_calculator.calculate_totals(
        [line.line_total() for line in lines],
        gst_rate=cfg["gst_rate"],
        discount_percentage=active.percentage,
        tax_mode=cfg["tax_mode"],
        tax_enabled=cfg["tax_enabled"],
    )

    if customer_id is None:
        customer_id = order.customer_id
    if customer_id is not None and db.session.get(Customer, customer_id) is None:
        raise ApiError("Customer not found.", status=404, code="not_found")

    bill = Bill(
        bill_number=numbering.next_bill_number(Setting.get("business.invoice_prefix", "AK")),
        order_id=order.id,
        subtotal=totals.subtotal,
        discount_applied=totals.discount_applied,
        discount_percentage=totals.discount_percentage,
        discount_id=active.discount_id,
        discount_label=active.label if active.discount_id else None,
        taxable_value=totals.taxable_value,
        cgst_rate=totals.cgst_rate,
        sgst_rate=totals.sgst_rate,
        cgst=totals.cgst,
        sgst=totals.sgst,
        tax_mode=totals.tax_mode,
        total=totals.total,
        status=BILL_PENDING,
        created_by=user_id,
        customer_id=customer_id,
    )
    db.session.add(bill)
    db.session.flush()

    for line in lines:
        # Through the relationship, so bill.items is populated for the caller
        # in this same request (quick-sale bills and completes in one go).
        bill.items.append(line)

    order.status = STATUS_BILLED
    if customer_id and not order.customer_id:
        order.customer_id = customer_id
    db.session.flush()

    order_service.refresh_table_status(order.table)
    return bill


# --- completion (atomic) -------------------------------------------------

def complete_bill(
    bill: Bill,
    payments: list[dict],
    *,
    user_id: int,
    client_uid: str | None = None,
) -> dict:
    """Settle a bill: validate tender, record payments, deduct stock, release
    the table. One transaction, committed by the caller-facing route."""
    if bill.status == BILL_PAID:
        # Offline replay of an already-settled bill: return the same result
        # instead of double-charging or double-deducting.
        return {
            "bill": bill.to_dict(with_items=True),
            "deductions": [],
            "inventory": [],
            "already_completed": True,
        }

    if client_uid:
        twin = db.session.query(Bill).filter_by(client_uid=client_uid).first()
        if twin is not None and twin.id != bill.id:
            return {
                "bill": twin.to_dict(with_items=True),
                "deductions": [],
                "inventory": [],
                "already_completed": True,
            }

    # 7. validate payment
    recorded = payment_service.record_payments(bill, payments, user_id=user_id)

    # 10/11. recipe-linked deduction + inventory update
    deductions = inventory_service.deduct_for_items(
        list(bill.items), user_id=user_id, bill_id=bill.id
    )

    # 12/13. order + table status
    bill.status = BILL_PAID
    bill.paid_at = datetime.now()
    if client_uid:
        bill.client_uid = client_uid

    order = bill.order
    if not order.unbilled_items and all(
        b.status == BILL_PAID for b in order.bills if b.id != bill.id
    ):
        order.status = STATUS_PAID
    db.session.flush()
    order_service.refresh_table_status(order.table)

    # loyalty (optional, off by default)
    _award_loyalty(bill)

    db.session.flush()
    material_ids = [d["raw_material_id"] for d in deductions]
    return {
        "bill": bill.to_dict(with_items=True),
        "payments": [p.to_dict() for p in recorded],
        "deductions": deductions,
        "inventory": inventory_service.snapshot_after_billing(material_ids),
        "already_completed": False,
    }


def _award_loyalty(bill: Bill) -> None:
    if not Setting.get_bool("loyalty.enabled", False) or not bill.customer_id:
        return
    per_100 = D(Setting.get("loyalty.points_per_100", "1"))
    customer = db.session.get(Customer, bill.customer_id)
    if customer is None:
        return
    points = int((D(bill.total) / D(100)) * per_100)
    if points > 0:
        customer.loyalty_points = (customer.loyalty_points or 0) + points


# --- receipt -------------------------------------------------------------

def receipt_payload(bill: Bill) -> dict:
    """Everything the thermal/browser receipt template needs."""
    business = Setting.as_dict(("business.", "tax.", "printer."))
    order = bill.order
    return {
        "business": {
            "name": business.get("business.name"),
            "tagline": business.get("business.tagline"),
            "address": business.get("business.address"),
            "phone": business.get("business.phone"),
            "email": business.get("business.email"),
            "gstin": business.get("business.gstin"),
            "fssai": business.get("business.fssai"),
            "currency_symbol": business.get("business.currency_symbol", "Rs."),
            "footer": business.get("business.receipt_footer"),
        },
        "bill": {
            "id": bill.id,
            "bill_number": bill.bill_number,
            "created_at": bill.created_at.isoformat() if bill.created_at else None,
            "paid_at": bill.paid_at.isoformat() if bill.paid_at else None,
            "status": bill.status,
            "subtotal": str(bill.subtotal),
            "discount_applied": str(bill.discount_applied),
            "discount_percentage": str(bill.discount_percentage),
            "discount_label": bill.discount_label,
            "taxable_value": str(bill.taxable_value),
            "cgst_rate": str(bill.cgst_rate),
            "sgst_rate": str(bill.sgst_rate),
            "cgst": str(bill.cgst),
            "sgst": str(bill.sgst),
            "tax_mode": bill.tax_mode,
            "total": str(bill.total),
            "amount_paid": str(bill.amount_paid()),
            "balance_due": str(bill.balance_due()),
        },
        "order": {
            "order_number": order.order_number if order else None,
            "order_type": order.order_type if order else None,
            "table_number": order.table.table_number if order and order.table else None,
        },
        "cashier": bill.creator.name if bill.creator else None,
        "customer": (
            {"name": bill.customer.name, "phone": bill.customer.phone}
            if bill.customer
            else None
        ),
        "items": [
            {
                "name": line.menu_item.name if line.menu_item else "",
                "quantity": line.quantity,
                "price": str(line.price_at_order),
                "line_total": str(line.line_total()),
            }
            for line in bill.items
        ],
        "payments": [
            {"mode": p.mode, "amount": str(p.amount), "reference": p.reference}
            for p in bill.payments
        ],
        "paper_width": business.get("printer.paper_width", "80"),
    }


def void_bill(bill: Bill) -> Bill:
    """Release an unpaid bill so its lines can be re-billed (split correction)."""
    if bill.status == BILL_PAID:
        raise ApiError(
            "A paid bill cannot be voided.", status=409, code="conflict"
        )
    for line in list(bill.items):
        line.bill_id = None
    bill.status = "void"
    db.session.flush()

    order = bill.order
    if order.unbilled_items:
        order.status = STATUS_BILLED if any(
            b.status != "void" for b in order.bills
        ) else (
            "kot_sent" if any(i.kot_sent for i in order.live_items) else "open"
        )
    db.session.flush()
    order_service.refresh_table_status(order.table)
    return bill


def sum_money(values) -> "D":
    return money(sum((D(v) for v in values), D(0)))
