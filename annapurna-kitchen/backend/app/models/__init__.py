"""SQLAlchemy models.

Deliberately absent: any staff/employee management model beyond the ``User``
row needed for authentication and the ``Shift`` row needed for login/logout
audit. There is no staff CRUD anywhere in this application.
"""
from .backup_log import BackupLog
from .base import TABLE_ARGS, Money, Percent, Rate, Stock, TimestampMixin, utcnow
from .bill import (
    BILL_PAID,
    BILL_PENDING,
    BILL_STATUSES,
    BILL_VOID,
    TAX_MODE_EXCLUSIVE,
    TAX_MODE_INCLUSIVE,
    TAX_MODES,
    Bill,
)
from .category import DEFAULT_CATEGORIES, Category
from .customer import Customer
from .discount import DISCOUNT_TYPES, TYPE_GLOBAL, TYPE_SPECIAL_DATE, Discount
from .expense import Expense
from .menu_item import MenuItem
from .order import (
    ACTIVE_ORDER_STATUSES,
    ORDER_STATUSES,
    ORDER_TYPE_DINE_IN,
    ORDER_TYPE_TAKEAWAY,
    ORDER_TYPES,
    STATUS_BILLED,
    STATUS_CANCELLED,
    STATUS_KOT_SENT,
    STATUS_MERGED,
    STATUS_OPEN,
    STATUS_PAID,
    Order,
)
from .order_item import OrderItem
from .payment import MODE_CARD, MODE_CASH, MODE_UPI, PAYMENT_MODES, Payment
from .raw_material import UNITS, RawMaterial, StockMovement
from .recipe_yield import RecipeYield
from .setting import (
    DEFAULT_SETTINGS,
    PUBLIC_SETTING_PREFIXES,
    Setting,
    settings_to_nested,
)
from .table import (
    STATUS_BILL_PENDING,
    STATUS_EMPTY,
    STATUS_OCCUPIED,
    TABLE_STATUSES,
    RestaurantTable,
)
from .user import ROLE_ADMIN, ROLE_CASHIER, ROLES, Shift, User

__all__ = [
    "TABLE_ARGS",
    "Money",
    "Percent",
    "Rate",
    "Stock",
    "TimestampMixin",
    "utcnow",
    "User",
    "Shift",
    "ROLE_ADMIN",
    "ROLE_CASHIER",
    "ROLES",
    "Category",
    "DEFAULT_CATEGORIES",
    "MenuItem",
    "RawMaterial",
    "StockMovement",
    "UNITS",
    "RecipeYield",
    "RestaurantTable",
    "TABLE_STATUSES",
    "STATUS_EMPTY",
    "STATUS_OCCUPIED",
    "STATUS_BILL_PENDING",
    "Order",
    "OrderItem",
    "ORDER_TYPES",
    "ORDER_STATUSES",
    "ORDER_TYPE_DINE_IN",
    "ORDER_TYPE_TAKEAWAY",
    "ACTIVE_ORDER_STATUSES",
    "STATUS_OPEN",
    "STATUS_KOT_SENT",
    "STATUS_BILLED",
    "STATUS_PAID",
    "STATUS_MERGED",
    "STATUS_CANCELLED",
    "Bill",
    "BILL_PENDING",
    "BILL_PAID",
    "BILL_VOID",
    "BILL_STATUSES",
    "TAX_MODES",
    "TAX_MODE_EXCLUSIVE",
    "TAX_MODE_INCLUSIVE",
    "Payment",
    "PAYMENT_MODES",
    "MODE_CASH",
    "MODE_CARD",
    "MODE_UPI",
    "Discount",
    "DISCOUNT_TYPES",
    "TYPE_GLOBAL",
    "TYPE_SPECIAL_DATE",
    "Customer",
    "Expense",
    "Setting",
    "DEFAULT_SETTINGS",
    "PUBLIC_SETTING_PREFIXES",
    "settings_to_nested",
    "BackupLog",
]
