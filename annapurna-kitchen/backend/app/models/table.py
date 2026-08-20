from ..extensions import db
from .base import TABLE_ARGS, TimestampMixin, enum_col

# Operational states only. There is no reservation system (explicitly out of
# scope in 01-PRD section 6) - tables exist purely to track active orders.
STATUS_EMPTY = "empty"
STATUS_OCCUPIED = "occupied"
STATUS_BILL_PENDING = "bill_pending"
TABLE_STATUSES = (STATUS_EMPTY, STATUS_OCCUPIED, STATUS_BILL_PENDING)


class RestaurantTable(db.Model, TimestampMixin):
    __tablename__ = "tables"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    table_number = db.Column(db.String(10), nullable=False, unique=True)
    seats = db.Column(db.Integer, nullable=False, default=4)
    status = db.Column(
        enum_col(*TABLE_STATUSES, name="table_status"),
        nullable=False,
        default=STATUS_EMPTY,
        index=True,
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    orders = db.relationship("Order", back_populates="table", lazy="dynamic")

    def active_order(self):
        from .order import Order, ACTIVE_ORDER_STATUSES

        return (
            self.orders.filter(Order.status.in_(ACTIVE_ORDER_STATUSES))
            .order_by(Order.id.desc())
            .first()
        )

    def to_dict(self, with_order: bool = False) -> dict:
        data = {
            "id": self.id,
            "table_number": self.table_number,
            "seats": self.seats,
            "status": self.status,
            "is_active": self.is_active,
        }
        if with_order:
            order = self.active_order()
            data["active_order"] = order.to_dict(with_items=True) if order else None
        return data
