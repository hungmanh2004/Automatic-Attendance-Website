from backend.app.extensions import db


def test_app_wires_face_index_threshold_from_config(tmp_path):
    from backend.app import create_app

    app = create_app(
        {
            "TESTING": True,
            "APP_DB_PATH": tmp_path / "app.db",
            "CHECKIN_DIR": tmp_path / "checkins",
            "FACES_DIR": tmp_path / "faces",
            "FACE_MATCH_THRESHOLD": 0.37,
        }
    )

    assert app.extensions["face_index_service"].threshold == 0.37


def test_health_endpoint_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_app_creates_sqlite_db_file(app):
    db_path = app.config["APP_DB_PATH"]

    assert db_path.exists()


def test_database_tables_are_created(app):
    expected_tables = {
        "manager_users",
        "employees",
        "face_samples",
        "attendance_events",
    }

    with app.app_context():
        assert expected_tables.issubset(db.metadata.tables.keys())
