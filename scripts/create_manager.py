import argparse
import sys
from pathlib import Path

from werkzeug.security import generate_password_hash


REPO_ROOT = Path(__file__).resolve().parents[1]
repo_root_str = str(REPO_ROOT)
if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)

from backend.app import create_app
from backend.app.extensions import db
from backend.app.models import ManagerUser


def load_app_context():
    return create_app, db, ManagerUser


def main():
    parser = argparse.ArgumentParser(description="Create a local manager account.")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="abc123")
    args = parser.parse_args()

    create_app, db, ManagerUser = load_app_context()
    app = create_app()

    with app.app_context():
        existing = ManagerUser.query.filter_by(username=args.username).first()
        if existing:
            print(f"exists:{args.username}")
            return

        db.session.add(
            ManagerUser(
                username=args.username,
                password_hash=generate_password_hash(args.password),
            )
        )
        db.session.commit()
        print(f"created:{args.username}")


if __name__ == "__main__":
    main()
