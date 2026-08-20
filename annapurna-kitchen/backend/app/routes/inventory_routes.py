"""Raw materials, yield configuration, live output ranges and low-stock alerts.

Writes are admin-only. The cashier can read the low-stock alert feed, because
the banner has to appear on the billing screen too (08-UI-UX).
"""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin, current_user
from ..models import UNITS, MenuItem, RawMaterial, RecipeYield, StockMovement
from ..services import inventory_service, yield_calculator
from ..utils.money import D
from ..utils.responses import ApiError, ok
from ..utils.validators import as_bool, as_decimal, as_enum, as_int, as_string, require

bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")


def _get_material(material_id: int) -> RawMaterial:
    row = db.session.get(RawMaterial, material_id)
    if row is None:
        raise ApiError("Raw material not found.", status=404, code="not_found")
    return row


# --- dashboard -----------------------------------------------------------

@bp.get("/dashboard")
@admin_required
def dashboard():
    """Live card per raw material: stock, min/max output, linked dishes."""
    snapshots = yield_calculator.inventory_snapshot()
    return ok(
        {
            "materials": snapshots,
            "low_stock_count": sum(1 for s in snapshots if s["is_low_stock"]),
            "total_materials": len(snapshots),
        }
    )


@bp.get("/alerts")
@cashier_or_admin
def alerts():
    """Non-blocking low-stock banner feed for Billing + Inventory."""
    return ok(yield_calculator.low_stock_alerts())


# --- raw materials -------------------------------------------------------

@bp.get("/materials")
@admin_required
def list_materials():
    query = db.session.query(RawMaterial)
    if as_bool(request.args.get("active_only"), False):
        query = query.filter(RawMaterial.is_active.is_(True))
    rows = query.order_by(RawMaterial.name.asc()).all()
    return ok([yield_calculator.material_snapshot(r) for r in rows])


@bp.post("/materials")
@admin_required
def create_material():
    payload = require(request.get_json(silent=True), "name", "unit")
    name = as_string(payload["name"], "name", max_len=100)
    if db.session.query(RawMaterial).filter(RawMaterial.name == name).first():
        raise ApiError("That raw material already exists.", status=409, code="conflict")

    row = RawMaterial(
        name=name,
        unit=as_enum(payload["unit"], "unit", set(UNITS)),
        current_stock=as_decimal(payload.get("current_stock", 0), "current_stock", minimum="0"),
        low_stock_threshold=as_decimal(
            payload.get("low_stock_threshold", 20), "low_stock_threshold", minimum="0"
        ),
        is_active=as_bool(payload.get("is_active"), True),
    )
    db.session.add(row)
    db.session.flush()
    if D(row.current_stock) > 0:
        inventory_service.record_stock_entry(
            row, row.current_stock, user_id=current_user().id, note="Opening stock"
        )
    db.session.commit()
    return ok(yield_calculator.material_snapshot(row), status=201)


@bp.put("/materials/<int:material_id>")
@admin_required
def update_material(material_id: int):
    row = _get_material(material_id)
    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = as_string(payload["name"], "name", max_len=100)
        clash = (
            db.session.query(RawMaterial)
            .filter(RawMaterial.name == name, RawMaterial.id != row.id)
            .first()
        )
        if clash:
            raise ApiError("That raw material already exists.", status=409, code="conflict")
        row.name = name
    if "unit" in payload:
        row.unit = as_enum(payload["unit"], "unit", set(UNITS))
    if "low_stock_threshold" in payload:
        row.low_stock_threshold = as_decimal(
            payload["low_stock_threshold"], "low_stock_threshold", minimum="0"
        )
    if "is_active" in payload:
        row.is_active = as_bool(payload["is_active"], True)

    db.session.commit()
    return ok(yield_calculator.material_snapshot(row))


@bp.delete("/materials/<int:material_id>")
@admin_required
def delete_material(material_id: int):
    row = _get_material(material_id)
    if row.recipe_links:
        raise ApiError(
            "Unlink this material from its "
            + str(len(row.recipe_links))
            + " recipe(s) first.",
            status=409,
            code="conflict",
        )
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Raw material deleted."})


# --- daily stock entry ---------------------------------------------------

@bp.post("/materials/<int:material_id>/stock")
@admin_required
def update_stock(material_id: int):
    """Admin enters the day's stock figure; the yield range recalculates."""
    row = _get_material(material_id)
    payload = require(request.get_json(silent=True), "current_stock")
    inventory_service.record_stock_entry(
        row,
        as_decimal(payload["current_stock"], "current_stock", minimum="0"),
        user_id=current_user().id,
        note=payload.get("note") or "Daily stock entry",
    )
    db.session.commit()
    return ok(yield_calculator.material_snapshot(row))


@bp.post("/stock/bulk")
@admin_required
def bulk_stock():
    """Morning stock-taking for several materials in one call."""
    payload = require(request.get_json(silent=True), "entries")
    entries = payload["entries"]
    if not isinstance(entries, list) or not entries:
        raise ApiError("entries must be a non-empty list.", status=422, code="validation_error")

    updated = []
    for entry in entries:
        material = _get_material(as_int(entry.get("raw_material_id"), "raw_material_id", minimum=1))
        inventory_service.record_stock_entry(
            material,
            as_decimal(entry.get("current_stock"), "current_stock", minimum="0"),
            user_id=current_user().id,
            note=entry.get("note") or "Daily stock entry",
        )
        updated.append(material)
    db.session.commit()
    return ok([yield_calculator.material_snapshot(m) for m in updated])


