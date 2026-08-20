"""Business info, tax, printer and receipt configuration.

There are deliberately no staff-management settings here.
"""
from __future__ import annotations

from flask import Blueprint, request

from ..extensions import db
from ..middleware import admin_required, cashier_or_admin
from ..models import (
    DEFAULT_SETTINGS,
    PUBLIC_SETTING_PREFIXES,
    TAX_MODES,
    Setting,
    settings_to_nested,
)
from ..utils.responses import ApiError, ok
from ..utils.validators import as_decimal, as_enum, require

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

# Keys an admin is allowed to write. Anything else is rejected outright.
EDITABLE_PREFIXES = ("business.", "tax.", "printer.", "inventory.", "loyalty.")


@bp.get("/public")
@cashier_or_admin
def public_settings():
    """Business + tax + printer config the billing screen and receipts need."""
    flat = Setting.as_dict(PUBLIC_SETTING_PREFIXES)
    return ok({"flat": flat, "nested": settings_to_nested(flat)})


@bp.get("")
@admin_required
def get_settings():
    flat = Setting.as_dict()
    return ok(
        {
            "flat": flat,
            "nested": settings_to_nested(flat),
            "defaults": DEFAULT_SETTINGS,
            "editable_prefixes": list(EDITABLE_PREFIXES),
        }
    )


@bp.put("")
@admin_required
def update_settings():
    payload = require(request.get_json(silent=True), "settings")
    incoming = payload["settings"]
    if not isinstance(incoming, dict) or not incoming:
        raise ApiError(
            "settings must be a non-empty object of key/value pairs.",
            status=422,
            code="validation_error",
        )

    rejected = [k for k in incoming if not str(k).startswith(EDITABLE_PREFIXES)]
    if rejected:
        raise ApiError(
            "These settings cannot be changed: " + ", ".join(sorted(rejected)),
            status=422,
            code="validation_error",
            details={"keys": sorted(rejected)},
        )

    for key, value in incoming.items():
        _validate(key, value)
        Setting.set(key, value)

    db.session.commit()
    flat = Setting.as_dict()
    return ok({"flat": flat, "nested": settings_to_nested(flat)})


def _validate(key: str, value) -> None:
    if key == "tax.gst_rate":
        as_decimal(value, "tax.gst_rate", minimum="0", maximum="100")
    elif key == "tax.mode":
        as_enum(value, "tax.mode", set(TAX_MODES))
    elif key == "inventory.low_stock_default_threshold":
        as_decimal(value, key, minimum="0")
    elif key == "loyalty.points_per_100":
        as_decimal(value, key, minimum="0")
    elif key == "printer.paper_width":
        as_enum(str(value), "printer.paper_width", {"58", "80"})
    elif key in ("printer.receipt_mode", "printer.kot_mode"):
        as_enum(value, key, {"browser", "qz", "webusb", "bluetooth", "none"})
    elif key == "business.gstin" and value:
        text = str(value).strip()
        if len(text) != 15:
            raise ApiError(
                "A GSTIN is 15 characters.", status=422, code="validation_error",
                details={"field": key},
            )


@bp.post("/printer/test")
@admin_required
def printer_test():
    """Returns a fixed test payload the client sends to the printer.

    The server never talks to the printer directly - the printer is attached
    to the billing device (02-TRD), so the browser owns that transport.
    """
    flat = Setting.as_dict(("business.", "printer."))
    return ok(
        {
            "kind": "test",
            "business_name": flat.get("business.name"),
            "paper_width": flat.get("printer.paper_width", "80"),
            "receipt_mode": flat.get("printer.receipt_mode", "browser"),
            "kot_mode": flat.get("printer.kot_mode", "browser"),
            "lines": [
                "PRINTER TEST",
                flat.get("business.name", "Annapurna Kitchen"),
                "GSTIN: " + str(flat.get("business.gstin", "")),
                "If you can read this, printing works.",
            ],
        }
    )


@bp.post("/reset")
@admin_required
def reset_settings():
    """Restore the shipped defaults for a group of keys."""
    payload = request.get_json(silent=True) or {}
    prefix = payload.get("prefix")
    if prefix and not str(prefix).startswith(EDITABLE_PREFIXES):
        raise ApiError("That group cannot be reset.", status=422, code="validation_error")

    keys = [k for k in DEFAULT_SETTINGS if not prefix or k.startswith(prefix)]
    for key in keys:
        Setting.set(key, DEFAULT_SETTINGS[key])
    db.session.commit()
    flat = Setting.as_dict()
    return ok({"flat": flat, "nested": settings_to_nested(flat), "reset_count": len(keys)})
