from werkzeug.security import generate_password_hash


try:
    from backend.app import create_app
    from backend.app.extensions import db
    from backend.app.models import Employee, ManagerUser
except ModuleNotFoundError:
    from app import create_app
    from app.extensions import db
    from app.models import Employee, ManagerUser


def _create_manager(app, username="manager", password="secret123"):
    with app.app_context():
        manager = ManagerUser(
            username=username,
            password_hash=generate_password_hash(password),
        )
        db.session.add(manager)
        db.session.commit()
        return {
            "id": manager.id,
            "username": manager.username,
            "password": password,
        }


def _create_employee(app, employee_code="EMP-001", full_name="Ada Lovelace"):
    with app.app_context():
        employee = Employee(
            employee_code=employee_code,
            full_name=full_name,
        )
        db.session.add(employee)
        db.session.commit()
        return {
            "id": employee.id,
            "employee_code": employee.employee_code,
            "full_name": employee.full_name,
            "is_active": employee.is_active,
            "created_at": employee.created_at.isoformat(),
        }


def test_manager_login_requires_username_and_password(client):
    response = client.post("/api/manager/login", json={})

    assert response.status_code == 400
    assert response.get_json()["status"] == "invalid_request"


def test_manager_login_rejects_invalid_credentials(app, client):
    _create_manager(app)

    response = client.post(
        "/api/manager/login",
        json={"username": "manager", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.get_json()["status"] == "invalid_credentials"


def test_manager_login_accepts_configured_secret_override(tmp_path):
    data_dir = tmp_path / "override-data"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "override-secret",
            "APP_DB_PATH": data_dir / "app.db",
            "CHECKIN_DIR": data_dir / "checkins",
            "FACES_DIR": data_dir / "faces",
        }
    )
    client = app.test_client()
    manager = _create_manager(app)

    response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )

    assert response.status_code == 200
    assert response.get_json()["manager"]["username"] == manager["username"]


def test_manager_login_sets_session_and_allows_me_lookup(app, client):
    manager = _create_manager(app)

    response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )

    assert response.status_code == 200
    assert response.get_json()["manager"] == {
        "id": manager["id"],
        "username": manager["username"],
    }

    me_response = client.get("/api/manager/me")

    assert me_response.status_code == 200
    assert me_response.get_json()["manager"] == {
        "id": manager["id"],
        "username": manager["username"],
    }


def test_manager_me_requires_authentication(client):
    response = client.get("/api/manager/me")

    assert response.status_code == 401
    assert response.get_json()["status"] == "unauthorized"


def test_manager_employee_list_requires_authentication(client):
    response = client.get("/api/manager/employees")

    assert response.status_code == 401
    assert response.get_json()["status"] == "unauthorized"


def test_manager_employee_list_returns_stable_payload_shape(app, client):
    manager = _create_manager(app)
    employee = _create_employee(app, employee_code="EMP-007", full_name="Ada Lovelace")

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.get("/api/manager/employees")

    assert response.status_code == 200
    assert response.get_json()["employees"] == [employee]


def test_manager_create_employee_requires_authentication(client):
    response = client.post(
        "/api/manager/employees",
        json={"employee_code": "EMP-100", "full_name": "Grace Hopper"},
    )

    assert response.status_code == 401
    assert response.get_json()["status"] == "unauthorized"


def test_manager_create_employee_validates_required_fields(app, client):
    manager = _create_manager(app)

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.post("/api/manager/employees", json={})

    assert response.status_code == 400
    assert response.get_json()["status"] == "invalid_request"


def test_manager_create_employee_rejects_duplicate_employee_code(app, client):
    manager = _create_manager(app)
    _create_employee(app, employee_code="EMP-100", full_name="Ada Lovelace")

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/manager/employees",
        json={"employee_code": "EMP-100", "full_name": "Grace Hopper"},
    )

    assert response.status_code == 409
    assert response.get_json()["status"] == "duplicate_employee_code"


def test_manager_create_employee_allows_duplicate_full_name_when_code_differs(app, client):
    manager = _create_manager(app)
    _create_employee(app, employee_code="EMP-100", full_name="Ada Lovelace")

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/manager/employees",
        json={"employee_code": "EMP-101", "full_name": "Ada Lovelace"},
    )

    assert response.status_code == 201
    assert response.get_json()["employee"]["employee_code"] == "EMP-101"


def test_manager_create_employee_persists_employee(app, client):
    manager = _create_manager(app)

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/manager/employees",
        json={"employee_code": "EMP-200", "full_name": "Grace Hopper"},
    )

    assert response.status_code == 201
    payload = response.get_json()["employee"]
    assert payload["employee_code"] == "EMP-200"
    assert payload["full_name"] == "Grace Hopper"
    assert payload["is_active"] is True

    with app.app_context():
        employee = Employee.query.filter_by(employee_code="EMP-200").one()
        assert employee.full_name == "Grace Hopper"


def test_manager_create_employee_rejects_whitespace_only_values(app, client):
    manager = _create_manager(app)

    login_response = client.post(
        "/api/manager/login",
        json={"username": manager["username"], "password": manager["password"]},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/manager/employees",
        json={"employee_code": "   ", "full_name": "\t"},
    )

    assert response.status_code == 400
    assert response.get_json()["status"] == "invalid_request"
