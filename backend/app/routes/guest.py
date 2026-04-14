from flask import Blueprint, current_app, jsonify, request

from ..services.rate_limiter import RateLimiter
from .helpers import invalid_request

import json
import logging

logger = logging.getLogger(__name__)

guest_bp = Blueprint("guest", __name__)

_guest_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)


@guest_bp.post("/guest/checkin")
def guest_checkin():
    if _guest_rate_limiter.is_limited(request.remote_addr):
        return jsonify({"status": "rate_limited", "message": "Too many requests. Please wait."}), 429

    frame = request.files.get("frame")
    if frame is None or not frame.filename:
        return invalid_request("frame is required")

    frame_bytes = frame.read()
    if not frame_bytes:
        return invalid_request("frame is required")

    recognition_service = current_app.extensions["recognition_service"]
    payload = recognition_service.process_guest_image(
        frame_bytes,
        filename=frame.filename,
        content_type=frame.content_type,
    )

    return jsonify(payload)


# ------------------------------------------------------------------
# Endpoint mới: YOLO ONNX chạy trên browser, gửi crop + keypoints
# ------------------------------------------------------------------
@guest_bp.post("/guest/checkin-kpts")
def guest_checkin_kpts():
    """Nhận ảnh crop khuôn mặt + 5 keypoints từ frontend YOLO ONNX.

    Form fields:
        crop: file ảnh JPEG/PNG (đã cắt khoanh vùng mặt, có padding).
        kpts: JSON string, mảng 10 số [x0,y0, x1,y1, ..., x4,y4]
              (tọa độ local trong ảnh crop).
    """
    if _guest_rate_limiter.is_limited(request.remote_addr):
        return jsonify({"status": "rate_limited", "message": "Too many requests. Please wait."}), 429

    # --- Validate crop image ---
    crop = request.files.get("crop")
    if crop is None or not crop.filename:
        return invalid_request("crop is required")

    crop_bytes = crop.read()
    if not crop_bytes:
        return invalid_request("crop image is empty")

    # Giới hạn kích thước: tối thiểu 1KB, tối đa 2MB
    if len(crop_bytes) < 1024:
        return invalid_request("crop image too small")
    if len(crop_bytes) > 2 * 1024 * 1024:
        return invalid_request("crop image too large (max 2MB)")

    # --- Validate keypoints ---
    kpts_raw = request.form.get("kpts")
    keypoints_list = None
    if kpts_raw:
        try:
            keypoints_list = json.loads(kpts_raw)
            if not isinstance(keypoints_list, list) or len(keypoints_list) < 4:
                return invalid_request("kpts must be a list of at least 4 numbers")
        except (json.JSONDecodeError, TypeError):
            return invalid_request("kpts must be valid JSON")

    # --- Process ---
    recognition_service = current_app.extensions["recognition_service"]
    payload = recognition_service.process_crop_image(
        crop_bytes,
        keypoints_list,
        filename=crop.filename,
    )

    return jsonify(payload)
