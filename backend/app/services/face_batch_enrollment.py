import json
import math
from dataclasses import dataclass


EXPECTED_POSES = ("front", "left", "right", "up", "down")


class FaceBatchEnrollmentError(Exception):
    def __init__(self, status, message, payload=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.payload = payload or {}


@dataclass
class CandidateFrame:
    frame_index: int
    filename: str
    frame_bytes: bytes
    embedding: list
    pose_label: str
    quality_score: float


class FaceBatchEnrollmentService:
    def __init__(self, embedding_service, min_frames=20, max_frames=30, representative_limit=10):
        self.embedding_service = embedding_service
        self.min_frames = min_frames
        self.max_frames = max_frames
        self.representative_limit = representative_limit

    def prepare_batch(self, frames, metadata=None):
        frame_list = list(frames)
        frame_count = len(frame_list)
        if frame_count < self.min_frames or frame_count > self.max_frames:
            raise FaceBatchEnrollmentError(
                "invalid_request",
                f"between {self.min_frames} and {self.max_frames} frames are required",
                {"min_frames": self.min_frames, "max_frames": self.max_frames, "frame_count": frame_count},
            )

        frame_hints = self._extract_frame_hints(metadata, frame_count)
        valid_frames = []
        rejected = []

        for zero_based_index, frame in enumerate(frame_list):
            filename = getattr(frame, "filename", None) or f"frame-{zero_based_index + 1}.jpg"
            frame_bytes = frame.read()
            if not frame_bytes:
                rejected.append({"frame_index": zero_based_index + 1, "reason": "empty_frame"})
                continue

            embeddings = self._extract_embeddings_from_candidate(frame_bytes)
            if len(embeddings) == 0:
                rejected.append({"frame_index": zero_based_index + 1, "reason": "no_face"})
                continue
            if len(embeddings) > 1:
                rejected.append({"frame_index": zero_based_index + 1, "reason": "multiple_faces"})
                continue

            candidate = CandidateFrame(
                frame_index=zero_based_index + 1,
                filename=filename,
                frame_bytes=frame_bytes,
                embedding=[float(value) for value in embeddings[0]],
                pose_label=frame_hints.get(zero_based_index, "unknown"),
                quality_score=self._score_frame(frame_bytes, frame_hints.get(zero_based_index, "unknown"), zero_based_index),
            )

            if self._is_duplicate(candidate, valid_frames):
                rejected.append({"frame_index": zero_based_index + 1, "reason": "duplicate"})
                continue

            valid_frames.append(candidate)

        if len(valid_frames) < 5:
            raise FaceBatchEnrollmentError(
                "insufficient_valid_frames",
                "Not enough valid face frames were extracted from the uploaded batch.",
                {"valid_frame_count": len(valid_frames), "rejected_frame_count": len(rejected)},
            )

        valid_frames.sort(key=lambda item: (-item.quality_score, item.frame_index))
        selected_frames = valid_frames[: min(20, len(valid_frames))]
        preview_frames = self._select_preview_frames(selected_frames)
        representative_frames = selected_frames[: min(self.representative_limit, len(selected_frames))]
        mean_embedding = self._mean_embedding([item.embedding for item in selected_frames])

        return {
            "valid_frames": valid_frames,
            "selected_frames": selected_frames,
            "preview_frames": preview_frames,
            "representative_frames": representative_frames,
            "mean_embedding": mean_embedding,
            "valid_frame_count": len(valid_frames),
            "rejected_frame_count": len(rejected),
            "selected_frame_count": len(selected_frames),
            "rejected_frames": rejected,
        }

    def _extract_embeddings_from_candidate(self, frame_bytes):
        # Frames in batch enrollment are already face crops from frontend.
        # Prefer crop-only embedding path to skip backend YOLO detection per frame.
        crop_extractor = getattr(self.embedding_service, "extract_embeddings_from_crop", None)
        if callable(crop_extractor):
            vector = crop_extractor(frame_bytes, None)
            if vector is None:
                return []
            return [vector]
        return self.embedding_service.extract_embeddings(frame_bytes)

    def _extract_frame_hints(self, metadata, frame_count):
        if metadata is None:
            return {}

        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError as error:
                raise FaceBatchEnrollmentError("invalid_request", "metadata must be valid JSON") from error

        frame_hints = {}
        for index, frame_meta in enumerate(metadata.get("frames", [])):
            if not isinstance(frame_meta, dict):
                continue

            raw_index = frame_meta.get("index", index)
            try:
                frame_index = int(raw_index)
            except (TypeError, ValueError):
                continue

            if frame_index < 0 or frame_index >= frame_count:
                continue

            hint_pose = str(frame_meta.get("hint_pose", "unknown")).strip().lower()
            frame_hints[frame_index] = hint_pose if hint_pose in EXPECTED_POSES else "unknown"

        return frame_hints

    def _score_frame(self, frame_bytes, pose_label, seed):
        try:
            import cv2
            import numpy as np

            arr = np.frombuffer(frame_bytes, dtype=np.uint8)
            image = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
            if image is None:
                raise ValueError("decode_failed")

            sharpness = min(cv2.Laplacian(image, cv2.CV_64F).var() / 240.0, 1.0)
            brightness = float(image.mean()) / 255.0
            brightness_balance = max(0.0, 1.0 - abs(brightness - 0.55) * 1.8)
            pose_bonus = 0.05 if pose_label in EXPECTED_POSES else 0.0
            score = 0.62 * sharpness + 0.33 * brightness_balance + pose_bonus
            return max(0.0, min(score, 1.0))
        except Exception:
            pose_bonus = 0.05 if pose_label in EXPECTED_POSES else 0.0
            return 0.55 + pose_bonus - (seed * 0.0001)

    def _is_duplicate(self, candidate, accepted_frames):
        for existing in accepted_frames:
            if existing.pose_label != candidate.pose_label:
                continue
            if self._cosine_distance(candidate.embedding, existing.embedding) < 0.02:
                return True
        return False

    def _select_preview_frames(self, selected_frames):
        preview_frames = []
        used_indices = set()

        for sample_index, pose_label in enumerate(EXPECTED_POSES, start=1):
            match = next(
                (item for item in selected_frames if item.pose_label == pose_label and item.frame_index not in used_indices),
                None,
            )
            if match is None:
                match = next((item for item in selected_frames if item.frame_index not in used_indices), None)
            if match is None:
                break
            used_indices.add(match.frame_index)
            preview_frames.append({
                "sample_index": sample_index,
                "pose_label": pose_label,
                "candidate": match,
            })

        if len(preview_frames) != 5:
            raise FaceBatchEnrollmentError(
                "insufficient_valid_frames",
                "Could not build the required 5 preview samples from the uploaded frames.",
                {"preview_count": len(preview_frames)},
            )

        return preview_frames

    def _mean_embedding(self, embeddings):
        if not embeddings:
            return []

        vector_length = len(embeddings[0])
        totals = [0.0] * vector_length
        for embedding in embeddings:
            for index, value in enumerate(embedding):
                totals[index] += float(value)

        count = float(len(embeddings))
        return [value / count for value in totals]

    def _cosine_distance(self, left, right):
        if len(left) != len(right):
            return math.inf

        left_norm = math.sqrt(sum(value * value for value in left))
        right_norm = math.sqrt(sum(value * value for value in right))
        if left_norm == 0 or right_norm == 0:
            return math.inf

        dot_product = sum(left_value * right_value for left_value, right_value in zip(left, right))
        cosine_similarity = dot_product / (left_norm * right_norm)
        return 1 - cosine_similarity
