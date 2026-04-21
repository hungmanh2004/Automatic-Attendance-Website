import mimetypes

from flask import Blueprint, current_app, jsonify, request, send_file

from ..models import FaceSample
from ..services.auth import require_manager, serialize_employee
from .helpers import (
    get_employee,
    get_service,
    invalid_request,
    serialize_face_sample,
)

face_enrollment_bp = Blueprint("face_enrollment", __name__)


@face_enrollment_bp.get("/manager/employees/<int:employee_id>/face-samples")
def manager_employee_face_samples(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_samples = (
        FaceSample.query.filter_by(employee_id=employee.id)
        .order_by(FaceSample.sample_index.asc())
        .all()
    )
    face_enrollment_service = get_service("face_enrollment_service")
    capture_config = face_enrollment_service.build_capture_config(
        min_frames=current_app.config.get("FACE_BATCH_MIN_FRAMES", 8),
        max_frames=current_app.config.get("FACE_BATCH_MAX_FRAMES", 12),
        min_capture_gap_ms=current_app.config.get("FACE_CAPTURE_MIN_GAP_MS", 300),
    )
    return jsonify(
        {
            "employee": serialize_employee(employee),
            "face_samples": [serialize_face_sample(fs) for fs in face_samples],
            "capture_config": capture_config,
        }
    )


@face_enrollment_bp.get("/manager/employees/<int:employee_id>/face-samples/<int:sample_index>/image")
def manager_employee_face_sample_image(employee_id, sample_index):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_sample = FaceSample.query.filter_by(employee_id=employee.id, sample_index=sample_index).first()
    if face_sample is None:
        return jsonify({"status": "face_sample_not_found"}), 404

    face_sample_service = get_service("face_sample_service")
    image_path = face_sample_service.resolve_sample_image_path(face_sample.image_path)
    if image_path is None:
        return jsonify({"status": "face_sample_not_found"}), 404

    mime_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    return send_file(image_path, mimetype=mime_type)


@face_enrollment_bp.post("/manager/employees/<int:employee_id>/face-enrollment")
def manager_employee_face_enrollment(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    images = request.files.getlist("images")
    expected = current_app.config.get("FACE_SAMPLES_PER_ENROLLMENT", 5)
    face_enrollment_service = get_service("face_enrollment_service")
    result = face_enrollment_service.enroll_static(
        employee,
        images,
        expected_sample_count=expected,
    )
    return jsonify(result.payload), result.http_status


@face_enrollment_bp.post("/manager/employees/<int:employee_id>/face-enrollment/batch")
def manager_employee_face_enrollment_batch(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    frames = request.files.getlist("frames")
    metadata = request.form.get("metadata")
    min_frames = current_app.config.get("FACE_BATCH_MIN_FRAMES", 8)
    max_frames = current_app.config.get("FACE_BATCH_MAX_FRAMES", 12)
    face_enrollment_service = get_service("face_enrollment_service")
    result = face_enrollment_service.enroll_batch(
        employee,
        frames,
        metadata=metadata,
        min_frames=min_frames,
        max_frames=max_frames,
    )
    return jsonify(result.payload), result.http_status


@face_enrollment_bp.put("/manager/employees/<int:employee_id>/face-samples/<int:sample_index>")
def manager_employee_face_sample_replace(employee_id, sample_index):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    max_samples = current_app.config.get("FACE_SAMPLES_PER_ENROLLMENT", 5)
    if sample_index < 1 or sample_index > max_samples:
        return invalid_request(f"sample_index must be between 1 and {max_samples}")

    image = request.files.get("image")
    face_enrollment_service = get_service("face_enrollment_service")
    result = face_enrollment_service.replace_sample(
        employee,
        sample_index,
        image,
    )
    return jsonify(result.payload), result.http_status


@face_enrollment_bp.delete("/manager/employees/<int:employee_id>/face-samples")
def manager_employee_face_samples_delete(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_enrollment_service = get_service("face_enrollment_service")
    result = face_enrollment_service.delete_all_faces(employee)
    return jsonify(result.payload), result.http_status
