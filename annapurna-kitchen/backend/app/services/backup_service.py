"""Database backup: automated daily plus manual, with every attempt logged.

MySQL is dumped with ``mysqldump``; a SQLite file is copied. Failures are
written to ``backup_logs`` and surfaced in the admin UI rather than swallowed.
"""
from __future__ import annotations

import atexit
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from urllib.parse import unquote, urlparse

from flask import current_app

from ..extensions import db
from ..models import BackupLog


def _backup_dir() -> str:
    path = current_app.config["BACKUP_DIR"]
    if not os.path.isabs(path):
        path = os.path.join(current_app.root_path, "..", path)
    path = os.path.abspath(path)
    os.makedirs(path, exist_ok=True)
    return path


def resolve_mysqldump() -> str:
    """Locate mysqldump.

    The configured value wins if it actually runs. Otherwise fall back to the
    usual install locations, because on Windows the MySQL bin directory is
    very often not on PATH - which used to surface only as an opaque
    "[WinError 2] The system cannot find the file specified".
    """
    configured = current_app.config["MYSQLDUMP_PATH"]
    found = shutil.which(configured)
    if found:
        return found
    if os.path.isabs(configured) and os.path.exists(configured):
        return configured

    candidates: list[str] = []
    for root in (
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
    ):
        mysql_root = os.path.join(root, "MySQL")
        if not os.path.isdir(mysql_root):
            continue
        try:
            entries = sorted(os.listdir(mysql_root), reverse=True)
        except OSError:  # pragma: no cover - permissions
            continue
        for entry in entries:
            candidates.append(os.path.join(mysql_root, entry, "bin", "mysqldump.exe"))
            candidates.append(os.path.join(mysql_root, entry, "mysqldump.exe"))

    candidates += [
        "/usr/bin/mysqldump",
        "/usr/local/bin/mysqldump",
        "/opt/homebrew/bin/mysqldump",
        "/usr/local/mysql/bin/mysqldump",
    ]

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate

    raise RuntimeError(
        "mysqldump was not found. Install the MySQL client tools, or set "
        "MYSQLDUMP_PATH in backend/.env to its full path "
        "(e.g. C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe)."
    )


def _parse_mysql_uri(uri: str) -> dict:
    parsed = urlparse(uri)
    return {
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "host": parsed.hostname or "127.0.0.1",
        "port": str(parsed.port or 3306),
        "database": (parsed.path or "/").lstrip("/").split("?")[0],
    }


def run_backup(trigger: str = "manual", user_id: int | None = None) -> BackupLog:
    uri = current_app.config["SQLALCHEMY_DATABASE_URI"]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target_dir = _backup_dir()

    log = BackupLog(status="success", trigger=trigger, created_by=user_id)
    destination: str | None = None
    try:
        if uri.startswith("sqlite"):
            source = uri.replace("sqlite:///", "", 1)
            if source in ("", ":memory:"):
                raise RuntimeError("An in-memory SQLite database cannot be backed up.")
            if not os.path.isabs(source):
                source = os.path.abspath(os.path.join(current_app.root_path, "..", source))
            filename = "annapurna-" + stamp + ".sqlite"
            destination = os.path.join(target_dir, filename)
            shutil.copy2(source, destination)
        else:
            cfg = _parse_mysql_uri(uri)
            filename = "annapurna-" + stamp + ".sql"
            destination = os.path.join(target_dir, filename)
            command = [
                resolve_mysqldump(),
                "--host=" + cfg["host"],
                "--port=" + cfg["port"],
                "--user=" + cfg["user"],
                "--single-transaction",
                "--routines",
                "--default-character-set=utf8mb4",
                cfg["database"],
            ]
            env = dict(os.environ)
            if cfg["password"]:
                # Passed via env so it never lands in the process list.
                env["MYSQL_PWD"] = cfg["password"]
            with open(destination, "wb") as handle:
                proc = subprocess.run(
                    command, stdout=handle, stderr=subprocess.PIPE, env=env, timeout=600
                )
            if proc.returncode != 0:
                raise RuntimeError(
                    "mysqldump exited with code "
                    + str(proc.returncode)
                    + ": "
                    + proc.stderr.decode("utf-8", "replace")[:500]
                )

        log.filename = filename
        log.size_bytes = os.path.getsize(destination)
        log.message = "Backup written to " + destination
        _prune(target_dir)
    except Exception as exc:  # noqa: BLE001 - the failure must be recorded, not raised
        log.status = "failed"
        log.message = str(exc)[:1000]
        current_app.logger.error("Backup failed: %s", exc)
        # Never leave a truncated archive behind. A half-written dump is not
        # restorable, and a stray .sql in the folder looks like a good backup;
        # the failure reason is already captured in log.message.
        if destination and os.path.exists(destination):
            try:
                os.remove(destination)
            except OSError:  # pragma: no cover - best effort
                pass

    db.session.add(log)
    db.session.commit()
    return log


