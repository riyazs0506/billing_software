from ..extensions import db
from ..utils.money import D, money
from .base import TABLE_ARGS, Money, TimestampMixin


class OrderItem(db.Model, TimestampMixin):
    __tablename__ = "order_items"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_item_id = db.Column(
        db.Integer, db.ForeignKey("menu_items.id"), nullable=False, index=True
    )
    quantity = db.Column(db.Integer, nullable=False, default=1)
    price_at_order = db.Column(Money, nullable=False)
    note = db.Column(db.String(160), nullable=True)
    # Which bill settled this line. NULL until billed; this is what makes
    # "split one table into multiple bills" possible.
    bill_id = db.Column(db.Integer, db.ForeignKey("bills.id"), nullable=True, index=True)
    kot_sent = db.Column(db.Boolean, nullable=False, default=False)
    is_voided = db.Column(db.Boolean, nullable=False, default=False)

    order = db.relationship("Order", back_populates="items")
    menu_item = db.relationship("MenuItem")
    bill = db.relationship("Bill", back_populates="items")

    def line_total(self):
        return money(D(self.price_at_order) * D(self.quantity))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "order_id": self.order_id,
            "menu_item_id": self.menu_item_id,
            "name": self.menu_item.name if self.menu_item else None,
            "category_name": (
                self.menu_item.category.name
                if self.menu_item and self.menu_item.category
                else None
            ),
            "quantity": self.quantity,
            "price_at_order": str(self.price_at_order),
            "line_total": str(self.line_total()),
            "note": self.note,
            "bill_id": self.bill_id,
            "kot_sent": self.kot_sent,
        }
