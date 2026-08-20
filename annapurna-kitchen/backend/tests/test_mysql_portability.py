"""Guards against SQL that works on SQLite but breaks on MySQL.

The suite runs on SQLite for speed, which once let `NULLS LAST` ship: SQLite
accepts it, MySQL 8 rejects it with a 1064 syntax error, so `GET /api/discounts`
failed only in production. These tests compile the real queries against the
MySQL dialect so that class of bug is caught without needing a MySQL server.
"""
from __future__ import annotations

import pathlib
import re

import pytest
from sqlalchemy.dialects import mysql

from app.extensions import db
from app.models import Bill, Customer, Discount, Expense, Order, Payment, User

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent


def compile_for_mysql(query) -> str:
    """Render a query as MySQL would receive it."""
    return str(
        query.statement.compile(
            dialect=mysql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )


# --- the specific construct that broke ----------------------------------

def test_no_nulls_last_or_first_anywhere_in_the_app(app):
    """MySQL has no NULLS LAST / NULLS FIRST syntax."""
    offenders = []
    for path in (BACKEND_ROOT / "app").rglob("*.py"):
        for number, line in enumerate(
            path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1
        ):
            # Scan code only - a comment explaining why we avoid it is fine.
            code = line.split("#", 1)[0]
            if re.search(r"\.nulls(last|first)\s*\(", code):
                offenders.append(f"{path.relative_to(BACKEND_ROOT)}:{number}")
    assert offenders == [], (
        "nullslast()/nullsfirst() render as NULLS LAST, which MySQL rejects "
        "with a 1064: " + ", ".join(offenders)
    )


def test_discount_listing_query_compiles_for_mysql(app):
    """The exact ordering used by GET /api/discounts."""
    query = db.session.query(Discount).order_by(
        Discount.type.asc(), Discount.start_date.desc()
    )
    sql = compile_for_mysql(query)
    assert "NULLS LAST" not in sql.upper()
    assert "NULLS FIRST" not in sql.upper()
    assert "ORDER BY" in sql.upper()


@pytest.mark.parametrize(
    "name,builder",
    [
        (
            "bills ledger",
            lambda: db.session.query(Bill).order_by(Bill.paid_at.desc()),
        ),
        (
            "bill history search",
            lambda: db.session.query(Bill)
            .filter(Bill.bill_number.like("%AK%"))
            .order_by(Bill.id.desc()),
        ),
        (
            "orders board",
            lambda: db.session.query(Order).order_by(Order.id.desc()),
        ),
        (
            "customers page",
            lambda: db.session.query(Customer).order_by(Customer.name.asc()),
        ),
        (
            "expenses page",
            lambda: db.session.query(Expense).order_by(
                Expense.date.desc(), Expense.id.desc()
            ),
        ),
        ("payments", lambda: db.session.query(Payment).order_by(Payment.id.desc())),
        ("users", lambda: db.session.query(User).order_by(User.id.asc())),
    ],
)
def test_listing_queries_compile_for_mysql(app, name, builder):
    sql = compile_for_mysql(builder()).upper()
    for unsupported in ("NULLS LAST", "NULLS FIRST", "DISTINCT ON", "ILIKE", "RETURNING"):
        assert unsupported not in sql, f"{name} uses {unsupported}, unsupported on MySQL"


def test_report_aggregations_compile_for_mysql(app):
    """Report aggregates are the heaviest SQL in the app."""
    from sqlalchemy import func

    query = (
        db.session.query(
            func.date(Bill.paid_at),
            func.count(Bill.id),
            func.coalesce(func.sum(Bill.total), 0),
        )
        .group_by(func.date(Bill.paid_at))
        .order_by(func.date(Bill.paid_at))
    )
    sql = str(query.statement.compile(dialect=mysql.dialect())).upper()
    assert "GROUP BY" in sql
    assert "NULLS" not in sql


# --- schema portability --------------------------------------------------

def test_every_table_declares_utf8mb4(app):
    """05-Schema-Structure: utf8mb4 on all tables."""
    missing = [
        table.name
        for table in db.metadata.sorted_tables
        if table.kwargs.get("mysql_charset") != "utf8mb4"
    ]
    assert missing == [], f"tables without utf8mb4: {missing}"


def test_full_schema_renders_as_valid_mysql_ddl(app):
    """Every table must produce MySQL DDL without exploding."""
    from sqlalchemy.schema import CreateTable

    dialect = mysql.dialect()
    for table in db.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect))
        assert "CREATE TABLE" in ddl
        assert "utf8mb4" in ddl


def test_enum_columns_render_as_native_mysql_enums(app):
    """Native ENUM, not a lookup table (05-Schema-Structure notes)."""
    from sqlalchemy.schema import CreateTable

    ddl = str(CreateTable(db.metadata.tables["orders"]).compile(dialect=mysql.dialect()))
    assert "ENUM('dine_in','takeaway')" in ddl.replace(", ", ",")


def test_money_columns_are_decimal_not_float(app):
    """Floats must never reach a financial column."""
    from sqlalchemy import Float, Numeric

    money_columns = {
        ("bills", "total"),
        ("bills", "subtotal"),
        ("bills", "cgst"),
        ("bills", "sgst"),
        ("bills", "discount_applied"),
        ("payments", "amount"),
        ("menu_items", "price"),
        ("order_items", "price_at_order"),
        ("expenses", "amount"),
    }
    for table_name, column_name in money_columns:
        column = db.metadata.tables[table_name].columns[column_name]
        assert isinstance(column.type, Numeric), f"{table_name}.{column_name} not Numeric"
        assert not isinstance(column.type, Float), f"{table_name}.{column_name} is a Float"
