"""One-time migration: copy face vectors from SQLite → Redis.

Usage (from repo root):
    python scripts/migrate_redis_vector.py

Requires:
    - Redis Stack running (REDIS_URL env var or default redis://localhost:6379)
    - app.db already present in backend/data/
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
repo_root_str = str(REPO_ROOT)
if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)


from backend.app import create_app
from backend.app.extensions import db
from backend.app.models import Employee, FaceSample


def migrate():
    app = create_app()
    with app.app_context():
        face_index_service = app.extensions["face_index_service"]

        rows = (
            db.session.query(FaceSample, Employee)
            .join(Employee, FaceSample.employee_id == Employee.id)
            .filter(Employee.is_active.is_(True))
            .all()
        )

        ok = 0
        skip = 0
        for sample, employee in rows:
            try:
                embedding = json.loads(sample.embedding_json)
            except (TypeError, ValueError, json.JSONDecodeError):
                print(f"  SKIP  employee={employee.id} sample={sample.sample_index}: invalid embedding_json")
                skip += 1
                continue

            face_index_service.upsert(
                employee_id=employee.id,
                sample_index=sample.sample_index,
                employee_code=employee.employee_code,
                full_name=employee.full_name,
                embedding=embedding,
            )
            ok += 1

        print(f"\nMigration complete: {ok} upserted, {skip} skipped.")


if __name__ == "__main__":
    migrate()
