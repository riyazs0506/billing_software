"""Expense tracking (admin only). Feeds the profit/loss report."""
from __future__ import annotations

from datetime import date as date_cls

from flask import Blueprint, request
from sqlalchemy import func

from ..extensions import db
from ..middleware import admin_required, current_user
from ..models import Expense
from ..utils.money import money
from ..utils.responses import ApiError, ok, paginated
from ..utils.validators import as_date, as_decimal, as_string, require, validate_date_range

bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


def _get(expense_id: int) -> Expense:
    row = db.session.get(Expense, expense_id)
    if row is None:
        raise ApiError("Expense not found.", status=404, code="not_found")
    return row


@bp.get("")
@admin_required
def list_expenses():
    query = db.session.query(Expense)

    start, end = validate_date_range(
        request.args.get("start_date"), request.args.get("end_date"), allow_none=True
    )
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)
    if request.args.get("category"):
        query = query.filter(Expense.category == request.args["category"])
    if request.args.get("search"):
        query = query.filter(Expense.description.like("%" + request.args["search"] + "%"))

    total_amount = money(
        query.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()
    )

    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(int(request.args.get("per_page", 25)), 100)
    total = query.count()
    rows = (
        query.order_by(Expense.date.desc(), Expense.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return paginated(
        [r.to_dict() for r in rows], total, page, per_page, total_amount=str(total_amount)
    )


@bp.post("")
@admin_required
def create_expense():
    payload = require(request.get_json(silent=True), "description", "amount")
    row = Expense(
        description=as_string(payload["description"], "description", max_len=255),
        category=(
            as_string(payload["category"], "category", min_len=0, max_len=60)
            if payload.get("category")
            else None
        ),
        amount=as_decimal(payload["amount"], "amount", minimum="0.01"),
        date=as_date(payload.get("date") or date_cls.today(), "date"),
        created_by=current_user().id,
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/<int:expense_id>")
@admin_required
def update_expense(expense_id: int):
    row = _get(expense_id)
    payload = request.get_json(silent=True) or {}

    if "description" in payload:
        row.description = as_string(payload["description"], "description", max_len=255)
    if "category" in payload:
        row.category = (
            as_string(payload["category"], "category", min_len=0, max_len=60) or None
        )
    if "amount" in payload:
        row.amount = as_decimal(payload["amount"], "amount", minimum="0.01")
    if "date" in payload:
        row.date = as_date(payload["date"], "date")

    db.session.commit()
    return ok(row.to_dict())


@bp.delete("/<int:expense_id>")
@admin_required
def delete_expense(expense_id: int):
    row = _get(expense_id)
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Expense deleted."})


@bp.get("/categories")
@admin_required
def categories():
    rows = (
        db.session.query(Expense.category)
        .filter(Expense.category.isnot(None))
        .distinct()
        .all()
    )
    known = {r[0] for r in rows if r[0]}
    suggested = {
        "Raw material",
        "Vegetables",
        "Gas",
        "Electricity",
        "Rent",
        "Wages",
        "Maintenance",
        "Packaging",
        "Miscellaneous",
    }
    return ok(sorted(known | suggested))
