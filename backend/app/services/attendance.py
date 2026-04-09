from collections import defaultdict
from datetime import datetime, date, time

from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_

from ..extensions import db
from ..models import AttendanceEvent, Employee


def _find_existing_event(employee_id, checkin_date):
    return AttendanceEvent.query.filter_by(
        employee_id=employee_id,
        checkin_date=checkin_date,
    ).first()


def _derive_status(checked_in_at):
    if checked_in_at is None:
        return 'Unknown'
    return 'On-time' if checked_in_at.time() <= time(9, 0) else 'Late'


def _derive_confidence(distance):
    if distance is None:
        return None
    return max(0, min(100, round((1 - distance) * 100, 1)))


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

    def list_attendance_events(self, from_date=None, to_date=None, search=None, department=None, position=None):
        query = (
            db.session.query(AttendanceEvent, Employee)
            .join(Employee, AttendanceEvent.employee_id == Employee.id)
        )

        if from_date is not None:
            query = query.filter(AttendanceEvent.checkin_date >= from_date.isoformat())
        if to_date is not None:
            query = query.filter(AttendanceEvent.checkin_date <= to_date.isoformat())

        normalized_search = (search or "").strip()
        if normalized_search:
            pattern = f"%{normalized_search.lower()}%"
            query = query.filter(
                or_(
                    func.lower(Employee.employee_code).like(pattern),
                    func.lower(Employee.full_name).like(pattern),
                )
            )

        normalized_department = (department or "").strip()
        if normalized_department:
            query = query.filter(Employee.department == normalized_department)

        normalized_position = (position or "").strip()
        if normalized_position:
            query = query.filter(Employee.position == normalized_position)

        return query.order_by(AttendanceEvent.checked_in_at.desc(), AttendanceEvent.id.desc()).all()

    def get_dashboard_summary(self, now=None):
        now = now or datetime.now()
        today = now.date()
        month_start = today.replace(day=1)

        employees = Employee.query.order_by(Employee.id.asc()).all()
        total_employees = len(employees)
        employee_map = {employee.id: employee for employee in employees}

        today_events = AttendanceEvent.query.filter(AttendanceEvent.checkin_date == today.isoformat()).all()
        month_events = AttendanceEvent.query.filter(AttendanceEvent.checkin_date >= month_start.isoformat()).all()

        unique_today_ids = {event.employee_id for event in today_events}
        on_time_today = sum(1 for event in today_events if _derive_status(event.checked_in_at) == 'On-time')
        late_today = sum(1 for event in today_events if _derive_status(event.checked_in_at) == 'Late')
        absent_today = max(total_employees - len(unique_today_ids), 0)
        attendance_rate = round((len(unique_today_ids) / total_employees) * 100, 1) if total_employees else 0

        daily_log = []
        for event in sorted(today_events, key=lambda item: item.checked_in_at, reverse=True):
            employee = employee_map.get(event.employee_id)
            daily_log.append(
                {
                    'id': event.id,
                    'employee_code': employee.employee_code if employee else 'N/A',
                    'full_name': employee.full_name if employee else 'Unknown',
                    'department': employee.department if employee else 'N/A',
                    'position': employee.position if employee else 'N/A',
                    'checked_in_at': event.checked_in_at.isoformat(),
                    'status': _derive_status(event.checked_in_at),
                    'confidence': _derive_confidence(event.distance),
                    'location': 'Main Gate',
                }
            )

        events_by_employee = defaultdict(list)
        for event in month_events:
            events_by_employee[event.employee_id].append(event)

        employee_stats = []
        days_passed = today.day
        for employee in employees:
            events = events_by_employee[employee.id]
            total_days_worked = len(events)
            on_time_count = sum(1 for event in events if _derive_status(event.checked_in_at) == 'On-time')
            late_count = sum(1 for event in events if _derive_status(event.checked_in_at) == 'Late')
            absent_count = max(days_passed - total_days_worked, 0)
            employee_stats.append(
                {
                    'id': employee.id,
                    'employee_code': employee.employee_code,
                    'full_name': employee.full_name,
                    'department': employee.department or 'Văn phòng',
                    'position': employee.position or 'Nhan vien',
                    'is_active': employee.is_active,
                    'total_days_worked': total_days_worked,
                    'on_time_count': on_time_count,
                    'late_count': late_count,
                    'absent_count': absent_count,
                    'failed_checkins': 0,
                }
            )

        return {
            'summary': {
                'total_employees': total_employees,
                'checked_in_today': len(unique_today_ids),
                'on_time_today': on_time_today,
                'late_today': late_today,
                'absent_today': absent_today,
                'failed_scans_today': 0,
                'monthly_attendance_count': len(month_events),
                'attendance_rate': attendance_rate,
            },
            'daily_log': daily_log,
            'employee_stats': employee_stats,
        }

    def get_attendance_event(self, attendance_id):
        return db.session.get(AttendanceEvent, attendance_id)
