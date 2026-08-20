from ..extensions import db
from .base import TABLE_ARGS, Money, enum_col, utcnow

MODE_CASH = "cash"
MODE_CARD = "card"
MODE_UPI = "upi"
PAYMENT_MODES = (MODE_CASH, MODE_CARD, MODE_UPI)


class Payment(db.Model):
    """One row per tender. Several rows on one bill = split payment
    (e.g. 500 cash + 300 UPI)."""

    __tablename__ = "payments"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    bill_id = db.Column(
        db.Integer,
        db.ForeignKey("bills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode = db.Column(enum_col(*PAYMENT_MODES, name="payment_mode"), nullable=False, index=True)
    amount = db.Column(Money, nullable=False)
    reference = db.Column(db.String(80), nullable=True)
    tendered = db.Column(Money, nullable=True)
    change_given = db.Column(Money, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    bill = db.relationship("Bill", back_populates="payments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "bill_id": self.bill_id,
            "mode": self.mode,
            "amount": str(self.amount),
            "reference": self.reference,
            "tendered": str(self.tendered) if self.tendered is not None else None,
            "change_given": (
                str(self.change_given) if self.change_given is not None else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
