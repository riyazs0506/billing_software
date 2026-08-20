from ..extensions import db
from .base import TABLE_ARGS, enum_col, utcnow

BACKUP_STATUSES = ("success", "failed")


class BackupLog(db.Model):
    """Every backup attempt, automated or manual, is recorded so a failure is
    visible in the admin UI rather than silently swallowed."""

    __tablename__ = "backup_logs"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    filename = db.Column(db.String(255), nullable=True)
    size_bytes = db.Column(db.BigInteger, nullable=True)
    status = db.Column(enum_col(*BACKUP_STATUSES, name="backup_status"), nullable=False)
    trigger = db.Column(db.String(20), nullable=False, default="manual")
    message = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "status": self.status,
            "trigger": self.trigger,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
