"""Discount rule evaluation.

The spec describes a global ON/OFF toggle plus a special-date *override*:

    "A special-date schedule: pick a date, set a discount %, and it
     auto-activates only on that date/range - no manual toggling needed."

So the precedence is:

    1. Any active special_date rule whose range covers today wins. If more than
       one qualifies, the largest percentage is used.
    2. Otherwise the global rule, if its toggle is ON.
    3. Otherwise no discount.

Evaluation happens once, at bill-generation time. A stored bill keeps the
percentage it was generated with - completed bills are never recalculated.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_cls
from decimal import Decimal

from ..extensions import db
from ..models import TYPE_GLOBAL, TYPE_SPECIAL_DATE, Discount
from ..utils.money import D


@dataclass
class ActiveDiscount:
    percentage: Decimal
    discount_id: int | None
    label: str
    type: str | None

    def to_dict(self) -> dict:
        return {
            "percentage": str(self.percentage),
            "discount_id": self.discount_id,
            "label": self.label,
            "type": self.type,
        }


NO_DISCOUNT = ActiveDiscount(D("0"), None, "No discount", None)


def evaluate(on_date: date_cls | None = None) -> ActiveDiscount:
    """Return the discount rule that applies on ``on_date`` (default: today)."""
    today = on_date or date_cls.today()

    specials = (
        db.session.query(Discount)
        .filter(
            Discount.type == TYPE_SPECIAL_DATE,
            Discount.is_active.is_(True),
            Discount.start_date <= today,
            Discount.end_date >= today,
        )
        .order_by(Discount.percentage.desc())
        .all()
    )
    if specials:
        best = specials[0]
        if D(best.percentage) > 0:
            return ActiveDiscount(D(best.percentage), best.id, best.label(), best.type)

    global_rule = (
        db.session.query(Discount)
        .filter(Discount.type == TYPE_GLOBAL, Discount.is_active.is_(True))
        .order_by(Discount.percentage.desc())
        .first()
    )
    if global_rule and D(global_rule.percentage) > 0:
        return ActiveDiscount(
            D(global_rule.percentage), global_rule.id, global_rule.label(), global_rule.type
        )

    return NO_DISCOUNT


def upcoming_specials(limit: int = 5, from_date: date_cls | None = None) -> list[dict]:
    """Special-date rules scheduled to start in the future (for the admin UI)."""
    today = from_date or date_cls.today()
    rows = (
        db.session.query(Discount)
        .filter(
            Discount.type == TYPE_SPECIAL_DATE,
            Discount.is_active.is_(True),
            Discount.start_date > today,
        )
        .order_by(Discount.start_date.asc())
        .limit(limit)
        .all()
    )
    return [r.to_dict() for r in rows]
