import mimetypes
import json
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file, url_for
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import Employee, FaceSample
from ..services.auth import (
    authenticate_manager,
    list_employees,
    login_manager,
    require_manager,
    serialize_employee,
    serialize_manager,
)


manager_bp = Blueprint("manager", __name__)


def _invalid_request(message):
    return jsonify({"status": "invalid_request", "message": message}), 400


def _unauthorized():
    return jsonify({"status": "unauthorized"}), 401


def _employee_not_found():
    return jsonify({"status": "employee_not_found"}), 404


def _attendance_not_found():
    return jsonify({"status": "attendance_not_found"}), 404


def _snapshot_not_found():
    return jsonify({"status": "snapshot_not_found"}), 404


def _normalize_text(value):
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _parse_date(value, field_name):
    if value is None:
        return None, None

    normalized = _normalize_text(value)
    if not normalized:
        return None, _invalid_request(f"{field_name} must be YYYY-MM-DD")

    try:
        return datetime.strptime(normalized, "%Y-%m-%d").date(), None
    except ValueError:
        return None, _invalid_request(f"{field_name} must be YYYY-MM-DD")


def _get_employee(employee_id):
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        return None, _employee_not_found()
    return employee, None


def _serialize_face_sample(face_sample):
    return {
        "id": face_sample.id,
        "sample_index": face_sample.sample_index,
        "image_path": face_sample.image_path,
        "created_at": face_sample.created_at.isoformat(),
    }


def _get_service(name):
    return current_app.extensions[name]


@manager_bp.post("/manager/login")
def manager_login():
    payload = request.get_json(silent=True) or {}
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username or not password:
        return _invalid_request("username and password are required")

    manager = authenticate_manager(username, password)
    if manager is None:
        return jsonify({"status": "invalid_credentials"}), 401

    login_manager(manager)
    return jsonify({"manager": serialize_manager(manager)})


@manager_bp.get("/manager/me")
def manager_me():
    manager, error_response = require_manager()
    if error_response is not None:
        return error_response

    return jsonify({"manager": serialize_manager(manager)})


@manager_bp.get("/manager/employees")
def manager_employees():
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    return jsonify({"employees": list_employees()})


@manager_bp.post("/manager/employees")
def manager_create_employee():
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    payload = request.get_json(silent=True) or {}
    employee_code = _normalize_text(payload.get("employee_code"))
    full_name = _normalize_text(payload.get("full_name"))
    if not employee_code or not full_name:
        return _invalid_request("employee_code and full_name are required")

    existing_employee = Employee.query.filter_by(employee_code=employee_code).first()
    if existing_employee is not None:
        return jsonify({"status": "duplicate_employee_code"}), 409

    employee = Employee(employee_code=employee_code, full_name=full_name)
    db.session.add(employee)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        code_conflict = Employee.query.filter_by(employee_code=employee_code).first()
        if code_conflict is not None:
            return jsonify({"status": "duplicate_employee_code"}), 409
        raise

    return jsonify({"employee": serialize_employee(employee)}), 201


