from flask import url_for
from pathlib import Path


class RecognitionService:
    def __init__(self, storage_service, embedding_service, face_index_service, attendance_service):
        self.storage_service = storage_service
        self.embedding_service = embedding_service
        self.face_index_service = face_index_service
        self.attendance_service = attendance_service

    def _build_response(self, event, match, created):
        """Shared response builder used by both process_guest_image and process_crop_image."""
        return {
            "status": "recognized" if created else "already_checked_in",
            "employee_id": match["employee_id"],
            "employee_code": match["employee_code"],
            "full_name": match["full_name"],
            "distance": match["distance"],
            "checked_in_at": event.checked_in_at.isoformat(),
            "snapshot_path": event.snapshot_path,  # keep for backward compat
            "snapshot_url": url_for("manager.manager_attendance_snapshot", attendance_id=event.id),
        }

    def process_guest_image(self, frame_bytes, filename=None, content_type=None):
        embeddings = self.embedding_service.extract_embeddings(frame_bytes)

        if not embeddings:
            return {"status": "no_face"}

        if len(embeddings) > 1:
            return {"status": "multiple_faces", "faces_detected": len(embeddings)}

        match = self.face_index_service.find_match(embeddings[0])
        if match is None:
            return {"status": "unknown"}

        snapshot_path = self.storage_service.save_guest_frame(frame_bytes, filename=filename)
        event, created = self.attendance_service.record_checkin(
            employee_id=match["employee_id"],
            snapshot_path=snapshot_path,
            distance=match["distance"],
        )
        if not created:
            _cleanup_orphan_snapshot(snapshot_path, event.snapshot_path)

        return self._build_response(event, match, created)

    def process_crop_image(self, crop_bytes, keypoints_list, filename=None):
        """Luồng mới: Frontend YOLO ONNX đã crop + trích keypoints.

        Backend chỉ cần align + embed + KNN + ghi điểm danh.
        """
        import time
        t0 = time.perf_counter()
        embedding = self.embedding_service.extract_embeddings_from_crop(
            crop_bytes, keypoints_list
        )
        t1 = time.perf_counter()
        import logging
        logging.getLogger(__name__).info(
            "[TIMING] extract_embeddings: %.1fms", (t1 - t0) * 1000
        )

        if embedding is None:
            return {"status": "no_face"}

        t2 = time.perf_counter()
        match = self.face_index_service.find_match(embedding)
        t3 = time.perf_counter()
        logging.getLogger(__name__).info(
            "[TIMING] find_match (Redis KNN): %.1fms", (t3 - t2) * 1000
        )
        if match is None:
            return {"status": "unknown"}

        existing_event = self.attendance_service.get_today_event(match["employee_id"])
        if existing_event is not None:
            return self._build_response(existing_event, match, created=False)

        snapshot_path = self.storage_service.save_guest_frame(
            crop_bytes, filename=filename
        )
        t4 = time.perf_counter()
        event, created = self.attendance_service.record_checkin(
            employee_id=match["employee_id"],
            snapshot_path=snapshot_path,
            distance=match["distance"],
            skip_existing_lookup=True,
        )
        t5 = time.perf_counter()
        logging.getLogger(__name__).info(
            "[TIMING] DB write (attendance): %.1fms | GRAND TOTAL: %.1fms",
            (t5 - t4) * 1000, (t5 - t0) * 1000
        )
        if not created:
            _cleanup_orphan_snapshot(snapshot_path, event.snapshot_path)

        return self._build_response(event, match, created)


def _cleanup_orphan_snapshot(snapshot_path, persisted_snapshot_path):
    snapshot_path = Path(snapshot_path)
    persisted_snapshot_path = Path(persisted_snapshot_path)
    if snapshot_path == persisted_snapshot_path:
        return

    snapshot_path.unlink(missing_ok=True)
