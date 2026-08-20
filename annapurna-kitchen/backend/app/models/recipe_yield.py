from ..extensions import db
from .base import TABLE_ARGS, Rate, TimestampMixin


class RecipeYield(db.Model, TimestampMixin):
    """Links a menu item to a raw material with its min/max yield per unit.

    This is the heart of the 20 kg wheat produces 240-320 chapatis engine.
    All three numbers are configuration rows, never hardcoded business logic.
    """

    __tablename__ = "recipe_yield"
    __table_args__ = (
        db.UniqueConstraint("menu_item_id", "raw_material_id", name="uq_recipe_pair"),
        TABLE_ARGS,
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    menu_item_id = db.Column(
        db.Integer,
        db.ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    raw_material_id = db.Column(
        db.Integer,
        db.ForeignKey("raw_materials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # e.g. 12 chapatis per kg of wheat flour
    min_yield_per_unit = db.Column(Rate, nullable=False)
    # e.g. 16 chapatis per kg of wheat flour
    max_yield_per_unit = db.Column(Rate, nullable=False)
    # e.g. 0.075 kg of wheat flour consumed by one chapati
    avg_consumption_per_dish = db.Column(Rate, nullable=False)

    menu_item = db.relationship("MenuItem", back_populates="recipe_links")
    raw_material = db.relationship("RawMaterial", back_populates="recipe_links")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "menu_item_id": self.menu_item_id,
            "menu_item_name": self.menu_item.name if self.menu_item else None,
            "raw_material_id": self.raw_material_id,
            "raw_material_name": self.raw_material.name if self.raw_material else None,
            "unit": self.raw_material.unit if self.raw_material else None,
            "min_yield_per_unit": str(self.min_yield_per_unit),
            "max_yield_per_unit": str(self.max_yield_per_unit),
            "avg_consumption_per_dish": str(self.avg_consumption_per_dish),
        }
