from flask import session
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import Employee, ManagerUser

SESSION_MANAGER_ID_KEY = "manager_id"
SESSION_MANAGER_USERNAME_KEY = "manager_username"


def serialize_manager(manager):
    return {
        "id": manager.id,
        "username": manager.username,
    }


def serialize_employee(employee):
    return {
        "id": employee.id,
        "employee_code": employee.employee_code,
        "full_name": employee.full_name,
        "position": employee.position,
        "is_active": employee.is_active,
        "created_at": employee.created_at.isoformat(),
    }


def authenticate_manager(username, password):
    manager = ManagerUser.query.filter_by(username=username).first()
    if manager is None:
        return None
    if not check_password_hash(manager.password_hash, password):
        return None
    return manager


def login_manager(manager):
    session[SESSION_MANAGER_ID_KEY] = manager.id
    session[SESSION_MANAGER_USERNAME_KEY] = manager.username


def logout_manager():
    session.clear()


def get_current_manager():
    manager_id = session.get(SESSION_MANAGER_ID_KEY)
    if manager_id is None:
        return None
    return db.session.get(ManagerUser, manager_id)


def require_manager():
    manager = get_current_manager()
    if manager is None:
        return None, ({"status": "unauthorized"}, 401)
    return manager, None


def list_employees():
    employees = Employee.query.order_by(Employee.id.asc()).all()
    return [serialize_employee(employee) for employee in employees]
