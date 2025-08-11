import os
import re
from datetime import timedelta

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    def load_dotenv(*args, **kwargs):
        return False


def _read_fallback_keys():
    """
    Dev-only convenience: read keys from the provided background keys file
    if environment variables are not set. This file should not be committed.
    """
    keys = {}
    path = os.path.join(os.getcwd(), "background keys do not commit.txt")
    if not os.path.exists(path):
        return keys
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        # Simple extraction based on known labels
        # API KEY TVMDB = <key>
        m = re.search(r"API KEY TVMDB\s*=\s*([^\s]+)", content)
        if m:
            keys["TMDB_API_KEY"] = m.group(1).strip()

        # API Read Access Token TVMDB = "<bearer>"
        m = re.search(r'API Read Access Token TVMDB\s*=\s*"([^"]+)"', content)
        if m:
            keys["TMDB_BEARER_TOKEN"] = m.group(1).strip()

        # database url = <url>
        m = re.search(r"database url\s*=\s*([^\s]+)", content)
        if m:
            keys["DATABASE_URL"] = m.group(1).strip()
    except Exception:
        # Fail silently in dev fallback
        pass
    return keys


def _normalize_db_url(url: str) -> str:
    """
    Normalize postgres:// to postgresql+psycopg2:// for SQLAlchemy.
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
    return url


class Config:
    # Load .env if present
    load_dotenv()

    # Dev-friendly defaults; can be overridden by environment variables
    _fallback = _read_fallback_keys()

    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-me")
    SESSION_COOKIE_NAME = "movieapp_session"
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # Database config
    DATABASE_URL = os.getenv("DATABASE_URL", _fallback.get("DATABASE_URL", "sqlite:///movie_app.db"))
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(DATABASE_URL)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # TMDB keys
    TMDB_API_KEY = os.getenv("TMDB_API_KEY", _fallback.get("TMDB_API_KEY", ""))
    TMDB_BEARER_TOKEN = os.getenv("TMDB_BEARER_TOKEN", _fallback.get("TMDB_BEARER_TOKEN", ""))

    # Auth/admin simplification
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "Alex")

    # CSRF - keep simple: enabled for forms; API JSON can be exempted by blueprint if needed
    WTF_CSRF_TIME_LIMIT = None  # No expiry for CSRF token in forms within a session


class DevelopmentConfig(Config):
    DEBUG = True
    ENV = "development"


class ProductionConfig(Config):
    DEBUG = False
    ENV = "production"


def get_config():
    env = os.getenv("FLASK_ENV", "development").lower()
    if env == "production":
        return ProductionConfig
    return DevelopmentConfig
