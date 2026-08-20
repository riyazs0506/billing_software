from ..extensions import db
from ..utils.money import D, money
from .base import TABLE_ARGS, TimestampMixin, enum_col

ORDER_TYPE_DINE_IN = "dine_in"
ORDER_TYPE_TAKEAWAY = "takeaway"
ORDER_TYPES = (ORDER_TYPE_DINE_IN, ORDER_TYPE_TAKEAWAY)

STATUS_OPEN = "open"
STATUS_KOT_SENT = "kot_sent"
STATUS_BILLED = "billed"
STATUS_PAID = "paid"
STATUS_MERGED = "merged"
STATUS_CANCELLED = "cancelled"
ORDER_STATUSES = (
    STATUS_OPEN,
    STATUS_KOT_SENT,
    STATUS_BILLED,
    STATUS_PAID,
    STATUS_MERGED,
    STATUS_CANCELLED,
)

# Statuses that still hold a table.
ACTIVE_ORDER_STATUSES = (STATUS_OPEN, STATUS_KOT_SENT, STATUS_BILLED)


class Order(db.Model, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_number = db.Column(db.String(20), nullable=False, unique=True, index=True)
    table_id = db.Column(
        db.Integer, db.ForeignKey("tables.id"), nullable=True, index=True
    )  # NULL for takeaway
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True)
    order_type = db.Column(enum_col(*ORDER_TYPES, name="order_type"), nullable=False)
    status = db.Column(
        enum_col(*ORDER_STATUSES, name="order_status"),
        nullable=False,
        default=STATUS_OPEN,
        index=True,
    )
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    note = db.Column(db.String(255), nullable=True)
    kot_sent_at = db.Column(db.DateTime, nullable=True)
    kot_print_count = db.Column(db.Integer, nullable=False, default=0)
    # Set when this order was merged into another (large-group merge).
    merged_into_order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    # Idempotency key from the offline queue, so a replayed create is a no-op.
    client_uid = db.Column(db.String(64), nullable=True, unique=True, index=True)

    table = db.relationship("RestaurantTable", back_populates="orders")
    customer = db.relationship("Customer", back_populates="orders")
    creator = db.relationship("User", foreign_keys=[created_by])
    items = db.relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="OrderItem.id",
    )
    bills = db.relationship("Bill", back_populates="order", lazy="selectin")

    # --- derived helpers -------------------------------------------------
    @property
    def live_items(self):
        return [i for i in self.items if not i.is_voided]

    @property
    def unbilled_items(self):
        return [i for i in self.live_items if i.bill_id is None]

    def running_subtotal(self):
        return money(sum((i.line_total() for i in self.live_items), D(0)))

    def unbilled_subtotal(self):
        return money(sum((i.line_total() for i in self.unbilled_items), D(0)))

    def to_dict(self, with_items: bool = False, with_bills: bool = False) -> dict:
        data = {
            "id": self.id,
            "order_number": self.order_number,
            "table_id": self.table_id,
            "table_number": self.table.table_number if self.table else None,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else None,
            "customer_phone": self.customer.phone if self.customer else None,
            "order_type": self.order_type,
            "status": self.status,
            "created_by": self.created_by,
            "created_by_name": self.creator.name if self.creator else None,
            "note": self.note,
            "kot_sent_at": self.kot_sent_at.isoformat() if self.kot_sent_at else None,
            "kot_print_count": self.kot_print_count,
            "merged_into_order_id": self.merged_into_order_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "subtotal": str(self.running_subtotal()),
            "unbilled_subtotal": str(self.unbilled_subtotal()),
        }
        if with_items:
            data["items"] = [i.to_dict() for i in self.items if not i.is_voided]
        if with_bills:
            data["bills"] = [b.to_dict() for b in self.bills]
        return data
