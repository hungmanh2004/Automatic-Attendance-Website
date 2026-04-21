import base64
import logging

from flask import current_app

logger = logging.getLogger(__name__)


def register_guest_tasks(celery_app):
    if "guest.process_crop_checkin" in celery_app.tasks:
        return

    @celery_app.task(name="guest.process_crop_checkin", bind=True)
    def process_crop_checkin(self, crop_b64, keypoints_list=None, filename=None):
        try:
            crop_bytes = base64.b64decode(crop_b64, validate=True)
        except Exception:
            logger.warning("Invalid base64 crop payload for task %s", self.request.id, exc_info=True)
            return {"status": "invalid_request", "message": "invalid crop payload"}

        recognition_service = current_app.extensions["recognition_service"]
        return recognition_service.process_crop_image(
            crop_bytes,
            keypoints_list,
            filename=filename,
        )