@manager_bp.get("/manager/employees/<int:employee_id>/face-samples")
def manager_employee_face_samples(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = _get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_samples = (
        FaceSample.query.filter_by(employee_id=employee.id)
        .order_by(FaceSample.sample_index.asc())
        .all()
    )
    return jsonify(
        {
            "employee": serialize_employee(employee),
            "face_samples": [_serialize_face_sample(face_sample) for face_sample in face_samples],
        }
    )


@manager_bp.post("/manager/employees/<int:employee_id>/face-enrollment")
def manager_employee_face_enrollment(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = _get_employee(employee_id)
    if error_response is not None:
        return error_response

    existing_face_sample = FaceSample.query.filter_by(employee_id=employee.id).first()
    if existing_face_sample is not None:
        return jsonify({"status": "face_registration_exists"}), 409

    images = request.files.getlist("images")
    if len(images) != 5:
        return _invalid_request("exactly 5 images are required")

    storage_service = _get_service("storage_service")
    embedding_service = _get_service("embedding_service")
    face_index_service = _get_service("face_index_service")

    prepared_samples = []
    saved_paths = []

    try:
        for sample_index, image in enumerate(images, start=1):
            if image is None or not image.filename:
                storage_service.remove_employee_face_files(saved_paths)
                return _invalid_request("images are required")

            frame_bytes = image.read()
            if not frame_bytes:
                storage_service.remove_employee_face_files(saved_paths)
                return _invalid_request("images are required")

            embeddings = embedding_service.extract_embeddings(frame_bytes)
            if len(embeddings) == 0:
                storage_service.remove_employee_face_files(saved_paths)
                return jsonify({"status": "no_face", "image_index": sample_index}), 400
            if len(embeddings) > 1:
                storage_service.remove_employee_face_files(saved_paths)
                return (
                    jsonify(
                        {
                            "status": "multiple_faces",
                            "image_index": sample_index,
                            "faces_detected": len(embeddings),
                        }
                    ),
                    400,
                )

            image_path = storage_service.save_employee_face_sample(
                employee.id,
                sample_index,
                frame_bytes,
                filename=image.filename,
            )
            saved_paths.append(image_path)
            prepared_samples.append(
                FaceSample(
                    employee_id=employee.id,
                    sample_index=sample_index,
                    image_path=str(image_path),
                    embedding_json=json.dumps(embeddings[0]),
                )
            )

        db.session.add_all(prepared_samples)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        storage_service.remove_employee_face_files(saved_paths)
        if FaceSample.query.filter_by(employee_id=employee.id).first() is not None:
            return jsonify({"status": "face_registration_exists"}), 409
        raise
    except Exception:
        db.session.rollback()
        storage_service.remove_employee_face_files(saved_paths)
        raise

    face_index_service.refresh()
    return (
        jsonify(
            {
                "employee": serialize_employee(employee),
                "face_samples": [_serialize_face_sample(face_sample) for face_sample in prepared_samples],
                "face_sample_count": len(prepared_samples),
            }
        ),
        201,
    )


@manager_bp.delete("/manager/employees/<int:employee_id>/face-samples")
def manager_employee_face_samples_delete(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = _get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_samples = (
        FaceSample.query.filter_by(employee_id=employee.id)
        .order_by(FaceSample.sample_index.asc())
        .all()
    )
    deleted_count = len(face_samples)

    for face_sample in face_samples:
        db.session.delete(face_sample)
    db.session.commit()

    storage_service = _get_service("storage_service")
    storage_service.remove_employee_face_files([face_sample.image_path for face_sample in face_samples])
    _get_service("face_index_service").refresh()

    return jsonify({"employee_id": employee.id, "deleted_count": deleted_count})


@manager_bp.get("/manager/attendance")
def manager_attendance():
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    from_date, error_response = _parse_date(request.args.get("from"), "from")
    if error_response is not None:
        return error_response

    to_date, error_response = _parse_date(request.args.get("to"), "to")
    if error_response is not None:
        return error_response

    if from_date is None and to_date is None:
        from_date = to_date = datetime.now().date()
    elif from_date is None:
        from_date = to_date
    elif to_date is None:
        to_date = from_date

    if from_date > to_date:
        return _invalid_request("from must be less than or equal to to")

    search = _normalize_text(request.args.get("search"))
    attendance_service = _get_service("attendance_service")
    rows = attendance_service.list_attendance_events(from_date=from_date, to_date=to_date, search=search)

    records = []
    for event, employee in rows:
        records.append(
            {
                "id": event.id,
                "employee_id": event.employee_id,
                "employee_code": employee.employee_code,
                "full_name": employee.full_name,
                "checked_in_at": event.checked_in_at.isoformat(),
                "snapshot_url": url_for("manager.manager_attendance_snapshot", attendance_id=event.id),
            }
        )

    return jsonify(
        {
            "filters": {
                "from": from_date.isoformat(),
                "to": to_date.isoformat(),
                "search": search or "",
            },
            "summary": {
                "total_records": len(records),
            },
            "records": records,
        }
    )


@manager_bp.get("/manager/attendance/<int:attendance_id>/snapshot")
def manager_attendance_snapshot(attendance_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    attendance_service = _get_service("attendance_service")
    attendance_event = attendance_service.get_attendance_event(attendance_id)
    if attendance_event is None:
        return _attendance_not_found()

    snapshot_path = Path(attendance_event.snapshot_path)
    if not snapshot_path.exists():
        return _snapshot_not_found()

    mime_type = mimetypes.guess_type(snapshot_path.name)[0] or "application/octet-stream"
    return send_file(snapshot_path, mimetype=mime_type)
