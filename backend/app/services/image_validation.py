ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "webp"}


def is_allowed_image_filename(filename: str | None) -> bool:
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def read_non_empty_upload(file_storage) -> bytes | None:
    if file_storage is None:
        return None
    data = file_storage.read()
    return data or None
