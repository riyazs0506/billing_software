"""Decimal helpers.

Every financial figure in this system is a ``decimal.Decimal``. Floats are
never used for money — 01-PRD requires "GST calculation matches manual
calculation with zero discrepancy".
"""
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0.00")

TWO_PLACES = Decimal("0.01")
THREE_PLACES = Decimal("0.001")


def D(value) -> Decimal:
    """Coerce anything sane into a Decimal without going through float."""
    if isinstance(value, Decimal):
        return value
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, float):
        # str() first so 0.1 does not become 0.1000000000000000055511151231257827
        return Decimal(str(value))
    return Decimal(str(value))


def money(value) -> Decimal:
    """Round to 2 decimal places, half-up (the convention Indian invoices use)."""
    return D(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def qty(value) -> Decimal:
    """Round stock / consumption quantities to 3 decimal places."""
    return D(value).quantize(THREE_PLACES, rounding=ROUND_HALF_UP)


def dec_str(value) -> str:
    """Render a Decimal for JSON without scientific notation."""
    return format(D(value), "f")
