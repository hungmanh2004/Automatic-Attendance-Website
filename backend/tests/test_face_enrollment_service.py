from io import BytesIO
from pathlib import Path

from werkzeug.datastructures import FileStorage

from backend.app.extensions import db
from backend.app.models import Employee, FaceEmbedding, FaceSample
from backend.app.services.face_enrollment import FaceEnrollmentService
from backend.tests.test_manager_api import _create_employee


def _make_upload(content: bytes, filename: str) -> FileStorage:
    return FileStorage(stream=BytesIO(content), filename=filename)


def _make_batch_uploads(frame_count=20):
    return [_make_upload(f"frame-{index}".encode(), f"frame-{index}.jpg") for index in range(frame_count)]


def _make_batch_metadata(frame_count=20):
    poses = ["front", "left", "right", "up", "down"]
    frames = [{"index": index, "hint_pose": poses[index % len(poses)]} for index in range(frame_count)]
    return {"frames": frames}


def _make_service(app, embedding_service, face_index_service):
    return FaceEnrollmentService(
        db=db,
        storage_service=app.extensions["storage_service"],
        embedding_service=embedding_service,
        face_index_service=face_index_service,
        face_sample_service=app.extensions["face_sample_service"],
    )


def test_build_capture_config_returns_batch_capture_defaults(app):
    service = _make_service(app, embedding_service=None, face_index_service=None)

    assert service.build_capture_config(
        min_frames=8,
        max_frames=12,
        min_capture_gap_ms=300,
    ) == {
        "min_frames": 8,
        "max_frames": 12,
        "thumbnail_limit": 10,
        "min_capture_gap_ms": 300,
    }


def test_enroll_static_persists_samples_and_upserts_index(app):
    employee_data = _create_employee(app, employee_code="EMP-501", full_name="Static Facade")
    upsert_calls = []

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            sample_number = int(frame_bytes.decode().split("-")[-1])
            return [[sample_number / 10, 0.2, 0.3]]

    class FakeFaceIndexService:
        def upsert(self, **kwargs):
            upsert_calls.append(kwargs)

    service = _make_service(app, FakeEmbeddingService(), FakeFaceIndexService())

    employee = db.session.get(Employee, employee_data["id"])
    with app.test_request_context():
        result = service.enroll_static(
            employee,
            [_make_upload(f"face-{index}".encode(), f"{index}.jpg") for index in range(1, 6)],
            expected_sample_count=5,
        )

    assert result.ok is True
    assert result.status == "enrolled"
    assert result.http_status == 201
    assert result.payload["employee"]["employee_code"] == "EMP-501"
    assert result.payload["face_sample_count"] == 5
    assert [sample["sample_index"] for sample in result.payload["face_samples"]] == [1, 2, 3, 4, 5]
    assert [call["sample_index"] for call in upsert_calls] == [1, 2, 3, 4, 5]
    assert {call["employee_id"] for call in upsert_calls} == {employee_data["id"]}

    rows = FaceSample.query.filter_by(employee_id=employee_data["id"]).order_by(FaceSample.sample_index.asc()).all()
    assert len(rows) == 5
    assert [row.sample_index for row in rows] == [1, 2, 3, 4, 5]
    for row in rows:
        assert Path(row.image_path).exists()


def test_enroll_static_cleans_partial_files_and_rows_when_face_missing(app):
    employee_data = _create_employee(app, employee_code="EMP-502", full_name="Static No Face")

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            return [] if frame_bytes == b"face-3" else [[0.1, 0.2, 0.3]]

    class FakeFaceIndexService:
        def upsert(self, **kwargs):
            raise AssertionError("index should not be updated on enrollment failure")

    service = _make_service(app, FakeEmbeddingService(), FakeFaceIndexService())

    employee = db.session.get(Employee, employee_data["id"])
    result = service.enroll_static(
        employee,
        [_make_upload(f"face-{index}".encode(), f"{index}.jpg") for index in range(1, 6)],
        expected_sample_count=5,
    )

    assert result.ok is False
    assert result.status == "no_face"
    assert result.http_status == 400
    assert result.payload == {"status": "no_face", "image_index": 3}
    assert FaceSample.query.filter_by(employee_id=employee_data["id"]).count() == 0
    assert list(Path(app.config["FACES_DIR"]).rglob("*")) == []


