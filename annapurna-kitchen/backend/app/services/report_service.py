"""Aggregation queries behind the Reports screen (admin only).

Reports run against paid bills only, so an unsettled bill never inflates
revenue. Sales are attributed by ``paid_at`` (the moment money changed hands).
"""
from __future__ import annotations

from datetime import date as date_cls, datetime, time, timedelta

from sqlalchemy import func

from ..extensions import db
from ..models import (
    BILL_PAID,
    Bill,
    Expense,
    MenuItem,
    Order,
    OrderItem,
    Payment,
    User,
)
from ..utils.money import D, money


def _window(start: date_cls, end: date_cls) -> tuple[datetime, datetime]:
    """Half-open-ish window covering whole days, inclusive of ``end``."""
    return datetime.combine(start, time.min), datetime.combine(end, time.max)


def _paid_bills_query(start: date_cls, end: date_cls):
    since, until = _window(start, end)
    return db.session.query(Bill).filter(
        Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until
    )


def default_range(days: int = 0) -> tuple[date_cls, date_cls]:
    today = date_cls.today()
    return today - timedelta(days=days), today


# --- daily sales ---------------------------------------------------------

def daily_sales(start: date_cls, end: date_cls) -> dict:
    since, until = _window(start, end)

    header = (
        db.session.query(
            func.count(Bill.id),
            func.coalesce(func.sum(Bill.subtotal), 0),
            func.coalesce(func.sum(Bill.discount_applied), 0),
            func.coalesce(func.sum(Bill.cgst), 0),
            func.coalesce(func.sum(Bill.sgst), 0),
            func.coalesce(func.sum(Bill.total), 0),
        )
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .one()
    )
    bill_count = int(header[0] or 0)
    gross = money(header[5])

    by_day_rows = (
        db.session.query(
            func.date(Bill.paid_at).label("day"),
            func.count(Bill.id),
            func.coalesce(func.sum(Bill.discount_applied), 0),
            func.coalesce(func.sum(Bill.cgst), 0),
            func.coalesce(func.sum(Bill.sgst), 0),
            func.coalesce(func.sum(Bill.total), 0),
        )
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .group_by(func.date(Bill.paid_at))
        .order_by(func.date(Bill.paid_at))
        .all()
    )

    payment_rows = (
        db.session.query(Payment.mode, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0))
        .join(Bill, Bill.id == Payment.bill_id)
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .group_by(Payment.mode)
        .all()
    )

    type_rows = (
        db.session.query(Order.order_type, func.count(Bill.id), func.coalesce(func.sum(Bill.total), 0))
        .join(Bill, Bill.order_id == Order.id)
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .group_by(Order.order_type)
        .all()
    )

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "summary": {
            "bill_count": bill_count,
            "gross_subtotal": str(money(header[1])),
            "discount_total": str(money(header[2])),
            "cgst_total": str(money(header[3])),
            "sgst_total": str(money(header[4])),
            "gst_total": str(money(D(header[3]) + D(header[4]))),
            "net_sales": str(gross),
            "average_bill": str(money(D(gross) / bill_count)) if bill_count else "0.00",
        },
        "by_day": [
            {
                "date": str(r[0]),
                "bill_count": int(r[1] or 0),
                "discount": str(money(r[2])),
                "cgst": str(money(r[3])),
                "sgst": str(money(r[4])),
                "total": str(money(r[5])),
            }
            for r in by_day_rows
        ],
        "by_payment_mode": [
            {"mode": r[0], "count": int(r[1] or 0), "amount": str(money(r[2]))}
            for r in payment_rows
        ],
        "by_order_type": [
            {"order_type": r[0], "count": int(r[1] or 0), "amount": str(money(r[2]))}
            for r in type_rows
        ],
    }


# --- item-wise -----------------------------------------------------------

def item_wise_sales(start: date_cls, end: date_cls, limit: int | None = None) -> dict:
    since, until = _window(start, end)
    rows = (
        db.session.query(
            MenuItem.id,
            MenuItem.name,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("qty"),
            func.coalesce(
                func.sum(OrderItem.quantity * OrderItem.price_at_order), 0
            ).label("revenue"),
        )
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Bill, Bill.id == OrderItem.bill_id)
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .group_by(MenuItem.id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .all()
    )
    items = [
        {
            "menu_item_id": r[0],
            "name": r[1],
            "quantity_sold": int(r[2] or 0),
            "revenue": str(money(r[3])),
        }
        for r in rows
    ]
    trimmed = items[:limit] if limit else items
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "items": trimmed,
        "best_sellers": items[:5],
        "worst_sellers": list(reversed(items[-5:])) if len(items) > 5 else [],
        "total_quantity": sum(i["quantity_sold"] for i in items),
        "total_revenue": str(money(sum((D(i["revenue"]) for i in items), D(0)))),
    }


# --- staff-wise (transaction attribution, NOT staff management) ----------

def staff_wise_sales(start: date_cls, end: date_cls) -> dict:
    """Sales grouped by the authenticated user recorded on each bill.

    This reads existing transaction data only. The application has no staff
    management module; users are provisioned by the setup/seed script.
    """
    since, until = _window(start, end)
    rows = (
        db.session.query(
            User.id,
            User.name,
            User.username,
            User.role,
            func.count(Bill.id),
            func.coalesce(func.sum(Bill.total), 0),
            func.coalesce(func.sum(Bill.discount_applied), 0),
        )
        .join(Bill, Bill.created_by == User.id)
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .group_by(User.id, User.name, User.username, User.role)
        .order_by(func.sum(Bill.total).desc())
        .all()
    )
    staff = []
    for r in rows:
        count = int(r[4] or 0)
        total = money(r[5])
        staff.append(
            {
                "user_id": r[0],
                "name": r[1],
                "username": r[2],
                "role": r[3],
                "bill_count": count,
                "total_sales": str(total),
                "discount_given": str(money(r[6])),
                "average_bill": str(money(D(total) / count)) if count else "0.00",
            }
        )
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "staff": staff,
        "total_sales": str(money(sum((D(s["total_sales"]) for s in staff), D(0)))),
    }


