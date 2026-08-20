from ..extensions import db
from .base import TABLE_ARGS, TimestampMixin


class Customer(db.Model, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(15), nullable=False, unique=True, index=True)
    loyalty_points = db.Column(db.Integer, nullable=False, default=0)
    note = db.Column(db.String(255), nullable=True)

    orders = db.relationship("Order", back_populates="customer", lazy="dynamic")

    def to_dict(self, stats: dict | None = None) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "loyalty_points": self.loyalty_points,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if stats:
            data.update(stats)
        return data
