"""Development / initial-setup seed.

This script is the ONLY place Admin and Cashier accounts are created. The
application itself exposes no staff-management screen or API, so accounts are
provisioned here (or by a DBA) at deployment time.

    flask --app run:app seed              # seed, keeping existing tables
    flask --app run:app seed --reset      # drop everything and start clean
    python seed.py --reset                # same, standalone

Passwords come from the environment when present:
    SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD
    SEED_CASHIER_USERNAME / SEED_CASHIER_PASSWORD
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from decimal import Decimal

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    DEFAULT_SETTINGS,
    Category,
    Customer,
    Discount,
    Expense,
    MenuItem,
    RawMaterial,
    RecipeYield,
    RestaurantTable,
    Setting,
    StockMovement,
    User,
)

# --- accounts (authentication only) --------------------------------------
ACCOUNTS = [
    {
        "name": "Restaurant Owner",
        "username": os.getenv("SEED_ADMIN_USERNAME", "admin"),
        "password": os.getenv("SEED_ADMIN_PASSWORD", "Admin@12345"),
        "role": "admin",
    },
    {
        "name": "Counter Cashier",
        "username": os.getenv("SEED_CASHIER_USERNAME", "cashier"),
        "password": os.getenv("SEED_CASHIER_PASSWORD", "Cashier@12345"),
        "role": "cashier",
    },
]

CATEGORIES = [
    ("Starters", 1),
    ("Main Course", 2),
    ("Breads", 3),
    ("Rice", 4),
    ("Desserts", 5),
    ("Beverages", 6),
]

# (category, name, price, description)
MENU = [
    ("Starters", "Paneer Tikka", "260.00", "Char-grilled cottage cheese, mint chutney"),
    ("Starters", "Chicken 65", "280.00", "Hot, curry-leaf tempered Chettinad classic"),
    ("Starters", "Fish Amritsari", "320.00", "Ajwain battered river sole"),
    ("Starters", "Veg Manchurian", "220.00", "Indo-Chinese, dry"),
    ("Starters", "Gobi 65", "200.00", "Crisp cauliflower florets"),
    ("Main Course", "Butter Chicken", "360.00", "Tomato and cashew gravy, kasuri methi"),
    ("Main Course", "Paneer Butter Masala", "310.00", "Rich makhani gravy"),
    ("Main Course", "Chicken Chettinad", "340.00", "Roasted spice, coconut base"),
    ("Main Course", "Dal Tadka", "190.00", "Yellow lentils, ghee tempering"),
    ("Main Course", "Kadai Vegetable", "240.00", "Seasonal vegetables, kadai masala"),
    ("Breads", "Chapati", "20.00", "Whole wheat, tawa cooked"),
    ("Breads", "Butter Naan", "60.00", "Tandoor baked, brushed with butter"),
    ("Breads", "Tandoori Roti", "35.00", "Whole wheat, tandoor"),
    ("Breads", "Lachha Paratha", "70.00", "Layered, flaky"),
    ("Rice", "Steamed Rice", "120.00", "Basmati"),
    ("Rice", "Jeera Rice", "160.00", "Cumin tempered basmati"),
    ("Rice", "Chicken Biryani", "320.00", "Dum cooked, served with raita"),
    ("Rice", "Veg Pulao", "220.00", "Mixed vegetable basmati"),
    ("Desserts", "Gulab Jamun", "90.00", "Two pieces, warm syrup"),
    ("Desserts", "Rasmalai", "110.00", "Saffron milk, pistachio"),
    ("Desserts", "Gajar Halwa", "120.00", "Slow cooked carrot, ghee"),
    ("Beverages", "Masala Chai", "40.00", "Cardamom and ginger"),
    ("Beverages", "Sweet Lassi", "80.00", "Thick curd, house churned"),
    ("Beverages", "Fresh Lime Soda", "70.00", "Sweet or salted"),
    ("Beverages", "Filter Coffee", "50.00", "Chicory blend"),
]

# name, unit, stock, low-stock threshold (in servings of the linked dish)
RAW_MATERIALS = [
    ("Wheat flour", "kg", "20.000", "40"),
    ("Basmati rice", "kg", "15.000", "30"),
    ("Chicken", "kg", "10.000", "25"),
    ("Paneer", "kg", "5.000", "20"),
    ("Refined oil", "litre", "12.000", "30"),
    ("Milk", "litre", "18.000", "25"),
    ("Toor dal", "kg", "8.000", "20"),
]

# menu item, raw material, min yield/unit, max yield/unit, avg consumption/dish
# These are the spec's worked examples, stored as configuration rows.
RECIPES = [
    ("Chapati", "Wheat flour", "12", "16", "0.075"),
    ("Tandoori Roti", "Wheat flour", "10", "14", "0.090"),
    ("Lachha Paratha", "Wheat flour", "8", "11", "0.110"),
    ("Butter Naan", "Wheat flour", "9", "12", "0.100"),
    ("Steamed Rice", "Basmati rice", "8", "10", "0.115"),
    ("Jeera Rice", "Basmati rice", "8", "10", "0.115"),
    ("Veg Pulao", "Basmati rice", "6", "8", "0.150"),
    ("Chicken Biryani", "Basmati rice", "5", "7", "0.180"),
    ("Chicken Biryani", "Chicken", "6", "8", "0.150"),
    ("Butter Chicken", "Chicken", "12", "15", "0.075"),
    ("Chicken Chettinad", "Chicken", "10", "13", "0.085"),
    ("Chicken 65", "Chicken", "14", "18", "0.065"),
    ("Paneer Tikka", "Paneer", "10", "12", "0.090"),
    ("Paneer Butter Masala", "Paneer", "9", "11", "0.100"),
    ("Dal Tadka", "Toor dal", "12", "15", "0.070"),
    ("Masala Chai", "Milk", "8", "10", "0.110"),
    ("Sweet Lassi", "Milk", "5", "6", "0.180"),
    ("Rasmalai", "Milk", "6", "8", "0.150"),
]

CUSTOMERS = [
    ("Ramesh Iyer", "9840012345"),
    ("Divya Nair", "9884567890"),
    ("Arun Kumar", "9790011223"),
    ("Fatima Sheikh", "9500098765"),
]

EXPENSES = [
    ("Vegetable purchase - morning market", "Vegetables", "3450.00", 0),
    ("LPG commercial cylinder x2", "Gas", "3800.00", 1),
    ("Electricity bill", "Electricity", "8600.00", 2),
    ("Packaging covers and containers", "Packaging", "1250.00", 1),
    ("Chicken and mutton supply", "Raw material", "9200.00", 0),
]


def _log(message: str) -> None:
    print("  " + message)


def run_seed(reset: bool = False, demo: bool = True) -> None:
    if reset:
        print("Dropping all tables...")
        db.drop_all()
    db.create_all()

    print("Seeding Annapurna Kitchen...")
    _seed_settings()
    _seed_accounts()
    if demo:
        _seed_tables()
        categories = _seed_categories()
        items = _seed_menu(categories)
        materials = _seed_materials()
        _seed_recipes(items, materials)
        _seed_discounts()
        _seed_customers()
        _seed_expenses()
    db.session.commit()

    print("\nSeed complete.")
    print("Sign in with:")
    for account in ACCOUNTS:
        print(
            "  " + account["role"].ljust(8)
            + " username: " + account["username"]
            + "   password: " + account["password"]
        )
    print(
        "\nThese accounts exist for authentication only. The application has no "
        "staff-management screen - change these credentials here or in the "
        "database before going live."
    )


def _seed_settings() -> None:
    created = 0
    for key, value in DEFAULT_SETTINGS.items():
        if db.session.query(Setting).filter_by(key=key).first() is None:
            db.session.add(Setting(key=key, value=value))
            created += 1
    db.session.flush()
    _log("settings: " + str(created) + " defaults written")


def _seed_accounts() -> None:
    for account in ACCOUNTS:
        user = db.session.query(User).filter_by(username=account["username"]).first()
        if user is None:
            user = User(
                name=account["name"], username=account["username"], role=account["role"]
            )
            user.set_password(account["password"])
            db.session.add(user)
            _log("user: " + account["username"] + " (" + account["role"] + ") created")
        else:
            _log("user: " + account["username"] + " already exists, left untouched")
    db.session.flush()


def _seed_tables(count: int = 12) -> None:
    created = 0
    for index in range(1, count + 1):
        number = str(index)
        if db.session.query(RestaurantTable).filter_by(table_number=number).first() is None:
            db.session.add(
                RestaurantTable(
                    table_number=number, seats=4 if index % 3 else 6, status="empty"
                )
            )
            created += 1
    db.session.flush()
    _log("tables: " + str(created) + " created")


def _seed_categories() -> dict:
    mapping = {}
    for name, order in CATEGORIES:
        row = db.session.query(Category).filter_by(name=name).first()
        if row is None:
            row = Category(name=name, sort_order=order)
            db.session.add(row)
        mapping[name] = row
    db.session.flush()
    _log("categories: " + str(len(mapping)))
    return mapping


def _seed_menu(categories: dict) -> dict:
    mapping = {}
    created = 0
    for category, name, price, description in MENU:
        row = db.session.query(MenuItem).filter_by(name=name).first()
        if row is None:
            row = MenuItem(
                category_id=categories[category].id,
                name=name,
                price=Decimal(price),
                description=description,
                is_available=True,
            )
            db.session.add(row)
            created += 1
        mapping[name] = row
    db.session.flush()
    _log("menu items: " + str(created) + " created, " + str(len(mapping)) + " total")
    return mapping


def _seed_materials() -> dict:
    mapping = {}
    created = 0
    for name, unit, stock, threshold in RAW_MATERIALS:
        row = db.session.query(RawMaterial).filter_by(name=name).first()
        if row is None:
            row = RawMaterial(
                name=name,
                unit=unit,
                current_stock=Decimal(stock),
                low_stock_threshold=Decimal(threshold),
            )
            db.session.add(row)
            db.session.flush()
            db.session.add(
                StockMovement(
                    raw_material_id=row.id,
                    change_qty=Decimal(stock),
                    balance_after=Decimal(stock),
                    reason="stock_entry",
                    note="Opening stock (seed)",
                )
            )
            created += 1
        mapping[name] = row
    db.session.flush()
    _log("raw materials: " + str(created) + " created")
    return mapping


def _seed_recipes(items: dict, materials: dict) -> None:
    created = 0
    for item_name, material_name, min_yield, max_yield, consumption in RECIPES:
        item = items.get(item_name)
        material = materials.get(material_name)
        if item is None or material is None:
            continue
        existing = (
            db.session.query(RecipeYield)
            .filter_by(menu_item_id=item.id, raw_material_id=material.id)
            .first()
        )
        if existing is None:
            db.session.add(
                RecipeYield(
                    menu_item_id=item.id,
                    raw_material_id=material.id,
                    min_yield_per_unit=Decimal(min_yield),
                    max_yield_per_unit=Decimal(max_yield),
                    avg_consumption_per_dish=Decimal(consumption),
                )
            )
            created += 1
    db.session.flush()
    _log("recipe yields: " + str(created) + " created")
    _log("  e.g. 20 kg wheat flour -> 20x12=240 to 20x16=320 chapatis")


def _seed_discounts() -> None:
    if db.session.query(Discount).filter_by(type="global").first() is None:
        db.session.add(
            Discount(
                name="Global discount", type="global", percentage=Decimal("0.00"), is_active=False
            )
        )
    if db.session.query(Discount).filter_by(type="special_date").first() is None:
        today = date.today()
        db.session.add(
            Discount(
                name="Anniversary week",
                type="special_date",
                percentage=Decimal("10.00"),
                is_active=True,
                start_date=today + timedelta(days=30),
                end_date=today + timedelta(days=36),
            )
        )
    db.session.flush()
    _log("discounts: global switch (off) + one scheduled special date")


def _seed_customers() -> None:
    created = 0
    for name, phone in CUSTOMERS:
        if db.session.query(Customer).filter_by(phone=phone).first() is None:
            db.session.add(Customer(name=name, phone=phone))
            created += 1
    db.session.flush()
    _log("customers: " + str(created) + " created")


def _seed_expenses() -> None:
    if db.session.query(Expense).count():
        _log("expenses: already present, skipped")
        return
    today = date.today()
    for description, category, amount, days_ago in EXPENSES:
        db.session.add(
            Expense(
                description=description,
                category=category,
                amount=Decimal(amount),
                date=today - timedelta(days=days_ago),
            )
        )
    db.session.flush()
    _log("expenses: " + str(len(EXPENSES)) + " created")


if __name__ == "__main__":
    app = create_app(os.getenv("FLASK_ENV", "development"))
    with app.app_context():
        run_seed(reset="--reset" in sys.argv, demo="--no-demo" not in sys.argv)
