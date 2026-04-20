import json
from dataclasses import dataclass
from pathlib import Path

from ..models import FaceEmbedding, FaceSample


@dataclass
class FaceDeletionResult:
    samples: list
    embeddings: list
    image_paths: list[str]

    @property
    def deleted_sample_count(self) -> int:
        return len(self.samples)


class FaceSampleService:
    def __init__(self, db, faces_dir, storage_service, face_index_service):
        self.db = db
        self.faces_dir = Path(faces_dir)
        self.storage_service = storage_service
        self.face_index_service = face_index_service

    def employee_has_registration(self, employee_id: int) -> bool:
        return (
            FaceSample.query.filter_by(employee_id=employee_id).first() is not None
            or FaceEmbedding.query.filter_by(employee_id=employee_id).first() is not None
        )

    def delete_employee_faces(
        self,
        employee_id: int,
        *,
        commit: bool = True,
        cleanup_files: bool = True,
        update_index: bool = True,
    ) -> FaceDeletionResult:
        face_samples = (
            FaceSample.query.filter_by(employee_id=employee_id)
            .order_by(FaceSample.sample_index.asc())
            .all()
        )
        face_embeddings = (
            FaceEmbedding.query.filter_by(employee_id=employee_id)
            .order_by(FaceEmbedding.id.asc())
            .all()
        )
        image_paths = [sample.image_path for sample in face_samples]
        image_paths.extend(embedding.image_path for embedding in face_embeddings if embedding.image_path)

        for face_sample in face_samples:
            self.db.session.delete(face_sample)
        for face_embedding in face_embeddings:
            self.db.session.delete(face_embedding)

        result = FaceDeletionResult(
            samples=face_samples,
            embeddings=face_embeddings,
            image_paths=[str(path) for path in image_paths if path],
        )

        if commit:
            self.db.session.commit()
            if cleanup_files:
                self.cleanup_deleted_face_files(result)
            if update_index:
                self.delete_employee_index(employee_id)

        return result

    def cleanup_deleted_face_files(self, result: FaceDeletionResult) -> None:
        self.storage_service.remove_employee_face_files(result.image_paths)

    def delete_employee_index(self, employee_id: int) -> None:
        self.face_index_service.delete_employee(employee_id)

    def persist_preview_samples(self, employee_id: int, preview_frames) -> tuple[list, list]:
        prepared_samples = []
        saved_paths = []

        for preview in preview_frames:
            candidate = preview["candidate"]
            image_path = self.storage_service.save_employee_face_sample(
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

    def persist_embeddings(self, employee_id: int, batch_result) -> list:
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

    def resolve_sample_image_path(self, stored_path: str) -> Path | None:
        if not stored_path:
            return None

        root = self.faces_dir.resolve()
        candidate = Path(stored_path)
        if not candidate.is_absolute():
            candidate = root / candidate

        try:
            resolved = candidate.resolve()
            resolved.relative_to(root)
        except (OSError, ValueError):
            return None

        return resolved if resolved.exists() and resolved.is_file() else None
