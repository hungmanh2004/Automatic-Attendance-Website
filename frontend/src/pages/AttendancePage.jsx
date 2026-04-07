import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { listAttendance } from "../lib/attendanceApi";
import "./AttendancePage.css";

function formatDate(value) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function getTodayRange() {
  const now = new Date();
  const value = formatDate(now);
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
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.getHours() < 9 || (date.getHours() === 9 && date.getMinutes() <= 0) ? "On-time" : "Late";
}

function getConfidence(record) {
  if (record.distance == null) return "N/A";
  return `${Math.max(0, Math.min(100, Math.round((1 - record.distance) * 1000) / 10))}%`;
}

function exportCsv(records) {
  const header = ["Nhan vien", "Thoi gian", "Trang thai", "Confidence", "Snapshot"];
  const rows = records.map((record) => [
    `${record.employee_code} - ${record.full_name}`,
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
  anchor.download = "guardian-attendance-report.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUnauthenticated } = useManagerAuth();
  const todayRange = useMemo(() => getTodayRange(), []);
  const [period, setPeriod] = useState("daily");
  const [filters, setFilters] = useState({ ...todayRange, search: "", status: "all" });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAttendance() {
      setLoading(true);
      setError("");

      try {
        const payload = await listAttendance(filters);
        if (cancelled) return;
        setRecords(payload.records || []);
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          navigate("/manager/login", { replace: true, state: { from: location.pathname } });
          return;
        }
        if (!cancelled) {
          setError(caughtError.message || "Khong the tai du lieu cham cong.");
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

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesStatus = filters.status === "all" || getStatus(record) === filters.status;
      return matchesStatus;
    });
  }, [filters.status, records]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Attendance Control</span>
          <h1>Lich su cham cong voi bo loc daily, weekly va monthly</h1>
          <p className="text-secondary">
            Theo doi su kien check-in, confidence AI, dia diem camera va truy cap nhanh snapshot goc.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => exportCsv(filteredRecords)} disabled={filteredRecords.length === 0}>
          Tai bao cao CSV
        </button>
      </div>

      <div className="tab-switch">
        <button type="button" className={period === "daily" ? "active" : ""} onClick={() => applyPeriod("daily")}>
          Daily
        </button>
        <button type="button" className={period === "weekly" ? "active" : ""} onClick={() => applyPeriod("weekly")}>
          Weekly
        </button>
        <button type="button" className={period === "monthly" ? "active" : ""} onClick={() => applyPeriod("monthly")}>
          Monthly
        </button>
      </div>

      <section className="attendance-filters glass-panel">
        <div className="field">
          <label htmlFor="attendance-from">Tu ngay</label>
          <input
            id="attendance-from"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="attendance-to">Den ngay</label>
          <input
            id="attendance-to"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="attendance-search">Nhan vien</label>
          <input
            id="attendance-search"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Tim theo ma NV hoac ten"
          />
        </div>
        <div className="field">
          <label htmlFor="attendance-status">Trang thai</label>
          <select
            id="attendance-status"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">Tat ca</option>
            <option value="On-time">On-time</option>
            <option value="Late">Late</option>
          </select>
        </div>
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Dang tai du lieu cham cong...
        </div>
      ) : (
        <section className="glass-panel attendance-table-wrap">
          {filteredRecords.length === 0 ? (
            <div className="empty-state">
              <h3>Khong co ban ghi phu hop</h3>
              <p>Thu thay doi bo loc thoi gian, trang thai hoac tu khoa tim kiem.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhan vien</th>
                    <th>Thoi gian</th>
                    <th>Trang thai</th>
                    <th>Confidence</th>
                    <th>Dia diem</th>
                    <th>Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.full_name}</strong>
                        <div className="text-secondary">{record.employee_code}</div>
                      </td>
                      <td>{new Date(record.checked_in_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${getStatus(record) === "Late" ? "badge-warning" : "badge-success"}`}>
                          {getStatus(record)}
                        </span>
                      </td>
                      <td>{getConfidence(record)}</td>
                      <td>Main Gate</td>
                      <td>
                        <a className="btn btn-ghost btn-sm" href={record.snapshot_url} target="_blank" rel="noreferrer">
                          Xem anh
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
