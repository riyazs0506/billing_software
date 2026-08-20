"""Yield calculation engine.

    Output = Stock Quantity x Yield per Unit

Worked example from the spec (nothing here is hardcoded to it):

    Wheat flour, 20 kg in stock, 12-16 chapatis per kg
      minimum possible = 20 x 12 = 240 chapatis
      maximum possible = 20 x 16 = 320 chapatis

The same call handles rice, chicken, paneer or anything else configured in the
``recipe_yield`` table, because the yield numbers live in the database.
"""
from __future__ import annotations

from decimal import ROUND_DOWN, Decimal

from ..extensions import db
from ..models import MenuItem, RawMaterial, RecipeYield
from ..utils.money import D

WHOLE = Decimal("1")


def _floor(value) -> Decimal:
    """Portions are whole servings - you cannot sell 12.7 chapatis."""
    return D(value).quantize(WHOLE, rounding=ROUND_DOWN)


def possible_output(stock, yield_per_unit) -> Decimal:
    """Output = Stock Quantity x Yield per Unit."""
    return _floor(D(stock) * D(yield_per_unit))


def output_range_for_link(link: RecipeYield, stock=None) -> dict:
    """Min/max servings of one dish obtainable from one material's stock."""
    available = D(stock if stock is not None else link.raw_material.current_stock)
    min_out = possible_output(available, link.min_yield_per_unit)
    max_out = possible_output(available, link.max_yield_per_unit)
    if max_out < min_out:  # guards a mis-entered configuration
        min_out, max_out = max_out, min_out
    return {
        "menu_item_id": link.menu_item_id,
        "menu_item_name": link.menu_item.name if link.menu_item else None,
        "raw_material_id": link.raw_material_id,
        "raw_material_name": link.raw_material.name if link.raw_material else None,
        "unit": link.raw_material.unit if link.raw_material else None,
        "current_stock": str(available),
        "min_yield_per_unit": str(link.min_yield_per_unit),
        "max_yield_per_unit": str(link.max_yield_per_unit),
        "avg_consumption_per_dish": str(link.avg_consumption_per_dish),
        "min_output": str(min_out),
        "max_output": str(max_out),
        "display": f"{min_out}-{max_out}",
    }


def material_snapshot(material: RawMaterial) -> dict:
    """Live yield card for one raw material, including its low-stock verdict."""
    links = [l for l in material.recipe_links if l.menu_item and not l.menu_item.is_deleted]
    outputs = [output_range_for_link(l) for l in links]

    threshold = D(material.low_stock_threshold)
    if outputs:
        min_outputs = [D(o["min_output"]) for o in outputs]
        worst = min(min_outputs)
        is_low = worst < threshold
        headline = min(outputs, key=lambda o: D(o["min_output"]))
    else:
        # No recipe configured yet: fall back to comparing raw stock.
        worst = D(material.current_stock)
        is_low = worst < threshold
        headline = None

    return {
        **material.to_dict(),
        "linked_items": outputs,
        "linked_item_count": len(outputs),
        "lowest_min_output": str(worst),
        "is_low_stock": bool(is_low),
        "headline": headline,
        "headline_display": (
            f"{headline['min_output']}-{headline['max_output']} {headline['menu_item_name']}"
            if headline
            else f"{material.current_stock} {material.unit}"
        ),
    }


def inventory_snapshot(only_low: bool = False) -> list[dict]:
    materials = (
        db.session.query(RawMaterial)
        .filter(RawMaterial.is_active.is_(True))
        .order_by(RawMaterial.name.asc())
        .all()
    )
    snapshots = [material_snapshot(m) for m in materials]
    if only_low:
        snapshots = [s for s in snapshots if s["is_low_stock"]]
    return snapshots


def low_stock_alerts() -> list[dict]:
    """Compact payload for the non-blocking banner on Billing + Inventory."""
    alerts = []
    for snap in inventory_snapshot(only_low=True):
        alerts.append(
            {
                "raw_material_id": snap["id"],
                "raw_material_name": snap["name"],
                "unit": snap["unit"],
                "current_stock": snap["current_stock"],
                "lowest_min_output": snap["lowest_min_output"],
                "threshold": snap["low_stock_threshold"],
                "menu_item_name": (
                    snap["headline"]["menu_item_name"] if snap["headline"] else None
                ),
                "message": (
                    f"{snap['name']}: only {snap['lowest_min_output']} "
                    f"{snap['headline']['menu_item_name'] if snap['headline'] else snap['unit']} "
                    f"left (threshold {snap['low_stock_threshold']})"
                ),
            }
        )
    return alerts


def menu_item_availability(menu_item: MenuItem) -> dict:
    """How many servings of one dish the current stock supports."""
    links = list(menu_item.recipe_links)
    if not links:
        return {"constrained": False, "min_output": None, "max_output": None}
    ranges = [output_range_for_link(l) for l in links]
    # A dish needs every one of its materials, so the scarcest one is the cap.
    return {
        "constrained": True,
        "min_output": str(min(D(r["min_output"]) for r in ranges)),
        "max_output": str(min(D(r["max_output"]) for r in ranges)),
        "materials": ranges,
    }
