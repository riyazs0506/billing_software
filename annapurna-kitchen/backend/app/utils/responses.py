"""Uniform JSON envelope + the exception type routes raise for expected errors."""
from __future__ import annotations

from typing import Any

from flask import jsonify


class ApiError(Exception):
    """Raised anywhere in a request to produce a structured error response."""

    def __init__(
        self,
        message: str,
        status: int = 400,
        code: str = "bad_request",
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details

    def to_dict(self) -> dict:
        body: dict[str, Any] = {
            "success": False,
            "error": {"code": self.code, "message": self.message},
        }
        if self.details is not None:
            body["error"]["details"] = self.details
        return body


def ok(data: Any = None, status: int = 200, **extra):
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return jsonify(body), status


def fail(message: str, status: int = 400, code: str = "bad_request", details=None):
    return jsonify(ApiError(message, status, code, details).to_dict()), status


def paginated(items: list, total: int, page: int, per_page: int, **extra):
    return ok(
        items,
        meta={
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 0,
        },
        **extra,
    )
