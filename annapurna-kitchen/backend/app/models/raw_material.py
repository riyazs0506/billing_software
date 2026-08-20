from ..extensions import db
from .base import TABLE_ARGS, Stock, TimestampMixin, enum_col, utcnow

UNITS = ("kg", "litre", "unit")


class RawMaterial(db.Model, TimestampMixin):
    __tablename__ = "raw_materials"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    unit = db.Column(enum_col(*UNITS, name="material_unit"), nullable=False, default="kg")
    current_stock = db.Column(Stock, nullable=False, default=0)
    # Alert fires when the minimum possible output of any linked dish falls
    # below this figure (spec example: under 20 plates remaining).
    low_stock_threshold = db.Column(Stock, nullable=False, default=20)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    recipe_links = db.relationship(
        "RecipeYield",
        back_populates="raw_material",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    movements = db.relationship(
        "StockMovement",
        back_populates="raw_material",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "unit": self.unit,
            "current_stock": str(self.current_stock),
            "low_stock_threshold": str(self.low_stock_threshold),
            "is_active": self.is_active,
        }


class StockMovement(db.Model):
    """Audit trail for every stock change: manual entry or billing deduction."""

    __tablename__ = "stock_movements"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    raw_material_id = db.Column(
        db.Integer,
        db.ForeignKey("raw_materials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    change_qty = db.Column(Stock, nullable=False)
    balance_after = db.Column(Stock, nullable=False)
    reason = db.Column(
        enum_col(
            "stock_entry",
            "billing_deduction",
            "correction",
            "wastage",
            name="stock_movement_reason",
        ),
        nullable=False,
    )
    bill_id = db.Column(db.Integer, db.ForeignKey("bills.id"), nullable=True, index=True)
    note = db.Column(db.String(255), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    raw_material = db.relationship("RawMaterial", back_populates="movements")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "raw_material_id": self.raw_material_id,
            "raw_material_name": self.raw_material.name if self.raw_material else None,
            "change_qty": str(self.change_qty),
            "balance_after": str(self.balance_after),
            "reason": self.reason,
            "bill_id": self.bill_id,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
