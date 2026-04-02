from datetime import datetime
from pathlib import Path
from uuid import uuid4


class StorageService:
    def __init__(self, checkin_dir):
        self.checkin_dir = Path(checkin_dir)

    def save_guest_frame(self, frame_bytes, filename=None):
        suffix = Path(filename).suffix.lower() if filename else ".bin"
        if not suffix:
            suffix = ".bin"

        date_dir = self.checkin_dir / datetime.now().date().isoformat()
        snapshot_path = date_dir / f"{uuid4().hex}{suffix}"
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_path.write_bytes(frame_bytes)
        return snapshot_path
