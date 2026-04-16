from pathlib import Path


class RecognitionService:
    def __init__(self, storage_service, embedding_service, face_index_service, attendance_service):
        self.storage_service = storage_service
        self.embedding_service = embedding_service
        self.face_index_service = face_index_service
        self.attendance_service = attendance_service

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

        return {
            "status": "recognized" if created else "already_checked_in",
            "employee_id": match["employee_id"],
            "employee_code": match["employee_code"],
            "full_name": match["full_name"],
            "distance": match["distance"],
            "checked_in_at": event.checked_in_at.isoformat(),
            "snapshot_path": event.snapshot_path,
        }

    def process_crop_image(self, crop_bytes, keypoints_list, filename=None):
        """Luồng mới: Frontend YOLO ONNX đã crop + trích keypoints.

        Backend chỉ cần align + embed + KNN + ghi điểm danh.
        """
        embedding = self.embedding_service.extract_embeddings_from_crop(
            crop_bytes, keypoints_list
        )

        if embedding is None:
            return {"status": "no_face"}

        match = self.face_index_service.find_match(embedding)
        if match is None:
            return {"status": "unknown"}

        snapshot_path = self.storage_service.save_guest_frame(
            crop_bytes, filename=filename
        )
        event, created = self.attendance_service.record_checkin(
            employee_id=match["employee_id"],
            snapshot_path=snapshot_path,
            distance=match["distance"],
        )
        if not created:
            _cleanup_orphan_snapshot(snapshot_path, event.snapshot_path)

        return {
            "status": "recognized" if created else "already_checked_in",
            "employee_id": match["employee_id"],
            "employee_code": match["employee_code"],
            "full_name": match["full_name"],
            "distance": match["distance"],
            "checked_in_at": event.checked_in_at.isoformat(),
            "snapshot_path": event.snapshot_path,
        }


def _cleanup_orphan_snapshot(snapshot_path, persisted_snapshot_path):
    snapshot_path = Path(snapshot_path)
    persisted_snapshot_path = Path(persisted_snapshot_path)
    if snapshot_path == persisted_snapshot_path:
        return

    snapshot_path.unlink(missing_ok=True)
