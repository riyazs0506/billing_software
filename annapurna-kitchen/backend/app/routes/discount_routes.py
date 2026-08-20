"""Discount rules: global toggle and special-date schedule.

Rule creation and editing is admin-only. The cashier can only *read* which
rule is currently active - the billing screen applies it automatically and the
cashier never types a percentage.
"""
from __future__ import annotations

from datetime import date as date_cls

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin
from ..models import DISCOUNT_TYPES, TYPE_GLOBAL, TYPE_SPECIAL_DATE, Discount
from ..services import discount_engine
from ..utils.responses import ApiError, ok
from ..utils.validators import (
    as_bool,
    as_enum,
    as_string,
    require,
    validate_date_range,
    validate_percentage,
)

bp = Blueprint("discounts", __name__, url_prefix="/api/discounts")


def _get(discount_id: int) -> Discount:
    row = db.session.get(Discount, discount_id)
    if row is None:
        raise ApiError("Discount rule not found.", status=404, code="not_found")
    return row


@bp.get("/active")
@cashier_or_admin
def active():
    """Which rule applies right now (billing screen badge)."""
    return ok(discount_engine.evaluate().to_dict())


@bp.get("")
@admin_required
def list_discounts():
    query = db.session.query(Discount)
    if request.args.get("type"):
        query = query.filter(Discount.type == request.args["type"])
    # NOTE: no .nullslast() here - MySQL has no NULLS LAST syntax and raises
    # a 1064. A plain DESC already sorts NULLs last on MySQL, and the global
    # rule (the only row with a NULL start_date) is returned separately anyway.
    rows = query.order_by(Discount.type.asc(), Discount.start_date.desc()).all()
    return ok(
        [r.to_dict() for r in rows],
        active=discount_engine.evaluate().to_dict(),
        upcoming=discount_engine.upcoming_specials(),
    )


@bp.get("/global")
@admin_required
def get_global():
    row = db.session.query(Discount).filter(Discount.type == TYPE_GLOBAL).first()
    if row is None:
        row = Discount(type=TYPE_GLOBAL, percentage=0, is_active=False, name="Global discount")
        db.session.add(row)
        db.session.commit()
    return ok(row.to_dict())


@bp.put("/global")
@admin_required
def set_global():
    """The single ON/OFF switch with its percentage."""
    payload = request.get_json(silent=True) or {}
    row = db.session.query(Discount).filter(Discount.type == TYPE_GLOBAL).first()
    if row is None:
        row = Discount(type=TYPE_GLOBAL, name="Global discount")
        db.session.add(row)

    if "percentage" in payload:
        row.percentage = validate_percentage(payload["percentage"])
    if "is_active" in payload:
        row.is_active = as_bool(payload["is_active"], False)
    if "name" in payload:
        row.name = as_string(payload["name"], "name", min_len=0, max_len=80) or None

    db.session.commit()
    return ok(row.to_dict(), active=discount_engine.evaluate().to_dict())


@bp.post("")
@admin_required
def create_discount():
    payload = require(request.get_json(silent=True), "type", "percentage")
    kind = as_enum(payload["type"], "type", set(DISCOUNT_TYPES))

    if kind == TYPE_GLOBAL:
        existing = db.session.query(Discount).filter(Discount.type == TYPE_GLOBAL).first()
        if existing:
            raise ApiError(
                "There is one global discount switch. Edit it instead.",
                status=409,
                code="conflict",
                details={"discount_id": existing.id},
            )
        start, end = None, None
    else:
        payload = require(payload, "start_date", "end_date")
        start, end = validate_date_range(payload["start_date"], payload["end_date"])

    row = Discount(
        name=as_string(payload.get("name") or "", "name", min_len=0, max_len=80) or None,
        type=kind,
        percentage=validate_percentage(payload["percentage"]),
        is_active=as_bool(payload.get("is_active"), True),
        start_date=start,
        end_date=end,
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/<int:discount_id>")
@admin_required
def update_discount(discount_id: int):
    row = _get(discount_id)
    payload = request.get_json(silent=True) or {}

    if "percentage" in payload:
        row.percentage = validate_percentage(payload["percentage"])
    if "is_active" in payload:
        row.is_active = as_bool(payload["is_active"], False)
    if "name" in payload:
        row.name = as_string(payload["name"], "name", min_len=0, max_len=80) or None
    if row.type == TYPE_SPECIAL_DATE and ("start_date" in payload or "end_date" in payload):
        row.start_date, row.end_date = validate_date_range(
            payload.get("start_date", row.start_date), payload.get("end_date", row.end_date)
        )

    db.session.commit()
    return ok(row.to_dict(), active=discount_engine.evaluate().to_dict())


@bp.delete("/<int:discount_id>")
@admin_required
def delete_discount(discount_id: int):
    row = _get(discount_id)
    if row.type == TYPE_GLOBAL:
        raise ApiError(
            "The global switch cannot be deleted - turn it off instead.",
            status=409,
            code="conflict",
        )
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Discount rule deleted."})


@bp.get("/evaluate")
@admin_required
def evaluate():
    """Preview which rule would apply on a chosen date."""
    on = request.args.get("date")
    when = date_cls.fromisoformat(on) if on else date_cls.today()
    return ok({"date": when.isoformat(), **discount_engine.evaluate(when).to_dict()})
