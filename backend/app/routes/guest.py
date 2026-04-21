import base64
import json
import logging

from flask import Blueprint, current_app, jsonify, request

from ..services.image_validation import is_allowed_image_filename, read_non_empty_upload
from ..services.rate_limiter import RateLimiter
from .helpers import invalid_request

guest_bp = Blueprint("guest", __name__)
logger = logging.getLogger(__name__)

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


def _parse_crop_checkin_payload():
    crop = request.files.get("crop")
    if crop is None or not crop.filename:
        return None, None, None, invalid_request("crop is required")

    if not is_allowed_image_filename(crop.filename):
        return None, None, None, invalid_request("crop must be a JPEG, PNG, BMP, or WebP image")

    crop_bytes = read_non_empty_upload(crop)
    if crop_bytes is None:
        return None, None, None, invalid_request("crop image is empty")

    if len(crop_bytes) < 1024:
        return None, None, None, invalid_request("crop image too small")
    if len(crop_bytes) > 2 * 1024 * 1024:
        return None, None, None, invalid_request("crop image too large (max 2MB)")

    kpts_raw = request.form.get("kpts")
    keypoints_list = None
    if kpts_raw:
        try:
            keypoints_list = json.loads(kpts_raw)
            if not isinstance(keypoints_list, list) or len(keypoints_list) < 4:
                return None, None, None, invalid_request("kpts must be a list of at least 4 numbers")
        except (json.JSONDecodeError, TypeError):
            return None, None, None, invalid_request("kpts must be valid JSON")

    return crop_bytes, crop.filename, keypoints_list, None


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

    crop_bytes, filename, keypoints_list, error_response = _parse_crop_checkin_payload()
    if error_response is not None:
        return error_response

    celery_app = current_app.extensions["celery"]
    task = celery_app.tasks["guest.process_crop_checkin"].delay(
        crop_b64=base64.b64encode(crop_bytes).decode("ascii"),
        keypoints_list=keypoints_list,
        filename=filename,
    )

    return jsonify({"status": "queued", "task_id": task.id}), 202


@guest_bp.get("/guest/checkin-kpts/tasks/<task_id>")
def guest_checkin_kpts_task_result(task_id):
    celery_app = current_app.extensions["celery"]
    result = celery_app.AsyncResult(task_id)
    task_state = result.state

    if task_state in {"PENDING", "RECEIVED", "STARTED", "RETRY"}:
        return jsonify({"status": "processing", "task_state": task_state}), 200

    if task_state == "SUCCESS":
        payload = result.result if isinstance(result.result, dict) else {"status": "unknown"}
        result.forget()
        return jsonify({"status": "completed", "task_state": task_state, "result": payload}), 200

    logger.error(
        "Guest checkin task failed: id=%s state=%s error=%s",
        task_id,
        task_state,
        result.result,
    )
    result.forget()
    return (
        jsonify(
            {
                "status": "failed",
                "task_state": task_state,
                "message": "Face check-in processing failed",
            }
        ),
        500,
    )
