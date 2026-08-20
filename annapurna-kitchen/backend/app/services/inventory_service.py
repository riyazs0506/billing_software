"""Stock entry and recipe-linked auto-deduction.

Deduction runs inside the same transaction as bill completion, so a failure
rolls the whole thing back rather than leaving stock half-consumed.
"""
from __future__ import annotations

from ..extensions import db
from ..models import RawMaterial, RecipeYield, StockMovement
from ..utils.money import D, qty
from ..utils.responses import ApiError
from . import yield_calculator


def record_stock_entry(
    material: RawMaterial,
    new_stock,
    *,
    user_id: int | None,
    reason: str = "stock_entry",
    note: str | None = None,
) -> StockMovement:
    """Set an absolute stock figure (the admin's daily entry) and log the delta."""
    target = qty(new_stock)
    if target < 0:
        raise ApiError("Stock cannot be negative.", status=422, code="validation_error")

    before = qty(material.current_stock)
    material.current_stock = target
    movement = StockMovement(
        raw_material_id=material.id,
        change_qty=qty(target - before),
        balance_after=target,
        reason=reason,
        note=note,
        created_by=user_id,
    )
    db.session.add(movement)
    return movement


def adjust_stock(
    material: RawMaterial,
    delta,
    *,
    user_id: int | None,
    reason: str,
    note: str | None = None,
    bill_id: int | None = None,
) -> StockMovement:
    """Apply a relative change (negative for consumption). Never goes below 0."""
    change = qty(delta)
    balance = qty(D(material.current_stock) + change)
    if balance < 0:
        balance = qty(0)
        change = qty(balance - D(material.current_stock))
    material.current_stock = balance
    movement = StockMovement(
        raw_material_id=material.id,
        change_qty=change,
        balance_after=balance,
        reason=reason,
        note=note,
        bill_id=bill_id,
        created_by=user_id,
    )
    db.session.add(movement)
    return movement


def deduct_for_items(order_items, *, user_id: int | None, bill_id: int | None = None) -> list[dict]:
    """Recipe-linked deduction for a set of billed order items.

    For every line, every raw material linked to that menu item loses
    ``avg_consumption_per_dish x quantity``. Consumption is configuration, not
    a hardcoded constant.
    """
    wanted: dict[int, "D"] = {}
    for item in order_items:
        links = (
            db.session.query(RecipeYield)
            .filter(RecipeYield.menu_item_id == item.menu_item_id)
            .all()
        )
        for link in links:
            used = D(link.avg_consumption_per_dish) * D(item.quantity)
            wanted[link.raw_material_id] = wanted.get(link.raw_material_id, D(0)) + used

    if not wanted:
        return []

    materials = (
        db.session.query(RawMaterial)
        .filter(RawMaterial.id.in_(list(wanted.keys())))
        .with_for_update(read=False)
        .all()
        if db.session.bind and db.session.bind.dialect.name != "sqlite"
        else db.session.query(RawMaterial).filter(RawMaterial.id.in_(list(wanted.keys()))).all()
    )

    deducted = []
    for material in materials:
        used = qty(wanted[material.id])
        before = qty(material.current_stock)
        movement = adjust_stock(
            material,
            -used,
            user_id=user_id,
            reason="billing_deduction",
            bill_id=bill_id,
            note="Auto-deduction on bill completion",
        )
        deducted.append(
            {
                "raw_material_id": material.id,
                "raw_material_name": material.name,
                "unit": material.unit,
                "consumed": str(used),
                "stock_before": str(before),
                "stock_after": str(movement.balance_after),
            }
        )
    return deducted


def snapshot_after_billing(material_ids: list[int]) -> list[dict]:
    """Recalculated yield ranges for the materials a bill just touched."""
    if not material_ids:
        return []
    materials = (
        db.session.query(RawMaterial).filter(RawMaterial.id.in_(material_ids)).all()
    )
    return [yield_calculator.material_snapshot(m) for m in materials]
