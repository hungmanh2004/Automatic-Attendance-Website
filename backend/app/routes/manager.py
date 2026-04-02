from sqlalchemy.exc import IntegrityError
from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Employee
from ..services.auth import (
    authenticate_manager,
    list_employees,
    login_manager,
    require_manager,
    serialize_employee,
    serialize_manager,
)


manager_bp = Blueprint("manager", __name__)


def _invalid_request(message):
    return jsonify({"status": "invalid_request", "message": message}), 400


def _unauthorized():
    return jsonify({"status": "unauthorized"}), 401


def _normalize_text(value):
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


@manager_bp.post("/manager/login")
def manager_login():
    payload = request.get_json(silent=True) or {}
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username or not password:
        return _invalid_request("username and password are required")

    manager = authenticate_manager(username, password)
    if manager is None:
        return jsonify({"status": "invalid_credentials"}), 401

    login_manager(manager)
    return jsonify({"manager": serialize_manager(manager)})


@manager_bp.get("/manager/me")
def manager_me():
    manager, error_response = require_manager()
    if error_response is not None:
        return error_response

    return jsonify({"manager": serialize_manager(manager)})


@manager_bp.get("/manager/employees")
def manager_employees():
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    return jsonify({"employees": list_employees()})


@manager_bp.post("/manager/employees")
def manager_create_employee():
    _, error_response = require_manager()
    if error_response is not None:
        return error_response

    payload = request.get_json(silent=True) or {}
    employee_code = _normalize_text(payload.get("employee_code"))
    full_name = _normalize_text(payload.get("full_name"))
    if not employee_code or not full_name:
        return _invalid_request("employee_code and full_name are required")

    existing_employee = Employee.query.filter_by(employee_code=employee_code).first()
    if existing_employee is not None:
        return jsonify({"status": "duplicate_employee_code"}), 409

    employee = Employee(employee_code=employee_code, full_name=full_name)
    db.session.add(employee)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        code_conflict = Employee.query.filter_by(employee_code=employee_code).first()
        if code_conflict is not None:
            return jsonify({"status": "duplicate_employee_code"}), 409

        name_conflict = Employee.query.filter_by(full_name=full_name).first()
        if name_conflict is not None:
            return jsonify({"status": "duplicate_employee_conflict"}), 409

        return jsonify({"status": "employee_conflict"}), 409

    return jsonify({"employee": serialize_employee(employee)}), 201
