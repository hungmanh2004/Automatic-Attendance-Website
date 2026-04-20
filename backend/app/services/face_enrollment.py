import json
from dataclasses import dataclass

from flask import url_for
from sqlalchemy.exc import IntegrityError

from ..models import FaceSample
from .auth import serialize_employee
from .face_batch_enrollment import FaceBatchEnrollmentError, FaceBatchEnrollmentService
from .image_validation import is_allowed_image_filename, read_non_empty_upload


@dataclass
class FaceEnrollmentResult:
    ok: bool
    status: str
    payload: dict
    http_status: int


def _invalid_request(message: str) -> FaceEnrollmentResult:
    return FaceEnrollmentResult(
        ok=False,
        status="invalid_request",
        payload={"status": "invalid_request", "message": message},
        http_status=400,
    )


def _serialize_face_sample(face_sample: FaceSample) -> dict:
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


def _resolve_service(service_or_provider):
    return service_or_provider() if callable(service_or_provider) else service_or_provider


class FaceEnrollmentService:
    def __init__(
        self,
        db,
        storage_service,
        embedding_service,
        face_index_service,
        face_sample_service,
    ):
        self.db = db
        self.storage_service = storage_service
        self._embedding_service = embedding_service
        self._face_index_service = face_index_service
        self.face_sample_service = face_sample_service

    @property
    def embedding_service(self):
        return _resolve_service(self._embedding_service)

    @property
    def face_index_service(self):
        return _resolve_service(self._face_index_service)

    def build_capture_config(self, *, min_frames: int, max_frames: int) -> dict:
        return {
            "min_frames": min_frames,
            "max_frames": max_frames,
            "thumbnail_limit": 10,
            "min_capture_gap_ms": 700,
        }

    def enroll_static(self, employee, images, *, expected_sample_count: int) -> FaceEnrollmentResult:
        if self.face_sample_service.employee_has_registration(employee.id):
            return FaceEnrollmentResult(
                ok=False,
                status="face_registration_exists",
                payload={"status": "face_registration_exists"},
                http_status=409,
            )

        if len(images) != expected_sample_count:
            return _invalid_request(f"exactly {expected_sample_count} images are required")

        prepared_samples = []
        saved_paths = []

        try:
            for sample_index, image in enumerate(images, start=1):
                validation_result = self._prepare_static_sample(employee, sample_index, image, saved_paths)
                if isinstance(validation_result, FaceEnrollmentResult):
                    return validation_result

                prepared_samples.append(validation_result)

            self.db.session.add_all(prepared_samples)
            self.db.session.commit()
        except IntegrityError:
            self.db.session.rollback()
            self.storage_service.remove_employee_face_files(saved_paths)
            if self.face_sample_service.employee_has_registration(employee.id):
                return FaceEnrollmentResult(
                    ok=False,
                    status="face_registration_exists",
                    payload={"status": "face_registration_exists"},
                    http_status=409,
                )
            raise
        except Exception:
            self.db.session.rollback()
            self.storage_service.remove_employee_face_files(saved_paths)
            raise

        for sample in prepared_samples:
            embedding = json.loads(sample.embedding_json)
            self.face_index_service.upsert(
                employee_id=employee.id,
                sample_index=sample.sample_index,
                employee_code=employee.employee_code,
                full_name=employee.full_name,
                embedding=embedding,
            )

        return FaceEnrollmentResult(
            ok=True,
            status="enrolled",
            payload={
                "employee": serialize_employee(employee),
                "face_samples": [_serialize_face_sample(sample) for sample in prepared_samples],
                "face_sample_count": len(prepared_samples),
            },
            http_status=201,
        )

    def enroll_batch(
        self,
        employee,
        frames,
        *,
        metadata,
        min_frames: int,
        max_frames: int,
    ) -> FaceEnrollmentResult:
        if self.face_sample_service.employee_has_registration(employee.id):
            return FaceEnrollmentResult(
                ok=False,
                status="face_registration_exists",
                payload={"status": "face_registration_exists"},
                http_status=409,
            )

        frame_list = list(frames)
        for frame in frame_list:
            if not is_allowed_image_filename(frame.filename):
                return _invalid_request("all frames must be JPEG, PNG, BMP, or WebP images")

        batch_service = FaceBatchEnrollmentService(
            self.embedding_service,
            min_frames=min_frames,
            max_frames=max_frames,
        )
        try:
            batch_result = batch_service.prepare_batch(frame_list, metadata=metadata)
        except FaceBatchEnrollmentError as error:
            payload = {"status": error.status, "message": error.message}
            payload.update(error.payload)
            return FaceEnrollmentResult(
                ok=False,
                status=error.status,
                payload=payload,
                http_status=400,
            )

        prepared_samples = []
        prepared_embeddings = []
        saved_paths = []

        try:
            prepared_samples, saved_paths = self.face_sample_service.persist_preview_samples(
                employee.id,
                batch_result["preview_frames"],
            )
            prepared_embeddings = self.face_sample_service.persist_embeddings(employee.id, batch_result)

            self.db.session.add_all(prepared_samples)
            self.db.session.add_all(prepared_embeddings)
            self.db.session.commit()
        except IntegrityError:
            self.db.session.rollback()
            self.face_sample_service.storage_service.remove_employee_face_files(saved_paths)
            if self.face_sample_service.employee_has_registration(employee.id):
                return FaceEnrollmentResult(
                    ok=False,
                    status="face_registration_exists",
                    payload={"status": "face_registration_exists"},
                    http_status=409,
                )
            raise
        except Exception:
            self.db.session.rollback()
            self.face_sample_service.storage_service.remove_employee_face_files(saved_paths)
            raise

        self.face_index_service.refresh()
        return FaceEnrollmentResult(
            ok=True,
            status="enrolled_from_batch",
            payload=self._build_batch_response(employee, prepared_samples, batch_result, prepared_embeddings),
            http_status=201,
        )

    def replace_sample(self, employee, sample_index: int, image) -> FaceEnrollmentResult:
        if image is None or not image.filename:
            return _invalid_request("image is required")

        if not is_allowed_image_filename(image.filename):
            return _invalid_request("image must be a JPEG, PNG, BMP, or WebP")

        frame_bytes = read_non_empty_upload(image)
        if frame_bytes is None:
            return _invalid_request("image is required")

        embeddings = self.embedding_service.extract_embeddings(frame_bytes)
        if len(embeddings) == 0:
            return FaceEnrollmentResult(
                ok=False,
                status="no_face",
                payload={"status": "no_face", "image_index": sample_index},
                http_status=400,
            )
        if len(embeddings) > 1:
            return FaceEnrollmentResult(
                ok=False,
                status="multiple_faces",
                payload={
                    "status": "multiple_faces",
                    "image_index": sample_index,
                    "faces_detected": len(embeddings),
                },
                http_status=400,
            )

        face_sample = FaceSample.query.filter_by(employee_id=employee.id, sample_index=sample_index).first()
        old_image_path = face_sample.image_path if face_sample is not None else None
        new_image_path = self.storage_service.save_employee_face_sample(
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
                self.db.session.add(face_sample)
            else:
                face_sample.image_path = str(new_image_path)
                face_sample.embedding_json = json.dumps(embeddings[0])

            self.db.session.commit()
        except Exception:
            self.db.session.rollback()
            self.storage_service.remove_path(new_image_path)
            raise

        if old_image_path and old_image_path != str(new_image_path):
            self.storage_service.remove_path(old_image_path)

        self.face_index_service.upsert(
            employee_id=employee.id,
            sample_index=sample_index,
            employee_code=employee.employee_code,
            full_name=employee.full_name,
            embedding=embeddings[0],
        )
        return FaceEnrollmentResult(
            ok=True,
            status="updated",
            payload={
                "employee": serialize_employee(employee),
                "face_sample": _serialize_face_sample(face_sample),
                "status": "updated",
            },
            http_status=200,
        )

    def delete_all_faces(self, employee) -> FaceEnrollmentResult:
        deletion_result = self.face_sample_service.delete_employee_faces(employee.id)
        return FaceEnrollmentResult(
            ok=True,
            status="deleted",
            payload={
                "employee_id": employee.id,
                "deleted_count": deletion_result.deleted_sample_count,
            },
            http_status=200,
        )

    def _prepare_static_sample(self, employee, sample_index: int, image, saved_paths: list):
        if image is None or not image.filename:
            self.storage_service.remove_employee_face_files(saved_paths)
            return _invalid_request("images are required")

        if not is_allowed_image_filename(image.filename):
            self.storage_service.remove_employee_face_files(saved_paths)
            return _invalid_request("images must be JPEG, PNG, BMP, or WebP format")

        frame_bytes = read_non_empty_upload(image)
        if frame_bytes is None:
            self.storage_service.remove_employee_face_files(saved_paths)
            return _invalid_request("images are required")

        embeddings = self.embedding_service.extract_embeddings(frame_bytes)
        if len(embeddings) == 0:
            self.storage_service.remove_employee_face_files(saved_paths)
            return FaceEnrollmentResult(
                ok=False,
                status="no_face",
                payload={"status": "no_face", "image_index": sample_index},
                http_status=400,
            )
        if len(embeddings) > 1:
            self.storage_service.remove_employee_face_files(saved_paths)
            return FaceEnrollmentResult(
                ok=False,
                status="multiple_faces",
                payload={
                    "status": "multiple_faces",
                    "image_index": sample_index,
                    "faces_detected": len(embeddings),
                },
                http_status=400,
            )

        image_path = self.storage_service.save_employee_face_sample(
            employee.id,
            sample_index,
            frame_bytes,
            filename=image.filename,
        )
        saved_paths.append(image_path)

        return FaceSample(
            employee_id=employee.id,
            sample_index=sample_index,
            image_path=str(image_path),
            embedding_json=json.dumps(embeddings[0]),
        )

    def _build_batch_response(self, employee, prepared_samples, batch_result, prepared_embeddings) -> dict:
        preview_samples = []
        pose_by_sample_index = {item["sample_index"]: item["pose_label"] for item in batch_result["preview_frames"]}

        for sample in prepared_samples:
            payload = _serialize_face_sample(sample)
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
