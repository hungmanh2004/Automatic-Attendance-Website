from datetime import datetime

from .extensions import db


class ManagerUser(db.Model):
    __tablename__ = "manager_users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    employee_code = db.Column(db.String(64), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class FaceSample(db.Model):
    __tablename__ = "face_samples"
    __table_args__ = (db.UniqueConstraint("employee_id", "sample_index", name="uq_employee_sample_index"),)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    sample_index = db.Column(db.Integer, nullable=False)
    image_path = db.Column(db.String(512), nullable=False)
    embedding_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class AttendanceEvent(db.Model):
    __tablename__ = "attendance_events"
    __table_args__ = (db.UniqueConstraint("employee_id", "checkin_date", name="uq_employee_checkin_date"),)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    checked_in_at = db.Column(db.DateTime, nullable=False)
    checkin_date = db.Column(db.String(10), nullable=False)
    snapshot_path = db.Column(db.String(512), nullable=False)
    distance = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
