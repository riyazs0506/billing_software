"""Reports and exports. Admin only, enforced on every route."""
from __future__ import annotations

from datetime import date as date_cls, timedelta

from flask import Blueprint, Response, request

from ..extensions import db
from ..middleware import admin_required
from ..models import BILL_PAID, Bill
from ..services import export_service, report_service
from ..utils.responses import ApiError, ok
from ..utils.validators import validate_date_range

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _range() -> tuple[date_cls, date_cls]:
    start, end = validate_date_range(
        request.args.get("start_date"), request.args.get("end_date"), allow_none=True
    )
    today = date_cls.today()
    if start is None and end is None:
        return today, today
    if start is None:
        return end, end
    if end is None:
        return start, today if today >= start else start
    return start, end


@bp.get("/dashboard")
@admin_required
def dashboard():
    on = request.args.get("date")
    when = date_cls.fromisoformat(on) if on else None
    return ok(report_service.dashboard(when))


@bp.get("/daily")
@admin_required
def daily():
    start, end = _range()
    return ok(report_service.daily_sales(start, end))


@bp.get("/item-wise")
@admin_required
def item_wise():
    start, end = _range()
    limit = int(request.args.get("limit", 0)) or None
    return ok(report_service.item_wise_sales(start, end, limit))


@bp.get("/staff-wise")
@admin_required
def staff_wise():
    """Sales grouped by the user recorded on each transaction.

    Pure read of transaction data - the application has no staff management.
    """
    start, end = _range()
    return ok(report_service.staff_wise_sales(start, end))


@bp.get("/expenses")
@admin_required
def expenses():
    start, end = _range()
    return ok(report_service.expense_report(start, end))


@bp.get("/profit-loss")
@admin_required
def profit_loss():
    start, end = _range()
    return ok(report_service.profit_loss(start, end))


@bp.get("/summary")
@admin_required
def summary():
    """Everything the Reports screen needs for one date range, in one call."""
    start, end = _range()
    return ok(
        {
            "daily": report_service.daily_sales(start, end),
            "item_wise": report_service.item_wise_sales(start, end),
            "staff_wise": report_service.staff_wise_sales(start, end),
            "expenses": report_service.expense_report(start, end),
            "profit_loss": report_service.profit_loss(start, end),
        }
    )


@bp.get("/bills")
@admin_required
def bills():
    """The full paid-bill ledger for a date range."""
    start, end = _range()
    since, until = report_service._window(start, end)
    rows = (
        db.session.query(Bill)
        .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
        .order_by(Bill.paid_at.desc())
        .all()
    )
    return ok([b.to_dict(with_items=True) for b in rows])


# --- export --------------------------------------------------------------

def _rows_for(kind: str, start: date_cls, end: date_cls):
    if kind == "daily":
        report = report_service.daily_sales(start, end)
        return [
            ("Daily Sales", report["by_day"], export_service.DAILY_COLUMNS),
            ("Payment Modes", report["by_payment_mode"], export_service.PAYMENT_COLUMNS),
        ]
    if kind == "item-wise":
        return [
            (
                "Item-wise Sales",
                report_service.item_wise_sales(start, end)["items"],
                export_service.ITEM_COLUMNS,
            )
        ]
    if kind == "staff-wise":
        return [
            (
                "Staff-wise Sales",
                report_service.staff_wise_sales(start, end)["staff"],
                export_service.STAFF_COLUMNS,
            )
        ]
    if kind == "expenses":
        return [
            (
                "Expenses",
                report_service.expense_report(start, end)["expenses"],
                export_service.EXPENSE_COLUMNS,
            )
        ]
    if kind == "profit-loss":
        return [
            (
                "Profit and Loss",
                export_service.pnl_rows(report_service.profit_loss(start, end)),
                export_service.PNL_COLUMNS,
            )
        ]
    if kind == "bills":
        since, until = report_service._window(start, end)
        rows = (
            db.session.query(Bill)
            .filter(Bill.status == BILL_PAID, Bill.paid_at >= since, Bill.paid_at <= until)
            .order_by(Bill.paid_at.desc())
            .all()
        )
        return [
            (
                "Bills",
                [b.to_dict(with_payments=False) for b in rows],
                export_service.BILL_COLUMNS,
            )
        ]
    raise ApiError(
        "Unknown report: " + kind,
        status=422,
        code="validation_error",
        details={
            "supported": [
                "daily",
                "item-wise",
                "staff-wise",
                "expenses",
                "profit-loss",
                "bills",
                "all",
            ]
        },
    )


@bp.get("/export/<kind>")
@admin_required
def export(kind: str):
    fmt = (request.args.get("format") or "csv").lower()
    if fmt not in {"csv", "xlsx", "excel"}:
        raise ApiError("format must be csv or xlsx.", status=422, code="validation_error")

    start, end = _range()
    if kind == "all":
        sheets = []
        for one in ("daily", "item-wise", "staff-wise", "expenses", "profit-loss"):
            sheets.extend(_rows_for(one, start, end))
    else:
        sheets = _rows_for(kind, start, end)

    stamp = start.isoformat() + "_to_" + end.isoformat()
    base = "annapurna-" + kind + "-" + stamp

    if fmt == "csv":
        name, rows, columns = sheets[0]
        body = export_service.to_csv(rows, columns)
        return Response(
            body,
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="' + base + '.csv"'},
        )

    body = export_service.to_xlsx(sheets, title="Annapurna Kitchen " + kind)
    return Response(
        body,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="' + base + '.xlsx"'},
    )


@bp.get("/quick-ranges")
@admin_required
def quick_ranges():
    today = date_cls.today()
    first_of_month = today.replace(day=1)
    last_month_end = first_of_month - timedelta(days=1)
    return ok(
        [
            {"label": "Today", "start_date": today.isoformat(), "end_date": today.isoformat()},
            {
                "label": "Yesterday",
                "start_date": (today - timedelta(days=1)).isoformat(),
                "end_date": (today - timedelta(days=1)).isoformat(),
            },
            {
                "label": "Last 7 days",
                "start_date": (today - timedelta(days=6)).isoformat(),
                "end_date": today.isoformat(),
            },
            {
                "label": "Last 30 days",
                "start_date": (today - timedelta(days=29)).isoformat(),
                "end_date": today.isoformat(),
            },
            {
                "label": "This month",
                "start_date": first_of_month.isoformat(),
                "end_date": today.isoformat(),
            },
            {
                "label": "Last month",
                "start_date": last_month_end.replace(day=1).isoformat(),
                "end_date": last_month_end.isoformat(),
            },
        ]
    )
