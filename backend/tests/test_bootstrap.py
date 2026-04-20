from sqlalchemy import inspect, text

from backend.app.extensions import db
from backend.app.bootstrap import run_schema_updates


def test_run_schema_updates_adds_employee_department_and_position_columns(app):
    with app.app_context():
        db.drop_all()
        db.session.execute(
            text(
                """
                CREATE TABLE employees (
                    id INTEGER PRIMARY KEY,
                    employee_code VARCHAR(50) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1
                )
                """
            )
        )
        db.session.execute(
            text(
                """
                INSERT INTO employees (employee_code, full_name, is_active)
                VALUES ('EMP-OLD', 'Legacy Employee', 1)
                """
            )
        )
        db.session.commit()

        run_schema_updates(db, app.config["SQLALCHEMY_DATABASE_URI"])

        employee_columns = {column["name"] for column in inspect(db.engine).get_columns("employees")}
        assert "department" in employee_columns
        assert "position" in employee_columns

        row = db.session.execute(
            text("SELECT department, position FROM employees WHERE employee_code = 'EMP-OLD'")
        ).mappings().one()
        assert row["department"] == "Văn phòng"
        assert row["position"] == "Nhân viên"
