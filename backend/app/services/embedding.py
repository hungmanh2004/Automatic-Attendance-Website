# ============================================================
# embedding.py - Trích xuất vector khuôn mặt (Face Embedding)
# ============================================================
# Pipeline mới (YOLOv12-first):
#   1. YOLO detect → tìm khuôn mặt + keypoints
#   2. align_face() → xoay thẳng dựa trên vị trí 2 mắt
#   3. DeepFace.represent(detector_backend="skip") → sinh vector
#
# Pipeline cũ (đã thay thế):
#   DeepFace.represent(enforce_detection=False) → tự detect + embed
#   Vấn đề: dùng OpenCV Haar Cascade → kém chính xác
# ============================================================

import logging
from pathlib import Path

import cv2
import numpy as np

from .face_alignment import align_face

logger = logging.getLogger(__name__)

# Đường dẫn mặc định tới file model YOLO nằm cùng thư mục services/
_DEFAULT_MODEL_PATH = Path(__file__).parent / "yolov12n-face.pt"


class EmbeddingService:
    """Trích xuất face embeddings bằng YOLO (detect) + ArcFace (embed).

    Model YOLO được nạp một lần duy nhất khi lần đầu gọi
    ``extract_embeddings`` (lazy-load) để tránh làm chậm quá trình
    khởi tạo Flask app.
    """

    def __init__(self, model_path=None, yolo_confidence=0.5):
        self._model_path = str(model_path or _DEFAULT_MODEL_PATH)
        self._yolo_confidence = yolo_confidence
        self._yolo_model = None  # Lazy-loaded
        self._deepface_class = None  # Lazy-loaded

    # ------------------------------------------------------------------
    # Lazy-load model YOLO
    # ------------------------------------------------------------------
    def _get_yolo_model(self):
        if self._yolo_model is None:
            from ultralytics import YOLO

            logger.info("Loading YOLO face model from %s ...", self._model_path)
            self._yolo_model = YOLO(self._model_path)
            logger.info("YOLO face model loaded successfully.")
        return self._yolo_model

    def _get_deepface_class(self):
        if self._deepface_class is None:
            from deepface import DeepFace

            self._deepface_class = DeepFace
        return self._deepface_class

    # ------------------------------------------------------------------
    # Public API – giữ nguyên signature cũ để không phá code gọi bên ngoài
    # ------------------------------------------------------------------
    def extract_embeddings(self, frame_bytes):
        """Nhận raw bytes ảnh, trả về list các embedding vectors.

        Returns:
            list[list[float]]: Mỗi phần tử là 1 embedding 512-d của ArcFace.
            Danh sách rỗng nếu không tìm thấy khuôn mặt.
        """
        # Bước 0: Decode raw bytes → numpy BGR image
        arr = np.frombuffer(frame_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return []

        # Bước 1: YOLO detect khuôn mặt
        model = self._get_yolo_model()
        results = model.predict(img, conf=self._yolo_confidence, verbose=False)

        if not results or len(results[0].boxes) == 0:
            return []

        detections = results[0]
        boxes = detections.boxes
        # Keypoints có thể None nếu model không hỗ trợ (fallback an toàn)
        keypoints_data = detections.keypoints

        embeddings = []
        for idx in range(len(boxes)):
            # Lấy bounding box (xyxy format, convert sang int)
            box = boxes.xyxy[idx].cpu().numpy().astype(int)
            x1, y1, x2, y2 = box

            # Lấy keypoints cho khuôn mặt này (nếu có)
            kps = None
            if keypoints_data is not None and keypoints_data.xy is not None:
                kps_xy = keypoints_data.xy[idx].cpu().numpy().astype(int)
                if len(kps_xy) >= 2:
                    kps = kps_xy

            # Bước 2: Căn chỉnh khuôn mặt (xoay thẳng)
            aligned_face = align_face(img, kps, (x1, y1, x2, y2))

            if aligned_face is None or aligned_face.size == 0:
                continue

            # Bước 3: DeepFace extract embedding (skip detection vì YOLO đã làm)
            try:
                face_results = self._get_deepface_class().represent(
                    img_path=aligned_face,
                    model_name="ArcFace",
                    enforce_detection=False,
                    detector_backend="skip",
                    align=False,
                )
                if face_results:
                    embeddings.append(list(face_results[0]["embedding"]))
            except Exception:
                logger.warning("DeepFace failed on face #%d, skipping.", idx, exc_info=True)
                continue

        return embeddings
