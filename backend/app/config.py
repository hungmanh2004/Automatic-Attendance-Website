from pathlib import Path


class Config:
    BASE_DIR = Path(__file__).resolve().parents[1]
    DATA_DIR = BASE_DIR / "data"
    APP_DB_PATH = DATA_DIR / "app.db"
    CHECKIN_DIR = DATA_DIR / "checkins"
    FACES_DIR = DATA_DIR / "faces"
    SECRET_KEY = "local-browser-webapp-secret-key"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 3 * 1024 * 1024
