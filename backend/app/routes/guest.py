from flask import Blueprint, current_app, jsonify, request

from ..services.image_validation import is_allowed_image_filename, read_non_empty_upload
from ..services.rate_limiter import RateLimiter
from .helpers import invalid_request

import json

guest_bp = Blueprint("guest", __name__)

# Lazily initialised on first request so Config is available
_guest_rate_limiter = None


def _get_rate_limiter():
    global _guest_rate_limiter
    if _guest_rate_limiter is None:
        _guest_rate_limiter = RateLimiter(
            max_requests=current_app.config.get("GUEST_RATE_LIMIT_MAX_REQUESTS", 10),
            window_seconds=current_app.config.get("GUEST_RATE_LIMIT_WINDOW_SECONDS", 60),
        )
    return _guest_rate_limiter


@guest_bp.post("/guest/checkin")
def guest_checkin():
    if _get_rate_limiter().is_limited(request.remote_addr):
        return jsonify({"status": "rate_limited", "message": "Too many requests. Please wait."}), 429

    frame = request.files.get("frame")
    if frame is None or not frame.filename:
        return invalid_request("frame is required")

    if not is_allowed_image_filename(frame.filename):
        return invalid_request("frame must be a JPEG, PNG, BMP, or WebP image")

    frame_bytes = read_non_empty_upload(frame)
    if frame_bytes is None:
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
    if _get_rate_limiter().is_limited(request.remote_addr):
        return jsonify({"status": "rate_limited", "message": "Too many requests. Please wait."}), 429

    # --- Validate crop image ---
    crop = request.files.get("crop")
    if crop is None or not crop.filename:
        return invalid_request("crop is required")

    if not is_allowed_image_filename(crop.filename):
        return invalid_request("crop must be a JPEG, PNG, BMP, or WebP image")

    crop_bytes = read_non_empty_upload(crop)
    if crop_bytes is None:
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