@bp.get("/materials/<int:material_id>/movements")
@admin_required
def movements(material_id: int):
    _get_material(material_id)
    limit = min(int(request.args.get("limit", 50)), 200)
    rows = (
        db.session.query(StockMovement)
        .filter(StockMovement.raw_material_id == material_id)
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(limit)
        .all()
    )
    return ok([r.to_dict() for r in rows])


# --- yield configuration (recipe links) ---------------------------------

@bp.get("/yields")
@admin_required
def list_yields():
    query = db.session.query(RecipeYield)
    if request.args.get("menu_item_id"):
        query = query.filter(RecipeYield.menu_item_id == int(request.args["menu_item_id"]))
    if request.args.get("raw_material_id"):
        query = query.filter(
            RecipeYield.raw_material_id == int(request.args["raw_material_id"])
        )
    return ok([r.to_dict() for r in query.order_by(RecipeYield.id.asc()).all()])


@bp.post("/yields")
@admin_required
def create_yield():
    payload = require(
        request.get_json(silent=True),
        "menu_item_id",
        "raw_material_id",
        "min_yield_per_unit",
        "max_yield_per_unit",
        "avg_consumption_per_dish",
    )
    menu_item = db.session.get(MenuItem, as_int(payload["menu_item_id"], "menu_item_id", minimum=1))
    if menu_item is None or menu_item.is_deleted:
        raise ApiError("Menu item not found.", status=404, code="not_found")
    _get_material(as_int(payload["raw_material_id"], "raw_material_id", minimum=1))

    min_yield, max_yield = _validate_yields(payload)
    existing = (
        db.session.query(RecipeYield)
        .filter(
            RecipeYield.menu_item_id == menu_item.id,
            RecipeYield.raw_material_id == int(payload["raw_material_id"]),
        )
        .first()
    )
    if existing:
        raise ApiError(
            "That menu item is already linked to this raw material.",
            status=409,
            code="conflict",
        )

    row = RecipeYield(
        menu_item_id=menu_item.id,
        raw_material_id=int(payload["raw_material_id"]),
        min_yield_per_unit=min_yield,
        max_yield_per_unit=max_yield,
        avg_consumption_per_dish=as_decimal(
            payload["avg_consumption_per_dish"], "avg_consumption_per_dish", minimum="0"
        ),
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/yields/<int:yield_id>")
@admin_required
def update_yield(yield_id: int):
    row = db.session.get(RecipeYield, yield_id)
    if row is None:
        raise ApiError("Yield configuration not found.", status=404, code="not_found")
    payload = request.get_json(silent=True) or {}

    merged = {
        "min_yield_per_unit": payload.get("min_yield_per_unit", row.min_yield_per_unit),
        "max_yield_per_unit": payload.get("max_yield_per_unit", row.max_yield_per_unit),
    }
    row.min_yield_per_unit, row.max_yield_per_unit = _validate_yields(merged)
    if "avg_consumption_per_dish" in payload:
        row.avg_consumption_per_dish = as_decimal(
            payload["avg_consumption_per_dish"], "avg_consumption_per_dish", minimum="0"
        )
    db.session.commit()
    return ok(row.to_dict())


@bp.delete("/yields/<int:yield_id>")
@admin_required
def delete_yield(yield_id: int):
    row = db.session.get(RecipeYield, yield_id)
    if row is None:
        raise ApiError("Yield configuration not found.", status=404, code="not_found")
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Yield link removed."})


# --- live calculation ----------------------------------------------------

@bp.get("/calculate")
@admin_required
def calculate():
    """Ad-hoc "what if I had N units" preview: Output = Stock x Yield/unit."""
    stock = as_decimal(request.args.get("stock"), "stock", minimum="0")
    min_yield = as_decimal(request.args.get("min_yield"), "min_yield", minimum="0")
    max_yield = as_decimal(request.args.get("max_yield"), "max_yield", minimum="0")
    if max_yield < min_yield:
        raise ApiError(
            "max_yield cannot be less than min_yield.", status=422, code="validation_error"
        )
    min_output = yield_calculator.possible_output(stock, min_yield)
    max_output = yield_calculator.possible_output(stock, max_yield)
    return ok(
        {
            "stock": str(stock),
            "min_yield_per_unit": str(min_yield),
            "max_yield_per_unit": str(max_yield),
            "min_output": str(min_output),
            "max_output": str(max_output),
            "display": str(min_output) + "-" + str(max_output),
        }
    )


def _validate_yields(payload: dict):
    min_yield = as_decimal(payload["min_yield_per_unit"], "min_yield_per_unit", minimum="0")
    max_yield = as_decimal(payload["max_yield_per_unit"], "max_yield_per_unit", minimum="0")
    if max_yield < min_yield:
        raise ApiError(
            "max_yield_per_unit must be greater than or equal to min_yield_per_unit.",
            status=422,
            code="validation_error",
        )
    return min_yield, max_yield
