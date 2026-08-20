"""Backup and data export (admin only)."""
from __future__ import annotations

import os

from flask import Blueprint, current_app, send_file

from ..middleware import admin_required, current_user
from ..services import backup_service
from ..utils.responses import ApiError, ok

bp = Blueprint("backup", __name__, url_prefix="/api/backup")


@bp.get("")
@admin_required
def list_backups():
    uri = current_app.config["SQLALCHEMY_DATABASE_URI"]
    engine = "sqlite" if uri.startswith("sqlite") else "mysql"

    # Resolve the dump tool up front so the UI can warn before a nightly run
    # fails at 23:45 with nobody watching.
    tool: str | None = None
    tool_error: str | None = None
    if engine == "mysql":
        try:
            tool = backup_service.resolve_mysqldump()
        except RuntimeError as exc:
            tool_error = str(exc)

    return ok(
        {
            "backups": backup_service.list_backups(),
            "schedule": {
                "enabled": current_app.config["BACKUP_ENABLED"],
                "hour": current_app.config["BACKUP_HOUR"],
                "minute": current_app.config["BACKUP_MINUTE"],
                "retention_days": current_app.config["BACKUP_RETENTION_DAYS"],
                "active_in_this_process": backup_service.scheduler_is_active(current_app),
            },
            "engine": engine,
            "tool_path": tool,
            "tool_error": tool_error,
        }
    )


@bp.post("/run")
@admin_required
def run():
    """Manual backup. A failure is reported, never silently swallowed."""
    log = backup_service.run_backup(trigger="manual", user_id=current_user().id)
    if log.status == "failed":
        raise ApiError(
            "Backup failed: " + (log.message or "unknown error"),
            status=500,
            code="backup_failed",
            details=log.to_dict(),
        )
    return ok(log.to_dict(), status=201)


@bp.get("/download/<path:filename>")
@admin_required
def download(filename: str):
    path = backup_service.backup_path(filename)
    if not os.path.exists(path):
        raise ApiError("That backup file no longer exists.", status=404, code="not_found")
    return send_file(path, as_attachment=True, download_name=os.path.basename(path))