# --- expenses ------------------------------------------------------------

def expense_report(start: date_cls, end: date_cls) -> dict:
    rows = (
        db.session.query(Expense)
        .filter(Expense.date >= start, Expense.date <= end)
        .order_by(Expense.date.desc(), Expense.id.desc())
        .all()
    )
    by_category: dict[str, D] = {}
    for e in rows:
        key = e.category or "Uncategorised"
        by_category[key] = by_category.get(key, D(0)) + D(e.amount)
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "expenses": [e.to_dict() for e in rows],
        "total": str(money(sum((D(e.amount) for e in rows), D(0)))),
        "count": len(rows),
        "by_category": [
            {"category": k, "amount": str(money(v))}
            for k, v in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
    }


# --- profit & loss -------------------------------------------------------

def profit_loss(start: date_cls, end: date_cls) -> dict:
    since, until = _window(start, end)

    revenue_row = (
        db.session.query(
            func.coalesce(func.sum(Bill.total), 0),
            func.coalesce(func.sum(Bill.cgst), 0),
            func.coalesce(func.sum(Bill.sgst), 0),
            func.coalesce(func.sum(Bill.discount_applied), 0),
            func.count(Bill.id),
        )
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .one()
    )
    gross_revenue = money(revenue_row[0])
    gst_collected = money(D(revenue_row[1]) + D(revenue_row[2]))
    # GST is collected on behalf of the government, so it is not income.
    net_revenue = money(D(gross_revenue) - D(gst_collected))

    expense_total = money(
        db.session.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.date >= start, Expense.date <= end)
        .scalar()
    )
    profit = money(D(net_revenue) - D(expense_total))
    margin = (
        str(money(D(profit) * D(100) / D(net_revenue))) if D(net_revenue) > 0 else "0.00"
    )

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "gross_revenue": str(gross_revenue),
        "gst_collected": str(gst_collected),
        "net_revenue": str(net_revenue),
        "discount_given": str(money(revenue_row[3])),
        "bill_count": int(revenue_row[4] or 0),
        "expenses": str(expense_total),
        "estimated_profit": str(profit),
        "margin_percentage": margin,
        "is_profit": D(profit) >= 0,
    }


# --- dashboard -----------------------------------------------------------

def dashboard(on_date: date_cls | None = None) -> dict:
    from ..models import (
        ACTIVE_ORDER_STATUSES,
        BILL_PENDING,
        RawMaterial,
        RestaurantTable,
        STATUS_EMPTY,
    )
    from . import yield_calculator

    today = on_date or date_cls.today()
    sales = daily_sales(today, today)
    pnl = profit_loss(today, today)
    items = item_wise_sales(today, today, limit=5)

    payment_map = {p["mode"]: p["amount"] for p in sales["by_payment_mode"]}

    active_tables = (
        db.session.query(func.count(RestaurantTable.id))
        .filter(RestaurantTable.status != STATUS_EMPTY, RestaurantTable.is_active.is_(True))
        .scalar()
        or 0
    )
    total_tables = (
        db.session.query(func.count(RestaurantTable.id))
        .filter(RestaurantTable.is_active.is_(True))
        .scalar()
        or 0
    )
    pending_bills = (
        db.session.query(func.count(Bill.id)).filter(Bill.status == BILL_PENDING).scalar() or 0
    )
    open_orders = (
        db.session.query(func.count(Order.id))
        .filter(Order.status.in_(ACTIVE_ORDER_STATUSES))
        .scalar()
        or 0
    )

    alerts = yield_calculator.low_stock_alerts()

    # Last 7 days trend for the dashboard chart.
    week_start = today - timedelta(days=6)
    trend = daily_sales(week_start, today)["by_day"]
    trend_map = {row["date"]: row for row in trend}
    series = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        row = trend_map.get(day.isoformat())
        series.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%d %b"),
                "total": row["total"] if row else "0.00",
                "bill_count": row["bill_count"] if row else 0,
            }
        )

    return {
        "date": today.isoformat(),
        "todays_sales": sales["summary"]["net_sales"],
        "todays_bills": sales["summary"]["bill_count"],
        "average_bill": sales["summary"]["average_bill"],
        "discount_given": sales["summary"]["discount_total"],
        "gst_collected": sales["summary"]["gst_total"],
        "cash_sales": payment_map.get("cash", "0.00"),
        "card_sales": payment_map.get("card", "0.00"),
        "upi_sales": payment_map.get("upi", "0.00"),
        "payment_breakdown": sales["by_payment_mode"],
        "order_type_breakdown": sales["by_order_type"],
        "todays_expenses": pnl["expenses"],
        "estimated_profit": pnl["estimated_profit"],
        "is_profit": pnl["is_profit"],
        "active_tables": int(active_tables),
        "total_tables": int(total_tables),
        "pending_bills": int(pending_bills),
        "open_orders": int(open_orders),
        "low_stock_count": len(alerts),
        "low_stock_alerts": alerts[:6],
        "best_sellers": items["best_sellers"],
        "sales_trend": series,
    }
