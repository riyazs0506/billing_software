"""users + shifts.

NOTE: user records exist purely so Admin and Cashier can authenticate and so
transactions carry an accountable owner. There is deliberately **no** staff
management module — accounts are provisioned by the seed / setup script.
"""
import bcrypt

from ..extensions import db
from .base import TABLE_ARGS, TimestampMixin, enum_col, utcnow

ROLE_ADMIN = "admin"
ROLE_CASHIER = "cashier"
ROLES = (ROLE_ADMIN, ROLE_CASHIER)


class User(db.Model, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(enum_col(*ROLES, name="user_role"), nullable=False, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    shifts = db.relationship(
        "Shift", back_populates="user", cascade="all, delete-orphan", lazy="dynamic"
    )

    # --- password handling (bcrypt, never plaintext) ---------------------
    def set_password(self, raw: str) -> None:
        self.password_hash = bcrypt.hashpw(
            raw.encode("utf-8"), bcrypt.gensalt(rounds=12)
        ).decode("utf-8")

    def check_password(self, raw: str) -> bool:
        if not self.password_hash:
            return False
        try:
            return bcrypt.checkpw(
                raw.encode("utf-8"), self.password_hash.encode("utf-8")
            )
        except (ValueError, TypeError):
            return False

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "username": self.username,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.username} ({self.role})>"


class Shift(db.Model):
    """Login/logout session tracking — required by 03-Application-Workflow.

    This is an audit log, not a scheduling or rostering feature.
    """

    __tablename__ = "shifts"
    __table_args__ = TABLE_ARGS

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    login_time = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    logout_time = db.Column(db.DateTime, nullable=True)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", back_populates="shifts")

    @property
    def is_open(self) -> bool:
        return self.logout_time is None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "username": self.user.username if self.user else None,
            "role": self.user.role if self.user else None,
            "login_time": self.login_time.isoformat() if self.login_time else None,
            "logout_time": self.logout_time.isoformat() if self.logout_time else None,
            "is_open": self.is_open,
        }
