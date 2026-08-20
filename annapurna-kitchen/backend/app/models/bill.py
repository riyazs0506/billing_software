from ..extensions import db
from ..utils.money import D, money
from .base import TABLE_ARGS, Money, Percent, TimestampMixin, enum_col

BILL_PENDING = "pending"
BILL_PAID = "paid"
BILL_VOID = "void"
BILL_STATUSES = (BILL_PENDING, BILL_PAID, BILL_VOID)

TAX_MODE_EXCLUSIVE = "exclusive"
TAX_MODE_INCLUSIVE = "inclusive"
TAX_MODES = (TAX_MODE_EXCLUSIVE, TAX_MODE_INCLUSIVE)


class Bill(db.Model, TimestampMixin):
    """A GST invoice for all or part of an order.

    Several bills may point at one order - that is how "split one table order
    into multiple bills" works; each order_item carries the bill_id that
    settled it.
    """

    __tablename__ = "bills"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    bill_number = db.Column(db.String(24), nullable=False, unique=True, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)

    subtotal = db.Column(Money, nullable=False, default=0)
    discount_applied = db.Column(Money, nullable=False, default=0)
    discount_percentage = db.Column(Percent, nullable=False, default=0)
    discount_id = db.Column(db.Integer, db.ForeignKey("discounts.id"), nullable=True)
    discount_label = db.Column(db.String(80), nullable=True)

    taxable_value = db.Column(Money, nullable=False, default=0)
    cgst_rate = db.Column(Percent, nullable=False, default=0)
    sgst_rate = db.Column(Percent, nullable=False, default=0)
    cgst = db.Column(Money, nullable=False, default=0)
    sgst = db.Column(Money, nullable=False, default=0)
    tax_mode = db.Column(
        enum_col(*TAX_MODES, name="bill_tax_mode"), nullable=False, default=TAX_MODE_EXCLUSIVE
    )
    total = db.Column(Money, nullable=False, default=0)

    status = db.Column(
        enum_col(*BILL_STATUSES, name="bill_status"),
        nullable=False,
        default=BILL_PENDING,
        index=True,
    )
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True, index=True)
    paid_at = db.Column(db.DateTime, nullable=True, index=True)
    # Offline-queue idempotency key: replaying the same completion is a no-op.
    client_uid = db.Column(db.String(64), nullable=True, unique=True, index=True)

    order = db.relationship("Order", back_populates="bills")
    items = db.relationship("OrderItem", back_populates="bill", lazy="selectin")
    payments = db.relationship(
        "Payment", back_populates="bill", cascade="all, delete-orphan", lazy="selectin"
    )
    creator = db.relationship("User", foreign_keys=[created_by])
    customer = db.relationship("Customer", foreign_keys=[customer_id])
    discount = db.relationship("Discount")

    def amount_paid(self):
        return money(sum((D(p.amount) for p in self.payments), D(0)))

    def balance_due(self):
        return money(D(self.total) - self.amount_paid())

    def to_dict(self, with_items: bool = False, with_payments: bool = True) -> dict:
        data = {
            "id": self.id,
            "bill_number": self.bill_number,
            "order_id": self.order_id,
            "order_number": self.order.order_number if self.order else None,
            "order_type": self.order.order_type if self.order else None,
            "table_number": (
                self.order.table.table_number if self.order and self.order.table else None
            ),
            "subtotal": str(self.subtotal),
            "discount_applied": str(self.discount_applied),
            "discount_percentage": str(self.discount_percentage),
            "discount_label": self.discount_label,
            "taxable_value": str(self.taxable_value),
            "cgst_rate": str(self.cgst_rate),
            "sgst_rate": str(self.sgst_rate),
            "cgst": str(self.cgst),
            "sgst": str(self.sgst),
            "tax_mode": self.tax_mode,
            "total": str(self.total),
            "amount_paid": str(self.amount_paid()),
            "balance_due": str(self.balance_due()),
            "status": self.status,
            "created_by": self.created_by,
            "created_by_name": self.creator.name if self.creator else None,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else None,
            "customer_phone": self.customer.phone if self.customer else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }
        if with_items:
            data["items"] = [i.to_dict() for i in self.items]
        if with_payments:
            data["payments"] = [p.to_dict() for p in self.payments]
        return data
