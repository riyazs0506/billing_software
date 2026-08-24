"""Environment driven configuration (dev / staging / prod / testing)."""
import os
from datetime import timedelta
from urllib.parse import quote, urlparse

LOCAL_HOSTS = {"", "localhost", "127.0.0.1", "::1", "db"}


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _backend_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _resolve(path: str) -> str:
    """Make a relative path absolute against backend/ - the process may be
    started from anywhere."""
    return path if os.path.isabs(path) else os.path.join(_backend_root(), path)


def _build_database_uri() -> str:
    """Prefer an explicit DATABASE_URL, else assemble a MySQL URI from parts.

    A SQLite fallback exists purely so the suite and a laptop demo can run
    without a MySQL server; production always runs on MySQL (see README).
    """
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit

    engine = os.getenv("DB_ENGINE", "mysql").lower()
    if engine == "sqlite":
        path = _resolve(os.getenv("SQLITE_PATH", "instance/annapurna.db"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return "sqlite:///" + path.replace("\\", "/")

    # Managed providers hand out generated passwords that routinely contain
    # characters with a meaning inside a URI (@ : / ?), so quote the credentials
    # rather than letting them corrupt the DSN.
    user = quote(os.getenv("MYSQL_USER", "annapurna"), safe="")
    password = quote(os.getenv("MYSQL_PASSWORD", ""), safe="")
    host = os.getenv("MYSQL_HOST", "127.0.0.1")
    port = os.getenv("MYSQL_PORT", "3306")
    name = os.getenv("MYSQL_DB", "annapurna_kitchen")
    return (
        f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}"
        "?charset=utf8mb4"
    )


def _ssl_mode(uri: str) -> str:
    """How strictly TLS is applied, mirroring the mysql client's --ssl-mode.

    DISABLED / REQUIRED (encrypt, do not validate) / VERIFY_CA /
    VERIFY_IDENTITY (validate, and match the hostname). Hosted MySQL - Aiven,
    RDS, PlanetScale - rejects plaintext, so any non-local host defaults to
    REQUIRED instead of silently failing the handshake.
    """
    host = (urlparse(uri).hostname or "").lower()
    default = "DISABLED" if host in LOCAL_HOSTS else "REQUIRED"
    return os.getenv("MYSQL_SSL_MODE", default).strip().upper()


def _ssl_ca() -> str | None:
    """Path to the provider's CA certificate, when one is configured."""
    ca = os.getenv("MYSQL_SSL_CA", "").strip()
    return _resolve(ca) if ca else None


def _engine_options(uri: str) -> dict:
    options: dict = {"pool_pre_ping": True, "pool_recycle": 280}
    if not uri.startswith("mysql"):
        return options

    mode = _ssl_mode(uri)
    if mode == "DISABLED":
        return options

    if mode in {"VERIFY_CA", "VERIFY_IDENTITY"}:
        ca = _ssl_ca()
        if not ca:
            raise RuntimeError(
                "MYSQL_SSL_MODE=" + mode + " needs MYSQL_SSL_CA to point at the "
                "CA certificate downloaded from your database provider."
            )
        if not os.path.exists(ca):
            raise RuntimeError("CA certificate not found: " + ca)
        ssl_args = {"ca": ca, "check_hostname": mode == "VERIFY_IDENTITY"}
    else:
        # REQUIRED - encrypted, certificate not validated. This is exactly what
        # the "?ssl-mode=REQUIRED" in a hosted service URI asks for.
        ssl_args = {"check_hostname": False, "verify_mode": False}

    options["connect_args"] = {"ssl": ssl_args}
    return options


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-env")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-env-too")

    SQLALCHEMY_DATABASE_URI = _build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = _engine_options(SQLALCHEMY_DATABASE_URI)

    # Kept as plain config so mysqldump can be given the same TLS settings.
    MYSQL_SSL_MODE = _ssl_mode(SQLALCHEMY_DATABASE_URI)
    MYSQL_SSL_CA = _ssl_ca()

    # --- JWT / session ---------------------------------------------------
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60"))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.getenv("JWT_REFRESH_DAYS", "7"))
    )
    # Idle window enforced on top of token expiry (07-Role-Access: "JWT expires
    # after inactivity; re-login required").
    SESSION_IDLE_MINUTES = int(os.getenv("SESSION_IDLE_MINUTES", "30"))

    # --- CORS ------------------------------------------------------------
    CORS_ORIGINS = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if o.strip()
    ]

    # --- Business defaults (overridable from the Settings screen) --------
    DEFAULT_GST_RATE = os.getenv("DEFAULT_GST_RATE", "5.00")
    DEFAULT_TAX_MODE = os.getenv("DEFAULT_TAX_MODE", "exclusive")

    # --- Backups ---------------------------------------------------------
    BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")
    BACKUP_RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "14"))
    BACKUP_ENABLED = _bool("BACKUP_ENABLED", "true")
    BACKUP_HOUR = int(os.getenv("BACKUP_HOUR", "23"))
    BACKUP_MINUTE = int(os.getenv("BACKUP_MINUTE", "45"))
    MYSQLDUMP_PATH = os.getenv("MYSQLDUMP_PATH", "mysqldump")

    PROPAGATE_EXCEPTIONS = True
    DEBUG = False
    TESTING = False


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    ENV_NAME = "development"


class StagingConfig(BaseConfig):
    DEBUG = False
    ENV_NAME = "staging"


class ProductionConfig(BaseConfig):
    DEBUG = False
    ENV_NAME = "production"

    def __init__(self) -> None:
        weak = {"change-me-in-env", "change-me-in-env-too", ""}
        if self.SECRET_KEY in weak or self.JWT_SECRET_KEY in weak:
            raise RuntimeError(
                "SECRET_KEY and JWT_SECRET_KEY must be set to real values "
                "in the production environment."
            )


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = True
    ENV_NAME = "testing"
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    SQLALCHEMY_ENGINE_OPTIONS: dict = {}
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    BACKUP_ENABLED = False


CONFIGS = {
    "development": DevelopmentConfig,
    "staging": StagingConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(name: str | None):
    cls = CONFIGS.get((name or "development").lower(), DevelopmentConfig)
    return cls() if cls is ProductionConfig else cls
