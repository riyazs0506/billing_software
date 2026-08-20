"""Application factory."""
from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify

from .config import get_config
from .extensions import cors, db, jwt, migrate
from .middleware import register_error_handlers, register_jwt_handlers


def create_app(env: str | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(get_config(env or os.getenv("FLASK_ENV", "development")))

    _configure_logging(app)
    _init_extensions(app)
    _register_routes(app)
    _register_cli(app)

    from .services import backup_service

    backup_service.start_scheduler(app)
    return app


def _init_extensions(app: Flask) -> None:
    db.init_app(app)
    migrate.init_app(app, db, render_as_batch=True)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        expose_headers=["Content-Disposition"],
    )

    # Import models so Alembic autogenerate and create_all see every table.
    from . import models  # noqa: F401

    register_error_handlers(app)
    register_jwt_handlers(jwt)


def _register_routes(app: Flask) -> None:
    from .routes import register_blueprints

    register_blueprints(app)

    @app.get("/api/health")
    def health():
        """Liveness probe; also what the frontend uses to detect reconnection."""
        try:
            db.session.execute(db.text("SELECT 1"))
            database = "up"
        except Exception:  # noqa: BLE001
            db.session.rollback()
            database = "down"
        return jsonify(
            {
                "success": True,
                "data": {
                    "status": "ok" if database == "up" else "degraded",
                    "service": "annapurna-kitchen-api",
                    "environment": app.config.get("ENV_NAME", "development"),
                    "database": database,
                },
            }
        ), (200 if database == "up" else 503)

    @app.get("/api")
    def index():
        return jsonify(
            {
                "success": True,
                "data": {
                    "name": "Annapurna Kitchen Billing API",
                    "version": "1.0.0",
                    "modules": [
                        "auth",
                        "menu",
                        "inventory",
                        "tables",
                        "orders",
                        "billing",
                        "payments",
                        "discounts",
                        "customers",
                        "expenses",
                        "reports",
                        "settings",
                        "backup",
                    ],
                },
            }
        )


def _configure_logging(app: Flask) -> None:
    level = logging.DEBUG if app.config["DEBUG"] else logging.INFO
    app.logger.setLevel(level)

    if app.config.get("TESTING"):
        return

    log_dir = os.path.join(app.root_path, "..", "logs")
    try:
        os.makedirs(log_dir, exist_ok=True)
        handler = RotatingFileHandler(
            os.path.join(log_dir, "annapurna.log"), maxBytes=2_000_000, backupCount=5
        )
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
        handler.setLevel(level)
        app.logger.addHandler(handler)
    except OSError:  # pragma: no cover - read-only filesystem
        app.logger.warning("File logging unavailable; logging to stderr only.")


def _register_cli(app: Flask) -> None:
    import click

    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Drop and recreate every table first.")
    @click.option("--demo/--no-demo", default=True, help="Include demo menu/stock data.")
    def seed_command(reset: bool, demo: bool):
        """Provision the initial Admin/Cashier accounts and demo data."""
        from seed import run_seed

        run_seed(reset=reset, demo=demo)

    @app.cli.command("backup")
    def backup_command():
        """Run a database backup right now."""
        from .services import backup_service

        log = backup_service.run_backup(trigger="cli")
        click.echo(log.status + ": " + (log.message or ""))

    @app.cli.command("create-tables")
    def create_tables_command():
        """Create tables directly (bypasses Alembic; handy for a quick demo)."""
        db.create_all()
        click.echo("Tables created.")
