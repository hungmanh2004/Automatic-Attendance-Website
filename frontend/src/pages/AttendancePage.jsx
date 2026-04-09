import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { listAttendance } from "../lib/attendanceApi";
import { getEmployees } from "../lib/api";
import "./AttendancePage.css";

function formatDate(value) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function getTodayRange() {
  const value = formatDate(new Date());
  return { from: value, to: value };
}

function getWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: formatDate(start), to: formatDate(end) };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatDate(start), to: formatDate(end) };
}

function getStatus(record) {
  const date = new Date(record.checked_in_at);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return date.getHours() < 9 || (date.getHours() === 9 && date.getMinutes() <= 0) ? "Đúng giờ" : "Đi muộn";
}

function getStatusValue(record) {
  const date = new Date(record.checked_in_at);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.getHours() < 9 || (date.getHours() === 9 && date.getMinutes() <= 0) ? "on_time" : "late";
}

function getConfidence(record) {
  if (record.distance == null) return "N/A";
  return `${Math.max(0, Math.min(100, Math.round((1 - record.distance) * 1000) / 10))}%`;
}

function exportCsv(records) {
  const header = ["Mã nhân viên", "Họ tên", "Phòng ban", "Chức vụ", "Thời gian", "Trạng thái", "Độ khớp", "Ảnh chụp"];
  const rows = records.map((record) => [
    record.employee_code,
    record.full_name,
    record.department || "",
    record.position || "",
    record.checked_in_at,
    getStatus(record),
    getConfidence(record),
    record.snapshot_url || "",
  ]);
  const csv = [header, ...rows]
    .map((columns) => columns.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lich-su-cham-cong-guardian-ai.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUnauthenticated } = useManagerAuth();
  const todayRange = useMemo(() => getTodayRange(), []);
  const [period, setPeriod] = useState("daily");
  const [filters, setFilters] = useState({
    ...todayRange,
    search: "",
    status: "all",
    department: "all",
    position: "all",
  });
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEmployeesForFilters() {
      try {
        const payload = await getEmployees();
        if (!cancelled) {
          setEmployees(payload.employees || []);
        }
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          navigate("/manager/login", { replace: true, state: { from: location.pathname } });
        }
      }
    }

    void loadEmployeesForFilters();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate, setUnauthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendance() {
      setLoading(true);
      setError("");

      try {
        const payload = await listAttendance({
          from: filters.from,
          to: filters.to,
          search: filters.search,
          department: filters.department === "all" ? "" : filters.department,
          position: filters.position === "all" ? "" : filters.position,
        });
        if (cancelled) return;
        setRecords(payload.records || []);
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          navigate("/manager/login", { replace: true, state: { from: location.pathname } });
          return;
        }
        if (!cancelled) {
          setError(caughtError.message || "Không thể tải dữ liệu chấm công.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [filters, location.pathname, navigate, setUnauthenticated]);

  function applyPeriod(nextPeriod) {
    const range = nextPeriod === "weekly" ? getWeekRange() : nextPeriod === "monthly" ? getMonthRange() : getTodayRange();
    setPeriod(nextPeriod);
    setFilters((current) => ({
      ...current,
      ...range,
    }));
  }

  const departmentOptions = useMemo(() => {
    const values = new Set((employees || []).map((employee) => employee.department).filter(Boolean));
    return ["all", ...Array.from(values)];
  }, [employees]);

  const positionOptions = useMemo(() => {
    const scopedEmployees =
      filters.department === "all"
        ? employees
        : employees.filter((employee) => (employee.department || "Văn phòng") === filters.department);
    const values = new Set((scopedEmployees || []).map((employee) => employee.position).filter(Boolean));
    return ["all", ...Array.from(values)];
  }, [employees, filters.department]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => filters.status === "all" || getStatusValue(record) === filters.status);
  }, [filters.status, records]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Điều phối chấm công</span>
          <h1>Lịch sử chấm công với bộ lọc theo thời gian, phòng ban và chức vụ</h1>
          <p className="text-secondary">Theo dõi sự kiện check-in, độ khớp AI, phòng ban, chức vụ và truy cập nhanh ảnh chụp gốc.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => exportCsv(filteredRecords)} disabled={filteredRecords.length === 0}>
          Tải báo cáo CSV
        </button>
      </div>

      <div className="tab-switch">
        <button type="button" className={period === "daily" ? "active" : ""} onClick={() => applyPeriod("daily")}>
          Theo ngày
        </button>
        <button type="button" className={period === "weekly" ? "active" : ""} onClick={() => applyPeriod("weekly")}>
          Theo tuần
        </button>
        <button type="button" className={period === "monthly" ? "active" : ""} onClick={() => applyPeriod("monthly")}>
          Theo tháng
        </button>
      </div>

      <section className="attendance-filters glass-panel">
        <div className="field">
          <label htmlFor="attendance-from">Từ ngày</label>
          <input id="attendance-from" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="attendance-to">Đến ngày</label>
          <input id="attendance-to" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="attendance-search">Tìm nhân viên</label>
          <input
            id="attendance-search"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Tìm theo mã NV hoặc tên"
          />
        </div>
        <div className="field">
          <label htmlFor="attendance-department">Phòng ban</label>
          <select
            id="attendance-department"
            value={filters.department}
            onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value, position: "all" }))}
          >
            {departmentOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Tất cả phòng ban" : option}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="attendance-position">Chức vụ</label>
          <select id="attendance-position" value={filters.position} onChange={(event) => setFilters((current) => ({ ...current, position: event.target.value }))}>
            {positionOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Tất cả chức vụ" : option}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="attendance-status">Trạng thái</label>
          <select id="attendance-status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="all">Tất cả</option>
            <option value="on_time">Đúng giờ</option>
            <option value="late">Đi muộn</option>
          </select>
        </div>
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Đang tải dữ liệu chấm công...
        </div>
      ) : (
        <section className="glass-panel attendance-table-wrap">
          {filteredRecords.length === 0 ? (
            <div className="empty-state">
              <h3>Không có bản ghi phù hợp</h3>
              <p>Thử thay đổi bộ lọc thời gian, phòng ban, chức vụ hoặc từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Phòng ban</th>
                    <th>Chức vụ</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                    <th>Độ khớp</th>
                    <th>Địa điểm</th>
                    <th>Ảnh chụp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.full_name}</strong>
                        <div className="text-secondary">{record.employee_code}</div>
                      </td>
                      <td>{record.department || "Văn phòng"}</td>
                      <td>{record.position || "Nhân viên"}</td>
                      <td>{new Date(record.checked_in_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${getStatusValue(record) === "late" ? "badge-warning" : "badge-success"}`}>{getStatus(record)}</span>
                      </td>
                      <td>{getConfidence(record)}</td>
                      <td>Cổng chính</td>
                      <td>
                        <a className="btn btn-ghost btn-sm" href={record.snapshot_url} target="_blank" rel="noreferrer">
                          Xem ảnh
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
