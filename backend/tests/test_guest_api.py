import importlib
import sys
import types
from datetime import datetime
from io import BytesIO

from sqlalchemy.exc import IntegrityError


def test_guest_checkin_requires_frame_file(client):
    response = client.post("/api/guest/checkin", data={}, content_type="multipart/form-data")

    assert response.status_code == 400
    assert response.get_json()["status"] == "invalid_request"


def test_guest_checkin_returns_payload_from_recognition_service(app, client):
    expected_payload = {
        "status": "recognized",
        "employee_id": 7,
        "employee_code": "EMP-007",
        "full_name": "Ada Lovelace",
    }

    class FakeRecognitionService:
        def __init__(self):
            self.calls = []

        def process_guest_image(self, frame_bytes, filename=None, content_type=None):
            self.calls.append(
                {
                    "frame_bytes": frame_bytes,
                    "filename": filename,
                    "content_type": content_type,
                }
            )
            return expected_payload

    fake_service = FakeRecognitionService()
    app.extensions["recognition_service"] = fake_service

    response = client.post(
        "/api/guest/checkin",
        data={"frame": (BytesIO(b"frame-bytes"), "guest.jpg")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert response.get_json() == expected_payload
    assert fake_service.calls == [
        {
            "frame_bytes": b"frame-bytes",
            "filename": "guest.jpg",
            "content_type": "image/jpeg",
        }
    ]


def test_guest_crop_task_decodes_payload_and_calls_recognition_service(app):
    import base64

    calls = []

    class FakeRecognitionService:
        def process_crop_image(self, crop_bytes, keypoints_list, filename=None):
            calls.append(
                {
                    "crop_bytes": crop_bytes,
                    "keypoints_list": keypoints_list,
                    "filename": filename,
                }
            )
            return {"status": "recognized", "employee_id": 7}

    app.extensions["recognition_service"] = FakeRecognitionService()
    celery_app = app.extensions["celery"]

    result = celery_app.tasks["guest.process_crop_checkin"].apply(
        kwargs={
            "crop_b64": base64.b64encode(b"crop-bytes").decode("ascii"),
            "keypoints_list": [1, 2, 3, 4],
            "filename": "face-crop.jpg",
        }
    )

    assert result.get() == {"status": "recognized", "employee_id": 7}
    assert calls == [
        {
            "crop_bytes": b"crop-bytes",
            "keypoints_list": [1, 2, 3, 4],
            "filename": "face-crop.jpg",
        }
    ]


def test_guest_crop_task_rejects_invalid_base64(app):
    celery_app = app.extensions["celery"]

    result = celery_app.tasks["guest.process_crop_checkin"].apply(
        kwargs={
            "crop_b64": "not-base64",
            "keypoints_list": None,
            "filename": "face-crop.jpg",
        }
    )

    assert result.get() == {
        "status": "invalid_request",
        "message": "invalid crop payload",
    }


def test_embedding_service_defers_insightface_import_until_extraction(monkeypatch):
    module_name = "backend.app.services.embedding"
    sys.modules.pop(module_name, None)

    attempted_imports = []
    original_import = __import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "insightface" or name.startswith("insightface."):
            attempted_imports.append((name, tuple(fromlist or ())))
            raise AssertionError("insightface should be imported lazily")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", guarded_import)

    importlib.import_module(module_name)

    assert attempted_imports == []


def test_embedding_service_uses_yolo_and_insightface(monkeypatch, tmp_path):
    """Verify the YOLO → align_face → InsightFace pipeline.

    We fake both the YOLO model output and InsightFace app so the test
    runs instantly without real model weights or a real face image.
    """
    import cv2
    import numpy as np

    captured = {}

    class FakeInsightFaceRecognizer:
        def get_feat(self, img):
            captured["img_type"] = type(img).__name__
            captured["img_shape"] = img.shape
            return np.array([0.1, 0.2, 0.3], dtype=np.float32)

    # -- Fake YOLO model that returns one detection with box + keypoints --
    class FakeBoxes:
        def __init__(self, img_h, img_w):
            import torch
            self.xyxy = torch.tensor([[5, 5, img_w - 5, img_h - 5]])
            self.conf = torch.tensor([0.95])

        def __len__(self):
            return 1

    class FakeKeypoints:
        def __init__(self, img_h, img_w):
            import torch
            # 5 keypoints: left_eye, right_eye, nose, left_mouth, right_mouth
            self.xy = torch.tensor([[[15, 15], [img_w - 15, 15], [img_w // 2, img_h // 2],
                                     [15, img_h - 10], [img_w - 15, img_h - 10]]], dtype=torch.float32)
            self.conf = torch.tensor([[0.9, 0.9, 0.9, 0.9, 0.9]], dtype=torch.float32)

    class FakeDetectionResult:
        def __init__(self, img_h, img_w):
            self.boxes = FakeBoxes(img_h, img_w)
            self.keypoints = FakeKeypoints(img_h, img_w)

    class FakeYOLO:
        def __init__(self, *args, **kwargs):
            pass

        def predict(self, img, conf=0.5, verbose=False):
            h, w = img.shape[:2]
            return [FakeDetectionResult(h, w)]

    # Create a valid image large enough to pass face-quality filtering.
    test_img = np.random.randint(0, 255, (160, 160, 3), dtype=np.uint8)
    _, jpeg_bytes = cv2.imencode(".jpg", test_img)
    frame_bytes = jpeg_bytes.tobytes()

    from backend.app.services import embedding as embedding_mod

    service = embedding_mod.EmbeddingService()
    # Inject fake YOLO model directly (skip lazy-load)
    service._yolo_model = FakeYOLO()
    service._insightface_recognizer = FakeInsightFaceRecognizer()

    embeddings = service.extract_embeddings(frame_bytes)

    assert np.allclose(embeddings, [[0.1, 0.2, 0.3]])
    assert captured["img_type"] == "ndarray"
    assert captured["img_shape"] == (112, 112, 3)


def test_storage_service_saves_guest_frame_under_dated_subdirectory(tmp_path, monkeypatch):
    from backend.app.services import storage as storage_module

    class FixedDateTime:
        @classmethod
        def now(cls):
            return datetime(2026, 4, 2, 9, 30, 0)

    monkeypatch.setattr(storage_module, "datetime", FixedDateTime)
    service = storage_module.StorageService(tmp_path)

    snapshot_path = service.save_guest_frame(b"frame-bytes", filename="guest.JPG")

    assert snapshot_path.parent == tmp_path / "2026-04-02"
    assert snapshot_path.suffix == ".jpg"
    assert snapshot_path.read_bytes() == b"frame-bytes"


def test_face_index_service_delegates_match_to_store_with_threshold():
    from backend.app.services.face_index import FaceIndexService

    class FakeStore:
        def __init__(self):
            self.calls = []

        def find_best_match(self, embedding, threshold):
            self.calls.append((embedding, threshold))
            return {"employee_id": 7, "distance": 0.0}

    service = FaceIndexService(threshold=0.42)
    fake_store = FakeStore()
    service._store = fake_store

    match = service.find_match([1.0, 0.0])

    assert match is not None
    assert match["employee_id"] == 7
    assert fake_store.calls == [([1.0, 0.0], 0.42)]


def test_face_index_service_accepts_vector_store_adapter():
    from backend.app.services.face_index import FaceIndexService

    class FakeStore:
        def __init__(self):
            self.setup_calls = 0

        def setup_index(self):
            self.setup_calls += 1

    fake_store = FakeStore()

    service = FaceIndexService(fake_store, threshold=0.31)
    service.setup()

    assert service.threshold == 0.31
    assert service._store is fake_store
    assert fake_store.setup_calls == 1


def test_face_index_service_refresh_rebuilds_store_from_database(app, fake_redis):
    from backend.app.extensions import db
    from backend.app.models import Employee, FaceSample
    from backend.app.services.face_index import FaceIndexService

    scan_calls = []

    def forbidden_keys(pattern):
        raise AssertionError("refresh should use scan_iter instead of keys")

    def scan_iter(*, match=None, count=100):
        scan_calls.append({"match": match, "count": count})
        return iter(["face:stale"])

    fake_redis.keys = forbidden_keys
    fake_redis.scan_iter = scan_iter

    class FakeStore:
        def __init__(self):
            self.upserts = []

        def upsert_face_sample(self, employee_id, sample_index, employee_code, full_name, embedding):
            self.upserts.append(
                {
                    "employee_id": employee_id,
                    "sample_index": sample_index,
                    "employee_code": employee_code,
                    "full_name": full_name,
                    "embedding": embedding,
                }
            )

    service = FaceIndexService(threshold=0.42)
    fake_store = FakeStore()
    service._store = fake_store

    with app.app_context():
        employee = Employee(employee_code="EMP-007", full_name="Ada Lovelace")
        db.session.add(employee)
        db.session.flush()
        db.session.add(
            FaceSample(
                employee_id=employee.id,
                sample_index=1,
                image_path="sample.jpg",
                embedding_json="[1.0, 0.0]",
            )
        )
        db.session.commit()

        service.refresh()

    assert scan_calls == [{"match": "face:*", "count": 500}]
    assert fake_store.upserts == [
        {
            "employee_id": employee.id,
            "sample_index": 1,
            "employee_code": "EMP-007",
            "full_name": "Ada Lovelace",
            "embedding": [1.0, 0.0],
        }
    ]


def test_recognition_service_returns_no_face_when_embedding_list_is_empty():
    from backend.app.services.recognition import RecognitionService

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            return []

    class UnexpectedCall:
        def __getattr__(self, name):
            raise AssertionError(f"unexpected call: {name}")

    service = RecognitionService(
        storage_service=UnexpectedCall(),
        embedding_service=FakeEmbeddingService(),
        face_index_service=UnexpectedCall(),
        attendance_service=UnexpectedCall(),
    )

    payload = service.process_guest_image(b"frame-bytes", filename="guest.jpg")

    assert payload == {"status": "no_face"}


def test_recognition_service_returns_multiple_faces_when_more_than_one_embedding():
    from backend.app.services.recognition import RecognitionService

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            return [[0.1, 0.2], [0.3, 0.4]]

    class UnexpectedCall:
        def __getattr__(self, name):
            raise AssertionError(f"unexpected call: {name}")

    service = RecognitionService(
        storage_service=UnexpectedCall(),
        embedding_service=FakeEmbeddingService(),
        face_index_service=UnexpectedCall(),
        attendance_service=UnexpectedCall(),
    )

    payload = service.process_guest_image(b"frame-bytes", filename="guest.jpg")

    assert payload == {"status": "multiple_faces", "faces_detected": 2}


def test_recognition_service_cleans_orphan_snapshot_and_reuses_existing_event_metadata(tmp_path, monkeypatch):
    from backend.app.services.recognition import RecognitionService

    existing_snapshot_path = tmp_path / "persisted.jpg"
    existing_snapshot_path.write_bytes(b"persisted")
    orphan_snapshot_path = tmp_path / "orphan.jpg"
    existing_event = types.SimpleNamespace(
        id=42,
        checked_in_at=datetime(2026, 4, 2, 9, 15, 0),
        snapshot_path=str(existing_snapshot_path),
    )

    class FakeStorageService:
        def save_guest_frame(self, frame_bytes, filename=None):
            orphan_snapshot_path.write_bytes(frame_bytes)
            return orphan_snapshot_path

    class FakeEmbeddingService:
        def extract_embeddings(self, frame_bytes):
            return [[0.1, 0.2, 0.3]]

    class FakeFaceIndexService:
        def find_match(self, embedding):
            return {
                "employee_id": 7,
                "employee_code": "EMP-007",
                "full_name": "Ada Lovelace",
                "distance": 0.12,
            }

    class FakeAttendanceService:
        def record_checkin(self, employee_id, snapshot_path, distance=None, checked_in_at=None):
            return existing_event, False

    def fake_url_for(endpoint, **values):
        if endpoint == "manager.manager_attendance_snapshot":
            return f"/api/manager/attendance/{values['attendance_id']}/snapshot"
        raise AssertionError(f"unexpected endpoint: {endpoint}")

    monkeypatch.setattr("backend.app.services.recognition.url_for", fake_url_for)

    service = RecognitionService(
        storage_service=FakeStorageService(),
        embedding_service=FakeEmbeddingService(),
        face_index_service=FakeFaceIndexService(),
        attendance_service=FakeAttendanceService(),
    )

    payload = service.process_guest_image(b"new-frame", filename="guest.jpg")

    assert payload["status"] == "already_checked_in"
    assert payload["snapshot_path"] == str(existing_snapshot_path)
    assert payload["snapshot_url"] == "/api/manager/attendance/42/snapshot"
    assert payload["checked_in_at"] == existing_event.checked_in_at.isoformat()
    assert orphan_snapshot_path.exists() is False


def test_attendance_service_returns_existing_event_after_integrity_error(monkeypatch):
    from backend.app.services import attendance as attendance_module

    class FixedDateTime:
        @classmethod
        def now(cls):
            return datetime(2026, 4, 2, 10, 0, 0)

    existing_event = types.SimpleNamespace(
        employee_id=7,
        checkin_date="2026-04-02",
        checked_in_at=datetime(2026, 4, 2, 9, 5, 0),
        snapshot_path="persisted.jpg",
    )
    rollback_state = {"called": False}
    added_events = []
    find_calls = []

    def fake_find_existing_event(employee_id, checkin_date):
        find_calls.append((employee_id, checkin_date))
        if len(find_calls) == 1:
            return None
        return existing_event

    monkeypatch.setattr(attendance_module, "datetime", FixedDateTime)
    monkeypatch.setattr(attendance_module, "_find_existing_event", fake_find_existing_event)
    monkeypatch.setattr(attendance_module.db.session, "add", lambda event: added_events.append(event))
    monkeypatch.setattr(
        attendance_module.db.session,
        "commit",
        lambda: (_ for _ in ()).throw(IntegrityError("insert", {}, Exception("duplicate"))),
    )
    monkeypatch.setattr(
        attendance_module.db.session,
        "rollback",
        lambda: rollback_state.__setitem__("called", True),
    )

    event, created = attendance_module.AttendanceService().record_checkin(
        employee_id=7,
        snapshot_path="new.jpg",
        distance=0.12,
    )

    assert created is False
    assert event is existing_event
    assert rollback_state["called"] is True
    assert added_events[0].checkin_date == "2026-04-02"
    assert find_calls == [
        (7, "2026-04-02"),
        (7, "2026-04-02"),
    ]


def test_recognition_service_build_response_includes_snapshot_url(monkeypatch):
    """Checkin response should include snapshot_url for image retrieval."""
    from datetime import datetime
    from backend.app.services.recognition import RecognitionService

    event = types.SimpleNamespace(
        id=42,
        checked_in_at=datetime(2026, 4, 20, 8, 30, 0),
        snapshot_path="data/checkins/2026-04-20/snapshot.jpg",
    )
    match = {
        "employee_id": 7,
        "employee_code": "EMP-007",
        "full_name": "Ada Lovelace",
        "distance": 0.12,
    }

    class FakeServices:
        pass

    def fake_url_for(endpoint, **values):
        if endpoint == "manager.manager_attendance_snapshot":
            return f"/api/manager/attendance/{values['attendance_id']}/snapshot"
        raise AssertionError(f"unexpected endpoint: {endpoint}")

    monkeypatch.setattr("backend.app.services.recognition.url_for", fake_url_for)

    service = RecognitionService(
        storage_service=FakeServices(),
        embedding_service=FakeServices(),
        face_index_service=FakeServices(),
        attendance_service=FakeServices(),
    )

    result = service._build_response(event, match, created=True)

    assert result["status"] == "recognized"
    assert "snapshot_url" in result
    assert result["snapshot_url"] == "/api/manager/attendance/42/snapshot"
    assert "snapshot_path" in result  # backward compat preserved
    assert result["snapshot_path"] == "data/checkins/2026-04-20/snapshot.jpg"
    assert result["employee_id"] == 7
    assert result["full_name"] == "Ada Lovelace"
