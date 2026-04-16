import json
import mimetypes
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import FaceEmbedding, FaceSample
from ..services.auth import require_manager, serialize_employee
from ..services.face_batch_enrollment import FaceBatchEnrollmentError, FaceBatchEnrollmentService
from .helpers import (
    get_employee,
    get_service,
    invalid_request,
    serialize_face_sample,
)


face_enrollment_bp = Blueprint("face_enrollment", __name__)


def _delete_face_embeddings_for_employee(employee_id):
    face_embeddings = (
        FaceEmbedding.query.filter_by(employee_id=employee_id)
        .order_by(FaceEmbedding.id.asc())
        .all()
    )

    removable_paths = []
    for face_embedding in face_embeddings:
        if face_embedding.image_path:
            removable_paths.append(face_embedding.image_path)
        db.session.delete(face_embedding)
    db.session.commit()

    if removable_paths:
        get_service("storage_service").remove_employee_face_files(removable_paths)

    return face_embeddings


def _purge_face_embeddings_for_employee(employee_id):
    removable_paths = []
    face_embeddings = (
        FaceEmbedding.query.filter_by(employee_id=employee_id)
        .order_by(FaceEmbedding.id.asc())
        .all()
    )

    for face_embedding in face_embeddings:
        if face_embedding.image_path:
            removable_paths.append(face_embedding.image_path)
        db.session.delete(face_embedding)

    return removable_paths


def _delete_face_samples_for_employee(employee_id):
    face_samples = (
        FaceSample.query.filter_by(employee_id=employee_id)
        .order_by(FaceSample.sample_index.asc())
        .all()
    )

    for face_sample in face_samples:
        db.session.delete(face_sample)
    db.session.commit()

    storage_service = get_service("storage_service")
    storage_service.remove_employee_face_files([fs.image_path for fs in face_samples])
    _delete_face_embeddings_for_employee(employee_id)
    get_service("face_index_service").delete_employee(employee_id)

    return face_samples


def _employee_has_face_registration(employee_id):
    return (
        FaceSample.query.filter_by(employee_id=employee_id).first() is not None
        or FaceEmbedding.query.filter_by(employee_id=employee_id).first() is not None
    )


def _persist_preview_samples(employee_id, preview_frames, storage_service):
    prepared_samples = []
    saved_paths = []

    for preview in preview_frames:
        candidate = preview["candidate"]
        image_path = storage_service.save_employee_face_sample(
            employee_id,
            preview["sample_index"],
            candidate.frame_bytes,
            filename=candidate.filename,
        )
        saved_paths.append(image_path)
        prepared_samples.append(
            FaceSample(
                employee_id=employee_id,
                sample_index=preview["sample_index"],
                image_path=str(image_path),
                embedding_json=json.dumps(candidate.embedding),
            )
        )

    return prepared_samples, saved_paths


def _persist_embeddings(employee_id, batch_result):
    prepared_embeddings = [
        FaceEmbedding(
            employee_id=employee_id,
            embedding_role="mean",
            pose_label="aggregate",
            quality_score=None,
            image_path=None,
            embedding_json=json.dumps(batch_result["mean_embedding"]),
        )
    ]

    for candidate in batch_result["representative_frames"]:
        prepared_embeddings.append(
            FaceEmbedding(
                employee_id=employee_id,
                embedding_role="representative",
                pose_label=candidate.pose_label,
                quality_score=candidate.quality_score,
                image_path=None,
                embedding_json=json.dumps(candidate.embedding),
            )
        )

    return prepared_embeddings


