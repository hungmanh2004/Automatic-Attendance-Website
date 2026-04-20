from io import BytesIO

import pytest
from werkzeug.datastructures import FileStorage

from backend.app.services.image_validation import (
    is_allowed_image_filename,
    read_non_empty_upload,
)


@pytest.mark.parametrize(
    "filename",
    [
        "face.jpg",
        "face.jpeg",
        "face.png",
        "face.bmp",
        "face.webp",
        "FACE.JPG",
        "portrait.WeBp",
    ],
)
def test_is_allowed_image_filename_accepts_supported_extensions(filename):
    assert is_allowed_image_filename(filename) is True


@pytest.mark.parametrize(
    "filename",
    [
        None,
        "",
        "face",
        "face.gif",
        "face.txt",
        ".hidden",
    ],
)
def test_is_allowed_image_filename_rejects_missing_or_unsupported_extensions(filename):
    assert is_allowed_image_filename(filename) is False


def test_read_non_empty_upload_returns_bytes():
    upload = FileStorage(stream=BytesIO(b"image-bytes"), filename="face.jpg")

    assert read_non_empty_upload(upload) == b"image-bytes"


def test_read_non_empty_upload_returns_none_for_empty_upload():
    upload = FileStorage(stream=BytesIO(b""), filename="face.jpg")

    assert read_non_empty_upload(upload) is None


def test_read_non_empty_upload_returns_none_for_missing_upload():
    assert read_non_empty_upload(None) is None
