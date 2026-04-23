# ============================================================
# embedding.py - Trích xuất vector khuôn mặt (Face Embedding)
# ============================================================
# Pipeline mới (YOLOv12-first):
#   1. YOLO detect → tìm khuôn mặt + keypoints
#   2. align_face() → xoay thẳng dựa trên vị trí 2 mắt
#   3. InsightFace get_feat() → sinh vector từ ảnh đã align
#
# Pipeline cũ (đã thay thế):
#   DeepFace.represent(enforce_detection=False) → tự detect + embed
#   Vấn đề: phụ thuộc TensorFlow stack, nặng khi triển khai
# ============================================================

import logging
import importlib
from pathlib import Path

import cv2
import numpy as np

from .face_alignment import align_face

logger = logging.getLogger(__name__)

# Đường dẫn mặc định tới file model YOLO nằm cùng thư mục services/
_DEFAULT_MODEL_PATH = Path(__file__).parent / "yolov12n-face.pt"


class EmbeddingService:
    """Trích xuất face embeddings bằng YOLO (detect) + InsightFace (embed).

    Model YOLO được nạp một lần duy nhất khi lần đầu gọi
    ``extract_embeddings`` (lazy-load) để tránh làm chậm quá trình
    khởi tạo Flask app.
    """

    def __init__(
        self,
        model_path=None,
        yolo_confidence=0.5,
        min_box_conf=0.25,
        min_head_kpts=2,
        kpt_conf=0.2,
        min_face_size=48,
        high_conf_box_without_kpts=0.65,
        insightface_rec_model_path=None,
        insightface_model_name="buffalo_l",
        insightface_det_size=(320, 320),
        insightface_providers=None,
    ):
        self._model_path = str(model_path or _DEFAULT_MODEL_PATH)
        self._yolo_confidence = yolo_confidence
        self._min_box_conf = float(min_box_conf)
        self._min_head_kpts = int(min_head_kpts)
        self._kpt_conf = float(kpt_conf)
        self._min_face_size = int(min_face_size)
        self._high_conf_box_without_kpts = float(high_conf_box_without_kpts)
        default_rec_model_path = Path.home() / ".insightface" / "models" / "buffalo_l" / "w600k_r50.onnx"
        self._insightface_rec_model_path = str(insightface_rec_model_path or default_rec_model_path)
        self._insightface_model_name = insightface_model_name
        self._insightface_det_size = tuple(insightface_det_size)
        self._insightface_providers = list(insightface_providers or ["CPUExecutionProvider"])
        self._yolo_model = None  # Lazy-loaded
        self._insightface_recognizer = None  # Lazy-loaded

    def _check_quality_image(self, detections, detection_index):
        boxes = detections.boxes
        keypoints = detections.keypoints

        if boxes is None or len(boxes) == 0:
            return False, "skip no bounding box"

        scores = boxes.conf.cpu().numpy() if boxes.conf is not None else None
        if scores is None or len(scores) == 0:
            return False, "skip empty box score"

        best_score = float(scores[detection_index])
        if best_score < self._min_box_conf:
            return False, f"skip low box score ({best_score:.3f})"

        box_xyxy = boxes.xyxy[detection_index].cpu().numpy().astype(int)
        x1, y1, x2, y2 = box_xyxy
        face_w = max(0, x2 - x1)
        face_h = max(0, y2 - y1)
        if min(face_w, face_h) < self._min_face_size:
            return False, f"skip tiny face ({face_w}x{face_h})"

        if keypoints is None or keypoints.xy is None:
            if best_score >= self._high_conf_box_without_kpts:
                return True, f"ok no keypoints but high box score ({best_score:.3f})"
            return False, "skip no keypoints"

        keypoints_xy = keypoints.xy.cpu().numpy()
        if detection_index >= len(keypoints_xy):
            if best_score >= self._high_conf_box_without_kpts:
                return True, f"ok invalid keypoint index but high box score ({best_score:.3f})"
            return False, "skip invalid keypoint index"

        keypoints_conf = keypoints.conf.cpu().numpy() if keypoints.conf is not None else None
        head_indices = [0, 1, 2, 3, 4]
        valid_head = 0
        for idx in head_indices:
            if idx >= keypoints_xy.shape[1]:
                continue

            px = float(keypoints_xy[detection_index, idx, 0])
            py = float(keypoints_xy[detection_index, idx, 1])
            point_conf = float(keypoints_conf[detection_index, idx]) if keypoints_conf is not None else 1.0
            if px > 0 and py > 0 and point_conf >= self._kpt_conf:
                valid_head += 1

        if valid_head < self._min_head_kpts:
            if best_score >= self._high_conf_box_without_kpts:
                return True, (
                    f"ok weak keypoints ({valid_head}) but high box score ({best_score:.3f})"
                )
            return False, f"skip insufficient head keypoints ({valid_head})"

        return True, "ok"

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

    def _get_insightface_recognizer(self):
        if self._insightface_recognizer is None:
            ctx_id = 0 if "CUDAExecutionProvider" in self._insightface_providers else -1
            model_zoo_module = importlib.import_module("insightface.model_zoo")

            model_file = Path(self._insightface_rec_model_path)
            if model_file.is_file():
                try:
                    recognizer = model_zoo_module.get_model(
                        str(model_file),
                        providers=self._insightface_providers,
                    )
                    recognizer.prepare(ctx_id=ctx_id)
                    self._insightface_recognizer = recognizer
                    return self._insightface_recognizer
                except Exception:
                    logger.warning(
                        "Cannot load recognizer from path %s, fallback to FaceAnalysis model name %s",
                        self._insightface_rec_model_path,
                        self._insightface_model_name,
                        exc_info=True,
                    )

            face_analysis_module = importlib.import_module("insightface.app")
            face_analysis_class = face_analysis_module.FaceAnalysis
            # insightface 0.2.1 không hỗ trợ providers= — chỉ dùng ctx_id trong .prepare()
            app = face_analysis_class(
                name=self._insightface_model_name,
            )
            app.prepare(ctx_id=ctx_id, det_size=self._insightface_det_size)

            recognizer = None
            models = getattr(app, "models", None)
            if isinstance(models, dict):
                recognizer = models.get("recognition")
                if recognizer is None:
                    for model in models.values():
                        if hasattr(model, "get_feat"):
                            recognizer = model
                            break

            if recognizer is None:
                raise RuntimeError("InsightFace recognition model is unavailable")

            self._insightface_recognizer = recognizer
            logger.info("[InsightFace] Model ready (cached). get_feat call will follow.")
            return self._insightface_recognizer

        return self._insightface_recognizer

    # ------------------------------------------------------------------
    # Public API – giữ nguyên signature cũ để không phá code gọi bên ngoài
    # ------------------------------------------------------------------
    def extract_embeddings(self, frame_bytes):
        """Nhận raw bytes ảnh, trả về list các embedding vectors.

        Returns:
            list[list[float]]: Mỗi phần tử là 1 embedding của InsightFace.
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
        skip_reasons = []
        for idx in range(len(boxes)):
            is_qualified, reason = self._check_quality_image(detections, idx)
            if not is_qualified:
                logger.debug("Skipping face #%d before embedding: %s", idx, reason)
                skip_reasons.append(reason)
                continue

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
                skip_reasons.append("skip empty aligned face")
                continue

            # Bước 3: InsightFace extract embedding từ ảnh đã align
            try:
                face_for_recognition = cv2.resize(aligned_face, (112, 112), interpolation=cv2.INTER_AREA)
                vector = self._get_insightface_recognizer().get_feat(face_for_recognition)
                if vector is None:
                    skip_reasons.append("skip empty embedding vector")
                    continue

                vector_np = np.asarray(vector, dtype=np.float32)
                if vector_np.ndim > 1:
                    vector_np = vector_np[0]

                embeddings.append(vector_np.reshape(-1).tolist())
            except Exception:
                logger.warning("InsightFace failed on face #%d, skipping.", idx, exc_info=True)
                skip_reasons.append("skip insightface exception")
                continue

        if not embeddings and skip_reasons:
            logger.info("No embedding produced. Reasons: %s", "; ".join(skip_reasons))

        return embeddings

    # ------------------------------------------------------------------
    # Public API – Luồng mới: nhận ảnh crop + 5 keypoints từ frontend
    # (YOLO ONNX chạy trên browser, backend chỉ align + embed)
    # ------------------------------------------------------------------
    def extract_embeddings_from_crop(self, crop_bytes, keypoints_list):
        """Nhận ảnh crop đã khoét sẵn + danh sách 5 keypoints, trả về embedding + timing.

        Returns:
            tuple(list[float] | None, dict): (embedding, timing_dict).
            timing_dict luôn được trả về kể cả khi embedding là None.
        """
        import time
        t0 = time.perf_counter()
        timing = {}

        # Decode crop bytes → numpy BGR image
        arr = np.frombuffer(crop_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            logger.warning("extract_embeddings_from_crop: cannot decode crop image")
            return None, timing
        t1 = time.perf_counter()
        timing["decode_ms"] = round((t1 - t0) * 1000, 1)

        h, w = img.shape[:2]
        if h < 20 or w < 20:
            logger.warning("extract_embeddings_from_crop: crop too small (%dx%d)", w, h)
            return None, timing

        # Parse keypoints: [x0,y0, x1,y1, ... x4,y4] → numpy (5,2)
        kps = None
        if keypoints_list and len(keypoints_list) >= 4:
            try:
                flat = [float(v) for v in keypoints_list]
                kps = np.array(flat, dtype=np.int32).reshape(-1, 2)
            except (ValueError, TypeError):
                logger.warning("extract_embeddings_from_crop: invalid keypoints, fallback to raw crop")
                kps = None

        # Box bao trọn toàn bộ crop (vì frontend đã khoét đúng vùng mặt)
        box = (0, 0, w, h)

        # Bước 1: Align face dựa trên keypoints local
        t2 = time.perf_counter()
        aligned_face = align_face(img, kps, box)
        t3 = time.perf_counter()
        timing["align_ms"] = round((t3 - t2) * 1000, 1)

        if aligned_face is None or aligned_face.size == 0:
            logger.warning("extract_embeddings_from_crop: alignment produced empty result")
            return None, timing

        # Bước 2: Resize về 112x112 chuẩn InsightFace + extract embedding
        try:
            face_for_recognition = cv2.resize(
                aligned_face, (112, 112), interpolation=cv2.INTER_AREA
            )
            t4 = time.perf_counter()
            recognizer = self._get_insightface_recognizer()
            t5 = time.perf_counter()
            vector = recognizer.get_feat(face_for_recognition)
            t6 = time.perf_counter()
            timing["get_feat_ms"] = round((t6 - t5) * 1000, 1)
            timing["embed_total_ms"] = round((t6 - t0) * 1000, 1)

            logger.info(
                "[TIMING] decode=%.1fms align=%.1fms get_feat=%.1fms TOTAL=%.1fms",
                timing["decode_ms"], timing["align_ms"], timing["get_feat_ms"],
                timing["embed_total_ms"],
            )

            if vector is None:
                return None, timing

            vector_np = np.asarray(vector, dtype=np.float32)
            if vector_np.ndim > 1:
                vector_np = vector_np[0]

            return vector_np.reshape(-1).tolist(), timing
        except Exception:
            logger.warning("extract_embeddings_from_crop: InsightFace failed", exc_info=True)
            return None, timing
