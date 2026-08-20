"""Column type aliases shared across models.

MySQL specifics from 05-Schema-Structure: INT AUTO_INCREMENT primary keys,
native ENUM columns, utf8mb4 on every table, DECIMAL for money and stock.
"""
from datetime import datetime, timezone

from sqlalchemy import Enum as SAEnum

from ..extensions import db

# utf8mb4 everywhere (no-op on SQLite, honoured by MySQL DDL).
TABLE_ARGS = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

Money = db.Numeric(10, 2, asdecimal=True)
Stock = db.Numeric(12, 3, asdecimal=True)
Rate = db.Numeric(10, 3, asdecimal=True)
Percent = db.Numeric(5, 2, asdecimal=True)


def enum_col(*values: str, name: str):
    """Native MySQL ENUM; a CHECK-constrained VARCHAR on SQLite."""
    return SAEnum(*values, name=name, native_enum=True, validate_strings=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
