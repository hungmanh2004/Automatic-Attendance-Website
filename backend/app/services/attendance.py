from datetime import datetime

from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import AttendanceEvent


def _find_existing_event(employee_id, checkin_date):
    return AttendanceEvent.query.filter_by(
        employee_id=employee_id,
        checkin_date=checkin_date,
    ).first()


class AttendanceService:
    def record_checkin(self, employee_id, snapshot_path, distance=None, checked_in_at=None):
        checked_in_at = checked_in_at or datetime.now()
        checkin_date = checked_in_at.date().isoformat()
        existing_event = _find_existing_event(employee_id, checkin_date)

        if existing_event is not None:
            return existing_event, False

        event = AttendanceEvent(
            employee_id=employee_id,
            checked_in_at=checked_in_at,
            checkin_date=checkin_date,
            snapshot_path=str(snapshot_path),
            distance=distance,
        )
        db.session.add(event)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            existing_event = _find_existing_event(employee_id, checkin_date)
            if existing_event is not None:
                return existing_event, False
            raise
        return event, True
