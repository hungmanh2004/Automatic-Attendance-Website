from flask import current_app, jsonify, url_for

from ..extensions import db
from ..models import Employee


def invalid_request(message):
    return jsonify({"status": "invalid_request", "message": message}), 400


def employee_not_found():
    return jsonify({"status": "employee_not_found"}), 404


def attendance_not_found():
    return jsonify({"status": "attendance_not_found"}), 404


def snapshot_not_found():
    return jsonify({"status": "snapshot_not_found"}), 404


def normalize_text(value):
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def get_employee(employee_id):
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        return None, employee_not_found()
    return employee, None


def get_service(name):
    return current_app.extensions[name]


def serialize_face_sample(face_sample):
    return {
        "id": face_sample.id,
        "employee_id": face_sample.employee_id,
        "sample_index": face_sample.sample_index,
        "image_path": face_sample.image_path,
        "image_url": url_for(
            "face_enrollment.manager_employee_face_sample_image",
            employee_id=face_sample.employee_id,
            sample_index=face_sample.sample_index,
        ),
        "created_at": face_sample.created_at.isoformat(),
    }
