"""Categories and menu items.

Reads are open to both roles (the cashier needs the grid). Every write is
admin-only and enforced here on the server.
"""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin
from ..models import Category, MenuItem
from ..services import yield_calculator
from ..utils.responses import ApiError, ok
from ..utils.validators import as_bool, as_decimal, as_int, as_string, require

bp = Blueprint("menu", __name__, url_prefix="/api/menu")


def _get_category(category_id: int) -> Category:
    row = db.session.get(Category, category_id)
    if row is None:
        raise ApiError("Category not found.", status=404, code="not_found")
    return row


def _get_item(item_id: int) -> MenuItem:
    row = db.session.get(MenuItem, item_id)
    if row is None or row.is_deleted:
        raise ApiError("Menu item not found.", status=404, code="not_found")
    return row


# --- categories ----------------------------------------------------------

@bp.get("/categories")
@cashier_or_admin
def list_categories():
    rows = (
        db.session.query(Category)
        .order_by(Category.sort_order.asc(), Category.name.asc())
        .all()
    )
    if as_bool(request.args.get("active_only"), False):
        rows = [r for r in rows if r.is_active]
    return ok([r.to_dict(with_counts=True) for r in rows])


@bp.post("/categories")
@admin_required
def create_category():
    payload = require(request.get_json(silent=True), "name")
    name = as_string(payload["name"], "name", max_len=100)
    if db.session.query(Category).filter(Category.name == name).first():
        raise ApiError("A category with that name already exists.", status=409, code="conflict")

    row = Category(
        name=name,
        sort_order=as_int(payload.get("sort_order", 0), "sort_order", minimum=0),
        is_active=as_bool(payload.get("is_active"), True),
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/categories/<int:category_id>")
@admin_required
def update_category(category_id: int):
    row = _get_category(category_id)
    payload = request.get_json(silent=True) or {}
    if "name" in payload:
        name = as_string(payload["name"], "name", max_len=100)
        clash = (
            db.session.query(Category)
            .filter(Category.name == name, Category.id != row.id)
            .first()
        )
        if clash:
            raise ApiError("A category with that name already exists.", status=409, code="conflict")
        row.name = name
    if "sort_order" in payload:
        row.sort_order = as_int(payload["sort_order"], "sort_order", minimum=0)
    if "is_active" in payload:
        row.is_active = as_bool(payload["is_active"], True)
    db.session.commit()
    return ok(row.to_dict())


@bp.delete("/categories/<int:category_id>")
@admin_required
def delete_category(category_id: int):
    row = _get_category(category_id)
    live = [i for i in row.menu_items if not i.is_deleted]
    if live:
        raise ApiError(
            "Move or remove the " + str(len(live)) + " item(s) in this category first.",
            status=409,
            code="conflict",
        )
    db.session.delete(row)
    db.session.commit()
    return ok({"message": "Category deleted."})


# --- menu items ----------------------------------------------------------

@bp.get("/items")
@cashier_or_admin
def list_items():
    query = db.session.query(MenuItem).filter(MenuItem.is_deleted.is_(False))

    if request.args.get("category_id"):
        query = query.filter(MenuItem.category_id == int(request.args["category_id"]))
    if request.args.get("search"):
        needle = "%" + request.args["search"].strip() + "%"
        query = query.filter(MenuItem.name.like(needle))
    if as_bool(request.args.get("available_only"), False):
        query = query.filter(MenuItem.is_available.is_(True))

    rows = query.order_by(MenuItem.name.asc()).all()
    with_recipe = as_bool(request.args.get("with_recipe"), False)
    return ok([r.to_dict(with_recipe=with_recipe) for r in rows])


@bp.get("/items/grid")
@cashier_or_admin
def grid():
    """Category-grouped payload the POS billing screen renders directly."""
    categories = (
        db.session.query(Category)
        .filter(Category.is_active.is_(True))
        .order_by(Category.sort_order.asc(), Category.name.asc())
        .all()
    )
    items = (
        db.session.query(MenuItem)
        .filter(MenuItem.is_deleted.is_(False))
        .order_by(MenuItem.name.asc())
        .all()
    )
    by_category: dict[int, list] = {}
    for item in items:
        by_category.setdefault(item.category_id, []).append(item.to_dict())

    return ok(
        {
            "categories": [
                {**c.to_dict(), "items": by_category.get(c.id, [])} for c in categories
            ],
            "low_stock_alerts": yield_calculator.low_stock_alerts(),
        }
    )


@bp.get("/items/<int:item_id>")
@cashier_or_admin
def get_item(item_id: int):
    item = _get_item(item_id)
    data = item.to_dict(with_recipe=True)
    data["availability"] = yield_calculator.menu_item_availability(item)
    return ok(data)


@bp.post("/items")
@admin_required
def create_item():
    payload = require(request.get_json(silent=True), "name", "category_id", "price")
    _get_category(as_int(payload["category_id"], "category_id", minimum=1))

    row = MenuItem(
        category_id=int(payload["category_id"]),
        name=as_string(payload["name"], "name", max_len=150),
        description=(
            as_string(payload["description"], "description", min_len=0, max_len=255)
            if payload.get("description")
            else None
        ),
        price=as_decimal(payload["price"], "price", minimum="0"),
        is_available=as_bool(payload.get("is_available"), True),
    )
    db.session.add(row)
    db.session.commit()
    return ok(row.to_dict(), status=201)


@bp.put("/items/<int:item_id>")
@admin_required
def update_item(item_id: int):
    row = _get_item(item_id)
    payload = request.get_json(silent=True) or {}

    if "category_id" in payload:
        _get_category(as_int(payload["category_id"], "category_id", minimum=1))
        row.category_id = int(payload["category_id"])
    if "name" in payload:
        row.name = as_string(payload["name"], "name", max_len=150)
    if "description" in payload:
        row.description = (
            as_string(payload["description"], "description", min_len=0, max_len=255)
            or None
        )
    if "price" in payload:
        row.price = as_decimal(payload["price"], "price", minimum="0")
    if "is_available" in payload:
        row.is_available = as_bool(payload["is_available"], True)

    db.session.commit()
    return ok(row.to_dict())


@bp.patch("/items/<int:item_id>/availability")
@admin_required
def toggle_availability(item_id: int):
    row = _get_item(item_id)
    payload = request.get_json(silent=True) or {}
    row.is_available = (
        as_bool(payload["is_available"], True)
        if "is_available" in payload
        else not row.is_available
    )
    db.session.commit()
    return ok(row.to_dict())


@bp.delete("/items/<int:item_id>")
@admin_required
def delete_item(item_id: int):
    """Soft delete - historical bills must keep pointing at the item."""
    row = _get_item(item_id)
    row.is_deleted = True
    row.is_available = False
    db.session.commit()
    return ok({"message": row.name + " removed from the menu."})
