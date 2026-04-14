import os
import secrets
from pathlib import Path


class Config:
    BASE_DIR = Path(__file__).resolve().parents[1]
    DATA_DIR = BASE_DIR / "data"
    APP_DB_PATH = DATA_DIR / "app.db"
    CHECKIN_DIR = DATA_DIR / "checkins"
    FACES_DIR = DATA_DIR / "faces"
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    SESSION_TYPE = "redis"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_PERMANENT = False
