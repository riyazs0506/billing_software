from ..extensions import db
from .base import TABLE_ARGS, Money, TimestampMixin


class Expense(db.Model, TimestampMixin):
    __tablename__ = "expenses"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    description = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(60), nullable=True)
    amount = db.Column(Money, nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    creator = db.relationship("User", foreign_keys=[created_by])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "category": self.category,
            "amount": str(self.amount),
            "date": self.date.isoformat() if self.date else None,
            "created_by": self.created_by,
            "created_by_name": self.creator.name if self.creator else None,
        }
