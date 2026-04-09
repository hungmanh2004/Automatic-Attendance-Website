from pathlib import Path

from flask import Flask
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from .config import Config
from .extensions import db
from .routes.manager import manager_bp
from .routes.face_enrollment import face_enrollment_bp
from .routes.guest import guest_bp
from .routes.health import health_bp
from .services.attendance import AttendanceService
from .services.embedding import EmbeddingService
from .services.face_index import FaceIndexService
from .services.recognition import RecognitionService
from .services.storage import StorageService


def _resolve_paths(app):
    app.config["APP_DB_PATH"] = Path(app.config["APP_DB_PATH"])
    app.config["CHECKIN_DIR"] = Path(app.config["CHECKIN_DIR"])
    app.config["FACES_DIR"] = Path(app.config["FACES_DIR"])


def _configure_storage(app):
    db_path = app.config["APP_DB_PATH"]
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path.as_posix()}"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    app.config["CHECKIN_DIR"].mkdir(parents=True, exist_ok=True)
    app.config["FACES_DIR"].mkdir(parents=True, exist_ok=True)


def _initialize_database(app):
    db.init_app(app)

    from . import models  # noqa: F401

    with app.app_context():
        db.create_all()
        _run_schema_updates()


def _run_schema_updates():
    inspector = inspect(db.engine)
    employee_columns = {column["name"] for column in inspector.get_columns("employees")}
    if "department" not in employee_columns:
        try:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN department VARCHAR(255) DEFAULT 'Văn phòng'"))
        except OperationalError as error:
            if "duplicate column name: department" not in str(error):
                raise
            db.session.rollback()
        db.session.execute(text("UPDATE employees SET department = 'Văn phòng' WHERE department IS NULL"))
        db.session.commit()

    if "position" not in employee_columns:
        try:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN position VARCHAR(255) DEFAULT 'Nhan vien'"))
        except OperationalError as error:
            if "duplicate column name: position" not in str(error):
                raise
            db.session.rollback()
        db.session.execute(text("UPDATE employees SET position = 'Nhan vien' WHERE position IS NULL"))
        db.session.commit()


def _initialize_services(app):
    storage_service = StorageService(app.config["CHECKIN_DIR"], app.config["FACES_DIR"])
    embedding_service = EmbeddingService()
    face_index_service = FaceIndexService()
    attendance_service = AttendanceService()
    recognition_service = RecognitionService(
        storage_service=storage_service,
        embedding_service=embedding_service,
        face_index_service=face_index_service,
        attendance_service=attendance_service,
    )

    app.extensions["storage_service"] = storage_service
    app.extensions["embedding_service"] = embedding_service
    app.extensions["face_index_service"] = face_index_service
    app.extensions["attendance_service"] = attendance_service
    app.extensions["recognition_service"] = recognition_service


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    _resolve_paths(app)
    _configure_storage(app)
    _initialize_database(app)
    _initialize_services(app)
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(guest_bp, url_prefix="/api")
    app.register_blueprint(manager_bp, url_prefix="/api")
    app.register_blueprint(face_enrollment_bp, url_prefix="/api")

    return app
