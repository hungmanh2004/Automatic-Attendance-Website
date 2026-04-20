from pathlib import Path

from backend.app.extensions import db
from backend.app.models import Employee, FaceEmbedding, FaceSample
from backend.app.services.face_samples import FaceSampleService
from backend.app.services.storage import StorageService


class FakeFaceIndexService:
    def __init__(self):
        self.deleted_employee_ids = []

    def delete_employee(self, employee_id):
        self.deleted_employee_ids.append(employee_id)


def _create_employee(app, employee_code="EMP-900", full_name="Face Sample Owner"):
    with app.app_context():
        employee = Employee(employee_code=employee_code, full_name=full_name)
        db.session.add(employee)
        db.session.commit()
        return employee.id


def _make_service(app, face_index_service=None):
    return FaceSampleService(
        db=db,
        faces_dir=app.config["FACES_DIR"],
        storage_service=StorageService(app.config["CHECKIN_DIR"], app.config["FACES_DIR"]),
        face_index_service=face_index_service or FakeFaceIndexService(),
    )


def test_employee_has_registration_checks_samples_and_embeddings(app):
    employee_id = _create_employee(app)
    service = _make_service(app)

    with app.app_context():
        assert service.employee_has_registration(employee_id) is False

        db.session.add(
            FaceSample(
                employee_id=employee_id,
                sample_index=1,
                image_path="sample-1.jpg",
                embedding_json="[0.1, 0.2, 0.3]",
            )
        )
        db.session.commit()
        assert service.employee_has_registration(employee_id) is True

        FaceSample.query.filter_by(employee_id=employee_id).delete()
        db.session.add(
            FaceEmbedding(
                employee_id=employee_id,
                embedding_role="mean",
                pose_label="aggregate",
                quality_score=None,
                image_path=None,
                embedding_json="[0.1, 0.2, 0.3]",
            )
        )
        db.session.commit()
        assert service.employee_has_registration(employee_id) is True


def test_delete_employee_faces_deletes_rows_files_and_index(app):
    employee_id = _create_employee(app)
    face_index_service = FakeFaceIndexService()
    service = _make_service(app, face_index_service)

    with app.app_context():
        sample_path = Path(app.config["FACES_DIR"] / f"employee-{employee_id}" / "sample-1.jpg")
        sample_path.parent.mkdir(parents=True, exist_ok=True)
        sample_path.write_bytes(b"sample")

        embedding_path = Path(app.config["FACES_DIR"] / f"employee-{employee_id}" / "embedding.jpg")
        embedding_path.write_bytes(b"embedding")

        db.session.add(
            FaceSample(
                employee_id=employee_id,
                sample_index=1,
                image_path=str(sample_path),
                embedding_json="[0.1, 0.2, 0.3]",
            )
        )
        db.session.add(
            FaceEmbedding(
                employee_id=employee_id,
                embedding_role="representative",
                pose_label="front",
                quality_score=0.9,
                image_path=str(embedding_path),
                embedding_json="[0.1, 0.2, 0.3]",
            )
        )
        db.session.commit()

        result = service.delete_employee_faces(employee_id)

        assert result.deleted_sample_count == 1
        assert FaceSample.query.filter_by(employee_id=employee_id).count() == 0
        assert FaceEmbedding.query.filter_by(employee_id=employee_id).count() == 0
        assert sample_path.exists() is False
        assert embedding_path.exists() is False
        assert face_index_service.deleted_employee_ids == [employee_id]


def test_resolve_sample_image_path_allows_only_files_inside_faces_dir(app):
    service = _make_service(app)

    inside_path = Path(app.config["FACES_DIR"] / "employee-1" / "sample-1.jpg")
    inside_path.parent.mkdir(parents=True, exist_ok=True)
    inside_path.write_bytes(b"inside")

    outside_path = Path(app.config["APP_DB_PATH"]).parent / "outside.jpg"
    outside_path.write_bytes(b"outside")

    assert service.resolve_sample_image_path(str(inside_path)) == inside_path.resolve()
    assert service.resolve_sample_image_path(str(outside_path)) is None
    assert service.resolve_sample_image_path("../outside.jpg") is None
    assert service.resolve_sample_image_path("") is None
