from ..extensions import db
from .base import TABLE_ARGS, Percent, TimestampMixin, enum_col

TYPE_GLOBAL = "global"
TYPE_SPECIAL_DATE = "special_date"
DISCOUNT_TYPES = (TYPE_GLOBAL, TYPE_SPECIAL_DATE)


class Discount(db.Model, TimestampMixin):
    """Two mechanisms, per the spec:

    * ``global``       - one ON/OFF switch with a percentage that applies to
                         every new bill until it is switched off.
    * ``special_date`` - a scheduled date range that auto-activates itself on
                         the day; no manual toggling needed.

    Rules are evaluated at bill-generation time only. Bills that were already
    generated are never recalculated.
    """

    __tablename__ = "discounts"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(80), nullable=True)
    type = db.Column(enum_col(*DISCOUNT_TYPES, name="discount_type"), nullable=False, index=True)
    percentage = db.Column(Percent, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=False, index=True)
    start_date = db.Column(db.Date, nullable=True, index=True)
    end_date = db.Column(db.Date, nullable=True, index=True)

    def label(self) -> str:
        if self.name:
            return self.name
        return "Global discount" if self.type == TYPE_GLOBAL else "Special-date discount"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "label": self.label(),
            "type": self.type,
            "percentage": str(self.percentage),
            "is_active": self.is_active,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
        }
