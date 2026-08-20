"""Payment recording and split-payment validation.

A bill may carry several payment rows (500 cash + 300 UPI). A bill is only
marked paid when the tendered amounts settle the total exactly.
"""
from __future__ import annotations

from ..extensions import db
from ..models import PAYMENT_MODES, Bill, MODE_CASH, Payment
from ..utils.money import D, money
from ..utils.responses import ApiError

# Tolerance for rounding noise when several tenders are added up.
EPSILON = D("0.01")


def normalise(payments: list[dict]) -> list[dict]:
    cleaned = []
    for index, raw in enumerate(payments or []):
        mode = str(raw.get("mode", "")).strip().lower()
        if mode not in PAYMENT_MODES:
            raise ApiError(
                "Payment " + str(index + 1) + " has an unsupported mode: "
                + (mode or "(blank)"),
                status=422,
                code="validation_error",
            )
        amount = money(raw.get("amount", 0))
        if amount <= 0:
            raise ApiError(
                "Payment " + str(index + 1) + " must be greater than zero.",
                status=422,
                code="validation_error",
            )
        entry = {"mode": mode, "amount": amount, "reference": raw.get("reference") or None}
        if mode == MODE_CASH and raw.get("tendered") not in (None, ""):
            tendered = money(raw["tendered"])
            if tendered < amount:
                raise ApiError(
                    "Cash tendered is less than the cash amount recorded.",
                    status=422,
                    code="validation_error",
                )
            entry["tendered"] = tendered
            entry["change_given"] = money(tendered - amount)
        cleaned.append(entry)

    if not cleaned:
        raise ApiError("At least one payment is required.", status=422, code="validation_error")
    return cleaned


def validate_against_bill(bill: Bill, payments: list[dict]) -> None:
    """sum(payment amounts) must equal the bill total."""
    already = bill.amount_paid()
    incoming = money(sum((p["amount"] for p in payments), D(0)))
    settled = money(already + incoming)
    total = money(bill.total)

    if settled < total - EPSILON:
        raise ApiError(
            "Payment is short by " + str(money(total - settled)) + ". "
            "A bill is not marked paid until it is settled in full.",
            status=422,
            code="payment_short",
            details={
                "bill_total": str(total),
                "received": str(settled),
                "shortfall": str(money(total - settled)),
            },
        )
    if settled > total + EPSILON:
        raise ApiError(
            "Payment exceeds the bill total by " + str(money(settled - total))
            + ". For cash, record the exact amount and put the rest in 'tendered'.",
            status=422,
            code="payment_excess",
            details={
                "bill_total": str(total),
                "received": str(settled),
                "excess": str(money(settled - total)),
            },
        )


def record_payments(bill: Bill, payments: list[dict], *, user_id: int | None) -> list[Payment]:
    cleaned = normalise(payments)
    validate_against_bill(bill, cleaned)

    rows = []
    for entry in cleaned:
        row = Payment(
            mode=entry["mode"],
            amount=entry["amount"],
            reference=entry.get("reference"),
            tendered=entry.get("tendered"),
            change_given=entry.get("change_given"),
            created_by=user_id,
        )
        # Append through the relationship so bill.amount_paid() is correct
        # immediately, without waiting for a re-query.
        bill.payments.append(row)
        db.session.add(row)
        rows.append(row)
    db.session.flush()
    return rows
