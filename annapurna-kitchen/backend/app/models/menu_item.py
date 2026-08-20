from ..extensions import db
from .base import TABLE_ARGS, Money, TimestampMixin


class MenuItem(db.Model, TimestampMixin):
    __tablename__ = "menu_items"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(
        db.Integer, db.ForeignKey("categories.id"), nullable=False, index=True
    )
    name = db.Column(db.String(150), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    price = db.Column(Money, nullable=False)
    is_available = db.Column(db.Boolean, nullable=False, default=True, index=True)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False, index=True)

    category = db.relationship("Category", back_populates="menu_items")
    recipe_links = db.relationship(
        "RecipeYield",
        back_populates="menu_item",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self, with_recipe: bool = False) -> dict:
        data = {
            "id": self.id,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "name": self.name,
            "description": self.description,
            "price": str(self.price),
            "is_available": self.is_available,
        }
        if with_recipe:
            data["recipe"] = [link.to_dict() for link in self.recipe_links]
        return data
