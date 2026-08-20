"""Blueprint registry - one blueprint per module (04-Project-Structure).

There is no ``staff_routes`` module. Staff management is out of scope; the
only user-facing account endpoints live in ``auth_routes`` (login, logout,
session, own shift log, own password).
"""
from .auth_routes import bp as auth_bp
from .backup_routes import bp as backup_bp
from .billing_routes import bp as billing_bp
from .customer_routes import bp as customer_bp
from .discount_routes import bp as discount_bp
from .expense_routes import bp as expense_bp
from .inventory_routes import bp as inventory_bp
from .menu_routes import bp as menu_bp
from .order_routes import bp as order_bp
from .payment_routes import bp as payment_bp
from .report_routes import bp as report_bp
from .settings_routes import bp as settings_bp
from .table_routes import bp as table_bp

ALL_BLUEPRINTS = (
    auth_bp,
    menu_bp,
    inventory_bp,
    table_bp,
    order_bp,
    billing_bp,
    payment_bp,
    discount_bp,
    customer_bp,
    expense_bp,
    report_bp,
    settings_bp,
    backup_bp,
)


def register_blueprints(app) -> None:
    for blueprint in ALL_BLUEPRINTS:
        app.register_blueprint(blueprint)