def _prune(target_dir: str) -> None:
    """Delete backups older than the retention window."""
    days = current_app.config["BACKUP_RETENTION_DAYS"]
    if days <= 0:
        return
    cutoff = datetime.now() - timedelta(days=days)
    for name in os.listdir(target_dir):
        if not name.startswith("annapurna-"):
            continue
        path = os.path.join(target_dir, name)
        try:
            if datetime.fromtimestamp(os.path.getmtime(path)) < cutoff:
                os.remove(path)
        except OSError:  # pragma: no cover - best effort
            continue


def list_backups(limit: int = 30) -> list[dict]:
    rows = (
        db.session.query(BackupLog)
        .order_by(BackupLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [r.to_dict() for r in rows]


def backup_path(filename: str) -> str:
    """Resolve a stored backup filename safely inside the backup directory."""
    safe = os.path.basename(filename)
    return os.path.join(_backup_dir(), safe)


def _claim_scheduler_slot(app) -> bool:
    """Only one process may own the backup schedule.

    Binding a loopback port is atomic and the OS releases it when the process
    dies, so this works across gunicorn workers without a lock file to clean
    up. The socket is kept alive for the lifetime of the process.
    """
    import socket

    port = int(os.environ.get("SCHEDULER_LOCK_PORT", "47615"))
    guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        guard.bind(("127.0.0.1", port))
        guard.listen(1)
    except OSError:
        guard.close()
        return False  # another worker already owns the schedule

    app.extensions["backup_scheduler_lock"] = guard
    # Release promptly on a clean shutdown so the next start can claim it.
    atexit.register(lambda: guard.close())
    return True


def scheduler_is_active(app) -> bool:
    """Whether *this* process owns the backup schedule."""
    return bool(app.extensions.get("backup_scheduler"))


def start_scheduler(app) -> None:
    """Daily automated backup (03-Application-Workflow, end-of-day flow)."""
    if not app.config.get("BACKUP_ENABLED") or app.config.get("TESTING"):
        return
    # Avoid a second scheduler in the Werkzeug reloader parent process.
    if app.config.get("DEBUG") and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return
    if not _claim_scheduler_slot(app):
        app.logger.warning(
            "Backup schedule not started here - another process already holds the "
            "scheduler lock on port %s. If no other instance is running, a stale "
            "process is holding it; stop it or set SCHEDULER_LOCK_PORT.",
            os.environ.get("SCHEDULER_LOCK_PORT", "47615"),
        )
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:  # pragma: no cover
        app.logger.warning("APScheduler not installed - automated backup disabled.")
        return

    scheduler = BackgroundScheduler(daemon=True)

    def job():
        with app.app_context():
            run_backup(trigger="scheduled")

    scheduler.add_job(
        job,
        CronTrigger(hour=app.config["BACKUP_HOUR"], minute=app.config["BACKUP_MINUTE"]),
        id="daily-backup",
        replace_existing=True,
    )
    scheduler.start()
    app.extensions["backup_scheduler"] = scheduler
    app.logger.info(
        "Daily backup scheduled at %02d:%02d",
        app.config["BACKUP_HOUR"],
        app.config["BACKUP_MINUTE"],
    )
