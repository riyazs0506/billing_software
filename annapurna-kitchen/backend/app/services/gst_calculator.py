"""GST calculation.

Every figure is a Decimal, rounded half-up to 2 places at the point it becomes
a printed number. 01-PRD requires the result to match a manual calculation with
zero discrepancy, which floats cannot guarantee.

Two modes, both required by the spec:

exclusive  menu prices are pre-tax
    subtotal      = sum(price * qty)
    discount      = subtotal * d%
    taxable_value = subtotal - discount
    cgst          = taxable_value * (rate/2)
    sgst          = taxable_value * (rate/2)
    total         = taxable_value + cgst + sgst

inclusive  menu prices already contain the tax
    subtotal      = sum(price * qty)          (tax-inclusive)
    discount      = subtotal * d%
    gross         = subtotal - discount
    taxable_value = gross / (1 + rate)
    cgst          = taxable_value * (rate/2)
    sgst          = taxable_value * (rate/2)
    total         = gross                     (tax already inside)
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal

from ..utils.money import D, money

HUNDRED = Decimal("100")


@dataclass
class BillTotals:
    subtotal: Decimal
    discount_percentage: Decimal
    discount_applied: Decimal
    taxable_value: Decimal
    cgst_rate: Decimal
    sgst_rate: Decimal
    cgst: Decimal
    sgst: Decimal
    total: Decimal
    tax_mode: str

    def to_dict(self) -> dict:
        return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in asdict(self).items()}


def split_gst_rate(gst_rate) -> tuple[Decimal, Decimal]:
    """A 5% GST invoice is printed as CGST 2.5% + SGST 2.5% (intra-state)."""
    rate = D(gst_rate)
    half = rate / Decimal("2")
    return half, half


def calculate_totals(
    line_totals,
    *,
    gst_rate="5.00",
    discount_percentage="0",
    tax_mode: str = "exclusive",
    tax_enabled: bool = True,
) -> BillTotals:
    """Compute a complete bill from raw line totals."""
    subtotal = money(sum((D(x) for x in line_totals), D(0)))

    disc_pct = D(discount_percentage)
    if disc_pct < 0:
        disc_pct = D(0)
    if disc_pct > HUNDRED:
        disc_pct = HUNDRED

    # Discount is applied to the item total BEFORE GST (03-Application-Workflow).
    discount_applied = money(subtotal * disc_pct / HUNDRED)
    net = money(subtotal - discount_applied)

    rate = D(gst_rate) if tax_enabled else D(0)
    cgst_rate, sgst_rate = split_gst_rate(rate)

    if not tax_enabled or rate == 0:
        taxable_value, cgst, sgst, total = net, money(0), money(0), net
    elif tax_mode == "inclusive":
        taxable_value = money(net / (D(1) + rate / HUNDRED))
        cgst = money(taxable_value * cgst_rate / HUNDRED)
        sgst = money(taxable_value * sgst_rate / HUNDRED)
        # Keep the printed lines internally consistent with the amount charged.
        total = net
        taxable_value = money(total - cgst - sgst)
    else:  # exclusive
        taxable_value = net
        cgst = money(taxable_value * cgst_rate / HUNDRED)
        sgst = money(taxable_value * sgst_rate / HUNDRED)
        total = money(taxable_value + cgst + sgst)

    return BillTotals(
        subtotal=subtotal,
        discount_percentage=money(disc_pct),
        discount_applied=discount_applied,
        taxable_value=taxable_value,
        cgst_rate=money(cgst_rate),
        sgst_rate=money(sgst_rate),
        cgst=cgst,
        sgst=sgst,
        total=total,
        tax_mode=tax_mode if tax_enabled and rate != 0 else "exclusive",
    )
