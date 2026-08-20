from ..extensions import db
from .base import TABLE_ARGS, TimestampMixin

# 01-PRD / spec: Starters, Main Course, Breads, Rice, Desserts, Beverages.
DEFAULT_CATEGORIES = (
    "Starters",
    "Main Course",
    "Breads",
    "Rice",
    "Desserts",
    "Beverages",
)


class Category(db.Model, TimestampMixin):
    __tablename__ = "categories"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    menu_items = db.relationship(
        "MenuItem", back_populates="category", lazy="selectin", order_by="MenuItem.name"
    )

    def to_dict(self, with_counts: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "sort_order": self.sort_order,
            "is_active": self.is_active,
        }
        if with_counts:
            data["item_count"] = len([i for i in self.menu_items if not i.is_deleted])
        return data
