import json

from ..extensions import db
from .base import TABLE_ARGS, TimestampMixin

# Business / tax / printer configuration, editable from the Settings screen.
DEFAULT_SETTINGS = {
    "business.name": "Annapurna Kitchen",
    "business.tagline": "Multi-Cuisine Restaurant",
    "business.address": "12 Gandhi Road, Coimbatore, Tamil Nadu 641001",
    "business.phone": "+91 98765 43210",
    "business.email": "hello@annapurnakitchen.in",
    "business.gstin": "33ABCDE1234F1Z5",
    "business.fssai": "12345678901234",
    "business.invoice_prefix": "AK",
    "business.currency_symbol": "Rs.",
    "business.receipt_footer": "Thank you for dining with us! Visit again.",
    "tax.gst_rate": "5.00",
    "tax.mode": "exclusive",
    "tax.enabled": "true",
    "printer.receipt_mode": "browser",
    "printer.kot_mode": "browser",
    "printer.paper_width": "80",
    "printer.qz_host": "localhost:8181",
    "printer.receipt_printer_name": "",
    "printer.kot_printer_name": "",
    "printer.auto_print_receipt": "true",
    "printer.auto_print_kot": "true",
    "inventory.low_stock_default_threshold": "20",
    "loyalty.enabled": "false",
    "loyalty.points_per_100": "1",
}

# Keys the cashier UI is allowed to read (business + tax + printer only).
PUBLIC_SETTING_PREFIXES = ("business.", "tax.", "printer.", "loyalty.")


class Setting(db.Model, TimestampMixin):
    __tablename__ = "settings"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    key = db.Column(db.String(80), nullable=False, unique=True, index=True)
    value = db.Column(db.Text, nullable=True)

    @staticmethod
    def get(key: str, default=None):
        row = db.session.query(Setting).filter_by(key=key).first()
        if row is None or row.value is None:
            return DEFAULT_SETTINGS.get(key, default)
        return row.value

    @staticmethod
    def get_bool(key: str, default: bool = False) -> bool:
        return str(Setting.get(key, "true" if default else "false")).lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

    @staticmethod
    def set(key: str, value) -> "Setting":
        row = db.session.query(Setting).filter_by(key=key).first()
        if row is None:
            row = Setting(key=key)
            db.session.add(row)
        row.value = None if value is None else str(value)
        return row

    @staticmethod
    def as_dict(prefixes: tuple[str, ...] | None = None) -> dict:
        merged = dict(DEFAULT_SETTINGS)
        for row in db.session.query(Setting).all():
            merged[row.key] = row.value
        if prefixes:
            merged = {k: v for k, v in merged.items() if k.startswith(prefixes)}
        return merged

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value}


def settings_to_nested(flat: dict) -> dict:
    """Turn dotted keys into a nested object for the frontend."""
    nested: dict = {}
    for key, value in flat.items():
        head, _, tail = key.partition(".")
        nested.setdefault(head, {})[tail or head] = value
    return json.loads(json.dumps(nested))