def _build_batch_response(employee, prepared_samples, batch_result, prepared_embeddings):
    preview_samples = []
    pose_by_sample_index = {item["sample_index"]: item["pose_label"] for item in batch_result["preview_frames"]}

    for sample in prepared_samples:
        payload = serialize_face_sample(sample)
        payload["pose_label"] = pose_by_sample_index.get(sample.sample_index, "unknown")
        preview_samples.append(payload)

    representative_count = sum(1 for item in prepared_embeddings if item.embedding_role == "representative")
    return {
        "employee": serialize_employee(employee),
        "face_samples": preview_samples,
        "face_sample_count": len(prepared_samples),
        "valid_frame_count": batch_result["valid_frame_count"],
        "rejected_frame_count": batch_result["rejected_frame_count"],
        "selected_frame_count": batch_result["selected_frame_count"],
        "saved_embedding_count": len(prepared_embeddings),
        "representative_embedding_count": representative_count,
        "status": "enrolled_from_batch",
    }


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
    return jsonify(
        {
            "employee": serialize_employee(employee),
            "face_samples": [serialize_face_sample(fs) for fs in face_samples],
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

    image_path = Path(face_sample.image_path)
    if not image_path.exists() or not image_path.is_file():
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

    if _employee_has_face_registration(employee.id):
        return jsonify({"status": "face_registration_exists"}), 409

    images = request.files.getlist("images")
    if len(images) != 5:
        return invalid_request("exactly 5 images are required")

    storage_service = get_service("storage_service")
    embedding_service = get_service("embedding_service")
    face_index_service = get_service("face_index_service")

    prepared_samples = []
    saved_paths = []

    try:
        for sample_index, image in enumerate(images, start=1):
            if image is None or not image.filename:
                storage_service.remove_employee_face_files(saved_paths)
                return invalid_request("images are required")

            frame_bytes = image.read()
            if not frame_bytes:
                storage_service.remove_employee_face_files(saved_paths)
                return invalid_request("images are required")

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
        if _employee_has_face_registration(employee.id):
            return jsonify({"status": "face_registration_exists"}), 409
        raise
    except Exception:
        db.session.rollback()
        storage_service.remove_employee_face_files(saved_paths)
        raise

    for sample in prepared_samples:
        embedding = json.loads(sample.embedding_json)
        face_index_service.upsert(
            employee_id=employee.id,
            sample_index=sample.sample_index,
            employee_code=employee.employee_code,
            full_name=employee.full_name,
            embedding=embedding,
        )
    return (
        jsonify(
            {
                "employee": serialize_employee(employee),
                "face_samples": [serialize_face_sample(fs) for fs in prepared_samples],
                "face_sample_count": len(prepared_samples),
            }
        ),
        201,
    )


@face_enrollment_bp.post("/manager/employees/<int:employee_id>/face-enrollment/batch")
def manager_employee_face_enrollment_batch(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    if _employee_has_face_registration(employee.id):
        return jsonify({"status": "face_registration_exists"}), 409

    frames = request.files.getlist("frames")
    metadata = request.form.get("metadata")
    batch_service = FaceBatchEnrollmentService(get_service("embedding_service"))

    try:
        batch_result = batch_service.prepare_batch(frames, metadata=metadata)
    except FaceBatchEnrollmentError as error:
        payload = {"status": error.status, "message": error.message}
        payload.update(error.payload)
        return jsonify(payload), 400

    storage_service = get_service("storage_service")
    face_index_service = get_service("face_index_service")

    prepared_samples = []
    prepared_embeddings = []
    saved_paths = []

    try:
        prepared_samples, saved_paths = _persist_preview_samples(employee.id, batch_result["preview_frames"], storage_service)
        prepared_embeddings = _persist_embeddings(employee.id, batch_result)

        db.session.add_all(prepared_samples)
        db.session.add_all(prepared_embeddings)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        storage_service.remove_employee_face_files(saved_paths)
        if _employee_has_face_registration(employee.id):
            return jsonify({"status": "face_registration_exists"}), 409
        raise
    except Exception:
        db.session.rollback()
        storage_service.remove_employee_face_files(saved_paths)
        raise

    face_index_service.refresh()
    return jsonify(_build_batch_response(employee, prepared_samples, batch_result, prepared_embeddings)), 201


@face_enrollment_bp.put("/manager/employees/<int:employee_id>/face-samples/<int:sample_index>")
def manager_employee_face_sample_replace(employee_id, sample_index):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    if sample_index < 1 or sample_index > 5:
        return invalid_request("sample_index must be between 1 and 5")

    image = request.files.get("image")
    if image is None or not image.filename:
        return invalid_request("image is required")

    frame_bytes = image.read()
    if not frame_bytes:
        return invalid_request("image is required")

    embedding_service = get_service("embedding_service")
    storage_service = get_service("storage_service")
    face_index_service = get_service("face_index_service")

    embeddings = embedding_service.extract_embeddings(frame_bytes)
    if len(embeddings) == 0:
        return jsonify({"status": "no_face", "image_index": sample_index}), 400
    if len(embeddings) > 1:
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

    face_sample = FaceSample.query.filter_by(employee_id=employee.id, sample_index=sample_index).first()
    old_image_path = face_sample.image_path if face_sample is not None else None

    new_image_path = storage_service.save_employee_face_sample(
        employee.id,
        sample_index,
        frame_bytes,
        filename=image.filename,
    )

    try:
        if face_sample is None:
            face_sample = FaceSample(
                employee_id=employee.id,
                sample_index=sample_index,
                image_path=str(new_image_path),
                embedding_json=json.dumps(embeddings[0]),
            )
            db.session.add(face_sample)
        else:
            face_sample.image_path = str(new_image_path)
            face_sample.embedding_json = json.dumps(embeddings[0])

        removable_embedding_paths = _purge_face_embeddings_for_employee(employee.id)
        db.session.commit()
    except Exception:
        db.session.rollback()
        storage_service.remove_path(new_image_path)
        raise

    if old_image_path and old_image_path != str(new_image_path):
        storage_service.remove_path(old_image_path)
    if removable_embedding_paths:
        storage_service.remove_employee_face_files(removable_embedding_paths)

    face_index_service.upsert(
        employee_id=employee.id,
        sample_index=sample_index,
        employee_code=employee.employee_code,
        full_name=employee.full_name,
        embedding=embeddings[0],
    )
    return jsonify(
        {
            "employee": serialize_employee(employee),
            "face_sample": serialize_face_sample(face_sample),
            "status": "updated",
        }
    )


@face_enrollment_bp.delete("/manager/employees/<int:employee_id>/face-samples")
def manager_employee_face_samples_delete(employee_id):
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    employee, error_response = get_employee(employee_id)
    if error_response is not None:
        return error_response

    face_samples = _delete_face_samples_for_employee(employee.id)
    deleted_count = len(face_samples)

    return jsonify({"employee_id": employee.id, "deleted_count": deleted_count})
