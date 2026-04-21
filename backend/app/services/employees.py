from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError

from ..models import AttendanceEvent, Employee
from .auth import serialize_employee


@dataclass
class EmployeeServiceResult:
    status: str
    payload: dict
    http_status: int


def _normalize_text(value):
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class EmployeeService:
    def __init__(self, db, face_sample_service):
        self.db = db
        self.face_sample_service = face_sample_service

    def list_employees(self, department=None, position=None) -> list:
        query = Employee.query
        if department:
            query = query.filter(Employee.department == department)
        if position:
            query = query.filter(Employee.position == position)
        employees = query.order_by(Employee.id.asc()).all()
        return [serialize_employee(employee) for employee in employees]

    def create_employee(self, payload: dict) -> EmployeeServiceResult:
        employee_code = _normalize_text(payload.get("employee_code"))
        full_name = _normalize_text(payload.get("full_name"))
        department = _normalize_text(payload.get("department")) or "Văn phòng"
        position = _normalize_text(payload.get("position")) or "Nhân viên"
        if not employee_code or not full_name:
            return EmployeeServiceResult(
                status="invalid_request",
                payload={"status": "invalid_request", "message": "employee_code and full_name are required"},
                http_status=400,
            )

        existing_employee = Employee.query.filter_by(employee_code=employee_code).first()
        if existing_employee is not None:
            return EmployeeServiceResult(
                status="duplicate_employee_code",
                payload={"status": "duplicate_employee_code"},
                http_status=409,
            )

        employee = Employee(
            employee_code=employee_code,
            full_name=full_name,
            department=department,
            position=position,
        )
        self.db.session.add(employee)
        try:
            self.db.session.commit()
        except IntegrityError:
            self.db.session.rollback()
            code_conflict = Employee.query.filter_by(employee_code=employee_code).first()
            if code_conflict is not None:
                return EmployeeServiceResult(
                    status="duplicate_employee_code",
                    payload={"status": "duplicate_employee_code"},
                    http_status=409,
                )
            raise

        return EmployeeServiceResult(
            status="created",
            payload={"employee": serialize_employee(employee)},
            http_status=201,
        )

    def update_employee(self, employee_id: int, payload: dict) -> EmployeeServiceResult:
        employee = self.db.session.get(Employee, employee_id)
        if employee is None:
            return EmployeeServiceResult(
                status="employee_not_found",
                payload={"status": "employee_not_found"},
                http_status=404,
            )

        employee_code = _normalize_text(payload.get("employee_code"))
        full_name = _normalize_text(payload.get("full_name"))
        department = _normalize_text(payload.get("department")) or "Văn phòng"
        position = _normalize_text(payload.get("position")) or "Nhân viên"

        if not employee_code or not full_name:
            return EmployeeServiceResult(
                status="invalid_request",
                payload={"status": "invalid_request", "message": "employee_code and full_name are required"},
                http_status=400,
            )

        existing_employee = Employee.query.filter(
            Employee.employee_code == employee_code,
            Employee.id != employee.id,
        ).first()
        if existing_employee is not None:
            return EmployeeServiceResult(
                status="duplicate_employee_code",
                payload={"status": "duplicate_employee_code"},
                http_status=409,
            )

        employee.employee_code = employee_code
        employee.full_name = full_name
        employee.department = department
        employee.position = position
        employee.is_active = bool(payload.get("is_active", employee.is_active))

        try:
            self.db.session.commit()
        except IntegrityError:
            self.db.session.rollback()
            code_conflict = Employee.query.filter_by(employee_code=employee_code).first()
            if code_conflict is not None and code_conflict.id != employee.id:
                return EmployeeServiceResult(
                    status="duplicate_employee_code",
                    payload={"status": "duplicate_employee_code"},
                    http_status=409,
                )
            raise

        return EmployeeServiceResult(
            status="updated",
            payload={"employee": serialize_employee(employee)},
            http_status=200,
        )

    def delete_employee(self, employee_id: int) -> EmployeeServiceResult:
        employee = self.db.session.get(Employee, employee_id)
        if employee is None:
            return EmployeeServiceResult(
                status="employee_not_found",
                payload={"status": "employee_not_found"},
                http_status=404,
            )

        face_deletion_result = self.face_sample_service.delete_employee_faces(
            employee.id,
            commit=False,
            cleanup_files=False,
            update_index=False,
        )
        deleted_attendance_count = AttendanceEvent.query.filter_by(employee_id=employee.id).count()
        self.db.session.delete(employee)
        self.db.session.commit()
        self.face_sample_service.cleanup_deleted_face_files(face_deletion_result)
        self.face_sample_service.delete_employee_index(employee_id)

        return EmployeeServiceResult(
            status="deleted",
            payload={
                "status": "deleted",
                "employee_id": employee_id,
                "deleted_face_samples": face_deletion_result.deleted_sample_count,
                "deleted_attendance_events": deleted_attendance_count,
            },
            http_status=200,
        )
