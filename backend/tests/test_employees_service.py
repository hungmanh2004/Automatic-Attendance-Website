from datetime import datetime

from backend.app.extensions import db
from backend.app.models import AttendanceEvent, Employee
from backend.app.services.employees import EmployeeService


class FakeDeletionResult:
    deleted_sample_count = 2


class FakeFaceSampleService:
    def __init__(self):
        self.delete_calls = []
        self.cleanup_calls = []
        self.index_delete_calls = []
        self.deletion_result = FakeDeletionResult()

    def delete_employee_faces(self, employee_id, *, commit, cleanup_files, update_index):
        self.delete_calls.append(
            {
                "employee_id": employee_id,
                "commit": commit,
                "cleanup_files": cleanup_files,
                "update_index": update_index,
            }
        )
        return self.deletion_result

    def cleanup_deleted_face_files(self, result):
        self.cleanup_calls.append(result)

    def delete_employee_index(self, employee_id):
        self.index_delete_calls.append(employee_id)


def _make_service():
    face_sample_service = FakeFaceSampleService()
    return EmployeeService(db=db, face_sample_service=face_sample_service), face_sample_service


def _create_employee(employee_code="EMP-001", full_name="Ada Lovelace", department=None, position=None):
    employee = Employee(
        employee_code=employee_code,
        full_name=full_name,
        department=department or "Văn phòng",
        position=position or "Nhân viên",
    )
    db.session.add(employee)
    db.session.commit()
    return employee


def test_create_employee_normalizes_persists_and_returns_payload(app):
    service, _ = _make_service()

    with app.app_context():
        result = service.create_employee(
            {
                "employee_code": " EMP-100 ",
                "full_name": " Ada Lovelace ",
                "department": "",
                "position": None,
            }
        )

        employee = Employee.query.filter_by(employee_code="EMP-100").one()
        assert result.status == "created"
        assert result.http_status == 201
        assert result.payload["employee"]["id"] == employee.id
        assert result.payload["employee"]["employee_code"] == "EMP-100"
        assert result.payload["employee"]["full_name"] == "Ada Lovelace"
        assert result.payload["employee"]["department"] == "Văn phòng"
        assert result.payload["employee"]["position"] == "Nhân viên"


def test_create_employee_rejects_duplicate_employee_code(app):
    service, _ = _make_service()

    with app.app_context():
        _create_employee(employee_code="EMP-200")

        result = service.create_employee(
            {
                "employee_code": "EMP-200",
                "full_name": "Grace Hopper",
            }
        )

        assert result.status == "duplicate_employee_code"
        assert result.http_status == 409
        assert result.payload == {"status": "duplicate_employee_code"}


def test_update_employee_returns_not_found_and_rejects_duplicate_code(app):
    service, _ = _make_service()

    with app.app_context():
        _create_employee(employee_code="EMP-300")
        employee = _create_employee(employee_code="EMP-301")

        missing_result = service.update_employee(
            999,
            {
                "employee_code": "EMP-999",
                "full_name": "Missing",
            },
        )
        duplicate_result = service.update_employee(
            employee.id,
            {
                "employee_code": "EMP-300",
                "full_name": "Duplicate",
            },
        )

        assert missing_result.status == "employee_not_found"
        assert missing_result.http_status == 404
        assert duplicate_result.status == "duplicate_employee_code"
        assert duplicate_result.http_status == 409


def test_delete_employee_hard_deletes_and_coordinates_face_cleanup(app):
    service, face_sample_service = _make_service()

    with app.app_context():
        employee = _create_employee(employee_code="EMP-400")
        db.session.add(
            AttendanceEvent(
                employee_id=employee.id,
                checked_in_at=datetime(2026, 4, 20, 8, 0, 0),
                checkin_date="2026-04-20",
                snapshot_path="snapshot.jpg",
            )
        )
        db.session.commit()
        employee_id = employee.id

        result = service.delete_employee(employee_id)

        assert result.status == "deleted"
        assert result.http_status == 200
        assert result.payload == {
            "status": "deleted",
            "employee_id": employee_id,
            "deleted_face_samples": 2,
            "deleted_attendance_events": 1,
        }
        assert db.session.get(Employee, employee_id) is None
        assert face_sample_service.delete_calls == [
            {
                "employee_id": employee_id,
                "commit": False,
                "cleanup_files": False,
                "update_index": False,
            }
        ]
        assert face_sample_service.cleanup_calls == [face_sample_service.deletion_result]
        assert face_sample_service.index_delete_calls == [employee_id]


def test_list_employees_filters_by_department(app):
    service, _ = _make_service()
    with app.app_context():
        _create_employee(employee_code="EMP-100", full_name="A", department="IT")
        _create_employee(employee_code="EMP-101", full_name="B", department="HR")
        result = service.list_employees(department="IT")
        assert len(result) == 1
        assert result[0]["employee_code"] == "EMP-100"


def test_list_employees_filters_by_position(app):
    service, _ = _make_service()
    with app.app_context():
        _create_employee(employee_code="EMP-200", full_name="X", position="Engineer")
        _create_employee(employee_code="EMP-201", full_name="Y", position="Manager")
        result = service.list_employees(position="Engineer")
        assert len(result) == 1
        assert result[0]["employee_code"] == "EMP-200"


def test_list_employees_filters_by_both(app):
    service, _ = _make_service()
    with app.app_context():
        _create_employee(employee_code="EMP-300", full_name="P", department="IT", position="Engineer")
        _create_employee(employee_code="EMP-301", full_name="Q", department="IT", position="Manager")
        result = service.list_employees(department="IT", position="Engineer")
        assert len(result) == 1
        assert result[0]["employee_code"] == "EMP-300"
