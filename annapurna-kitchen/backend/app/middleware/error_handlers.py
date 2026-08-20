"""Structured JSON errors, transaction rollback, and production-safe messages."""
from __future__ import annotations

import traceback

from flask import current_app, jsonify
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.exceptions import HTTPException

from ..extensions import db
from ..utils.responses import ApiError


def register_error_handlers(app) -> None:
    @app.errorhandler(ApiError)
    def _api_error(exc: ApiError):
        if exc.status >= 500:
            db.session.rollback()
        return jsonify(exc.to_dict()), exc.status

    @app.errorhandler(IntegrityError)
    def _integrity(exc: IntegrityError):
        db.session.rollback()
        app.logger.warning("Integrity error: %s", exc)
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "conflict",
                        "message": "That record conflicts with one that already exists.",
                    },
                }
            ),
            409,
        )

    @app.errorhandler(OperationalError)
    def _operational(exc: OperationalError):
        db.session.rollback()
        app.logger.error("Database unavailable: %s", exc)
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "database_unavailable",
                        "message": "The database is not reachable right now. "
                        "Please retry in a moment.",
                    },
                }
            ),
            503,
        )

    @app.errorhandler(SQLAlchemyError)
    def _sqlalchemy(exc: SQLAlchemyError):
        db.session.rollback()
        app.logger.error("Database error: %s", exc)
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "database_error",
                        "message": "A database error prevented this operation. "
                        "No partial changes were saved.",
                    },
                }
            ),
            500,
        )

    @app.errorhandler(HTTPException)
    def _http(exc: HTTPException):
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": (exc.name or "error").lower().replace(" ", "_"),
                        "message": exc.description,
                    },
                }
            ),
            exc.code or 500,
        )

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        db.session.rollback()
        app.logger.error("Unhandled error: %s\n%s", exc, traceback.format_exc())
        body = {
            "success": False,
            "error": {
                "code": "internal_error",
                "message": "Something went wrong. The operation was rolled back.",
            },
        }
        # Stack traces are never exposed outside development.
        if current_app.config.get("DEBUG"):
            body["error"]["debug"] = str(exc)
            body["error"]["trace"] = traceback.format_exc().splitlines()[-12:]
        return jsonify(body), 500


def register_jwt_handlers(jwt) -> None:
    @jwt.expired_token_loader
    def _expired(_header, _payload):
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "token_expired",
                        "message": "Your session expired. Please log in again.",
                    },
                }
            ),
            401,
        )

    @jwt.invalid_token_loader
    def _invalid(reason):
        return (
            jsonify(
                {
                    "success": False,
                    "error": {"code": "token_invalid", "message": str(reason)},
                }
            ),
            401,
        )

    @jwt.unauthorized_loader
    def _missing(reason):
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "unauthorized",
                        "message": "Authentication required. " + str(reason),
                    },
                }
            ),
            401,
        )

    @jwt.revoked_token_loader
    def _revoked(_header, _payload):  # pragma: no cover
        return (
            jsonify(
                {
                    "success": False,
                    "error": {
                        "code": "token_revoked",
                        "message": "This session has been signed out.",
                    },
                }
            ),
            401,
        )