def test_enroll_batch_persists_preview_samples_embeddings_and_refreshes_index(app):
    employee_data = _create_employee(app, employee_code="EMP-503", full_name="Batch Facade")
    refresh_calls = {"count": 0}

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            suffix = int(frame_bytes.decode().split("-")[-1])
            return [[0.11 + (suffix * 0.01), 0.2 + (suffix % 3) * 0.01, 0.3]]

    class FakeFaceIndexService:
        def refresh(self):
            refresh_calls["count"] += 1

    service = _make_service(app, FakeEmbeddingService(), FakeFaceIndexService())

    employee = db.session.get(Employee, employee_data["id"])
    with app.test_request_context():
        result = service.enroll_batch(
            employee,
            _make_batch_uploads(frame_count=20),
            metadata=_make_batch_metadata(frame_count=20),
            min_frames=20,
            max_frames=30,
        )

    assert result.ok is True
    assert result.status == "enrolled_from_batch"
    assert result.http_status == 201
    assert result.payload["employee"]["employee_code"] == "EMP-503"
    assert result.payload["face_sample_count"] == 5
    assert result.payload["valid_frame_count"] == 10
    assert result.payload["selected_frame_count"] == 10
    assert result.payload["saved_embedding_count"] == 11
    assert result.payload["representative_embedding_count"] == 10
    assert [sample["sample_index"] for sample in result.payload["face_samples"]] == [1, 2, 3, 4, 5]
    assert [sample["pose_label"] for sample in result.payload["face_samples"]] == ["front", "left", "right", "up", "down"]
    assert refresh_calls["count"] == 1

    sample_rows = FaceSample.query.filter_by(employee_id=employee_data["id"]).order_by(FaceSample.sample_index.asc()).all()
    embedding_rows = FaceEmbedding.query.filter_by(employee_id=employee_data["id"]).order_by(FaceEmbedding.id.asc()).all()
    assert len(sample_rows) == 5
    assert len(embedding_rows) == 11
    assert embedding_rows[0].embedding_role == "mean"
    assert sum(1 for row in embedding_rows if row.embedding_role == "representative") == 10
    for row in sample_rows:
        assert Path(row.image_path).exists()


def test_replace_sample_updates_existing_slot_removes_old_file_and_upserts_index(app):
    employee_data = _create_employee(app, employee_code="EMP-504", full_name="Replace Facade")
    old_image_path = Path(app.config["FACES_DIR"]) / f"employee-{employee_data['id']}" / "sample-3.jpg"
    old_image_path.parent.mkdir(parents=True, exist_ok=True)
    old_image_path.write_bytes(b"old-face")

    db.session.add(
        FaceSample(
            employee_id=employee_data["id"],
            sample_index=3,
            image_path=str(old_image_path),
            embedding_json="[0.1, 0.2, 0.3]",
        )
    )
    db.session.commit()

    upsert_calls = []

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            assert frame_bytes == b"replacement-face"
            return [[0.9, 0.2, 0.3]]

    class FakeFaceIndexService:
        def upsert(self, **kwargs):
            upsert_calls.append(kwargs)

    service = _make_service(app, FakeEmbeddingService(), FakeFaceIndexService())

    employee = db.session.get(Employee, employee_data["id"])
    with app.test_request_context():
        result = service.replace_sample(
            employee,
            3,
            _make_upload(b"replacement-face", "3.png"),
        )

    assert result.ok is True
    assert result.status == "updated"
    assert result.http_status == 200
    assert result.payload["status"] == "updated"
    assert result.payload["face_sample"]["sample_index"] == 3
    assert result.payload["face_sample"]["employee_id"] == employee_data["id"]
    assert old_image_path.exists() is False
    assert upsert_calls == [
        {
            "employee_id": employee_data["id"],
            "sample_index": 3,
            "employee_code": "EMP-504",
            "full_name": "Replace Facade",
            "embedding": [0.9, 0.2, 0.3],
        }
    ]

    sample = FaceSample.query.filter_by(employee_id=employee_data["id"], sample_index=3).one()
    assert Path(sample.image_path).read_bytes() == b"replacement-face"
    assert sample.embedding_json == "[0.9, 0.2, 0.3]"


def test_delete_all_faces_removes_samples_files_embeddings_and_index(app):
    employee_data = _create_employee(app, employee_code="EMP-505", full_name="Delete Faces Facade")
    deleted_employee_ids = []

    class FakeFaceIndexService:
        def delete_employee(self, employee_id):
            deleted_employee_ids.append(employee_id)

    fake_index_service = FakeFaceIndexService()
    app.extensions["face_sample_service"].face_index_service = fake_index_service

    sample_paths = []
    for sample_index in range(1, 3):
        image_path = Path(app.config["FACES_DIR"]) / f"employee-{employee_data['id']}" / f"sample-{sample_index}.jpg"
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(f"sample-{sample_index}".encode())
        sample_paths.append(image_path)
        db.session.add(
            FaceSample(
                employee_id=employee_data["id"],
                sample_index=sample_index,
                image_path=str(image_path),
                embedding_json="[0.1, 0.2, 0.3]",
            )
        )

    embedding_path = Path(app.config["FACES_DIR"]) / f"employee-{employee_data['id']}" / "representative.jpg"
    embedding_path.write_bytes(b"representative")
    db.session.add(
        FaceEmbedding(
            employee_id=employee_data["id"],
            embedding_role="representative",
            pose_label="front",
            quality_score=0.9,
            image_path=str(embedding_path),
            embedding_json="[0.1, 0.2, 0.3]",
        )
    )
    db.session.commit()

    service = _make_service(app, embedding_service=None, face_index_service=fake_index_service)

    employee = db.session.get(Employee, employee_data["id"])
    result = service.delete_all_faces(employee)

    assert result.ok is True
    assert result.status == "deleted"
    assert result.http_status == 200
    assert result.payload == {"employee_id": employee_data["id"], "deleted_count": 2}
    assert deleted_employee_ids == [employee_data["id"]]
    assert FaceSample.query.filter_by(employee_id=employee_data["id"]).count() == 0
    assert FaceEmbedding.query.filter_by(employee_id=employee_data["id"]).count() == 0
    assert all(path.exists() is False for path in sample_paths)
    assert embedding_path.exists() is False
