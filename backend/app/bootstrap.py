from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError


def run_schema_updates(db, database_uri: str) -> None:
    _ = database_uri
    inspector = inspect(db.engine)
    employee_columns = {column["name"] for column in inspector.get_columns("employees")}
    if "department" not in employee_columns:
        try:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN department VARCHAR(255) DEFAULT 'Văn phòng'"))
        except OperationalError as error:
            if "duplicate column name: department" not in str(error):
                raise
            db.session.rollback()
        db.session.execute(text("UPDATE employees SET department = 'Văn phòng' WHERE department IS NULL"))
        db.session.commit()

    if "position" not in employee_columns:
        try:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN position VARCHAR(255) DEFAULT 'Nhân viên'"))
        except OperationalError as error:
            if "duplicate column name: position" not in str(error):
                raise
            db.session.rollback()
        db.session.execute(text("UPDATE employees SET position = 'Nhân viên' WHERE position IS NULL"))
        db.session.commit()
