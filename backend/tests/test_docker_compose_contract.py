"""
Regression tests to ensure Docker Compose configuration maintains required source code mounts.
These tests lock the contract that backend service must mount backend and scripts directories.
"""
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_backend_service_mounts_backend_source_code():
    """Ensure backend service mounts ./backend:/app/backend for live code reload."""
    compose_file = REPO_ROOT / "docker-compose.yml"
    compose_text = compose_file.read_text(encoding="utf-8")

    assert "- ./backend:/app/backend" in compose_text, (
        "Backend service must mount ./backend:/app/backend for source code access"
    )


def test_backend_service_mounts_scripts_source_code():
    """Ensure backend service mounts ./scripts:/app/scripts for script access."""
    compose_file = REPO_ROOT / "docker-compose.yml"
    compose_text = compose_file.read_text(encoding="utf-8")

    assert "- ./scripts:/app/scripts" in compose_text, (
        "Backend service must mount ./scripts:/app/scripts for script access"
    )