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
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    CELERY_TASK_RESULT_EXPIRES = int(os.getenv("CELERY_TASK_RESULT_EXPIRES", "300"))
    CELERY_TASK_TIME_LIMIT = int(os.getenv("CELERY_TASK_TIME_LIMIT", "30"))
    CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
    CELERY_TASK_EAGER_PROPAGATES = os.getenv("CELERY_TASK_EAGER_PROPAGATES", "false").lower() == "true"
    SESSION_TYPE = "redis"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_PERMANENT = False

    # Attendance
    ON_TIME_HOUR = 9
    ON_TIME_MINUTE = 0

    # Face enrollment
    FACE_SAMPLES_PER_ENROLLMENT = 5
    FACE_BATCH_MIN_FRAMES = int(os.getenv("FACE_BATCH_MIN_FRAMES", "8"))
    FACE_BATCH_MAX_FRAMES = int(os.getenv("FACE_BATCH_MAX_FRAMES", "12"))
    FACE_CAPTURE_MIN_GAP_MS = int(os.getenv("FACE_CAPTURE_MIN_GAP_MS", "300"))

    # Recognition
    FACE_MATCH_THRESHOLD = 0.6

    # Rate limiting
    GUEST_RATE_LIMIT_MAX_REQUESTS = 10
    GUEST_RATE_LIMIT_WINDOW_SECONDS = 60
