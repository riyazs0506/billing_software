"""Human-readable document numbers for orders and invoices."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func

from ..extensions import db


def _next_sequence(model, column, prefix: str) -> int:
    latest = (
        db.session.query(func.max(column))
        .filter(column.like(f"{prefix}%"))
        .scalar()
    )
    if not latest:
        return 1
    tail = str(latest).rsplit("-", 1)[-1]
    try:
        return int(tail) + 1
    except ValueError:  # pragma: no cover - defensive
        return 1


def next_order_number(now: datetime | None = None) -> str:
    from ..models import Order

    stamp = (now or datetime.now()).strftime("%Y%m%d")
    prefix = f"ORD-{stamp}-"
    return f"{prefix}{_next_sequence(Order, Order.order_number, prefix):04d}"


def next_bill_number(invoice_prefix: str = "AK", now: datetime | None = None) -> str:
    from ..models import Bill

    stamp = (now or datetime.now()).strftime("%Y%m%d")
    prefix = f"{invoice_prefix}-{stamp}-"
    return f"{prefix}{_next_sequence(Bill, Bill.bill_number, prefix):04d}"
