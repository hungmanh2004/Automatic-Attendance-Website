import { useEffect, useMemo, useState } from "react";

import { fetchDashboardSummary } from "../lib/api";
import { listAttendance } from "../lib/attendanceApi";
import { useManagerAuth } from "../context/ManagerAuthContext";

function exportFile(filename, rows) {
  const csv = rows.map((columns) => columns.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { setUnauthenticated } = useManagerAuth();
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [dashboardPayload, attendancePayload] = await Promise.all([
          fetchDashboardSummary(),
          listAttendance({}),
        ]);
        if (cancelled) return;
        setDashboard(dashboardPayload);
        setRecords(attendancePayload.records || []);
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          return;
        }
        if (!cancelled) {
          setError(caughtError.message || "Khong the tai du lieu bao cao.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [setUnauthenticated]);

  const cards = useMemo(() => {
    const summary = dashboard?.summary || {};
    return [
      ["Tong nhan vien", summary.total_employees ?? 0],
      ["Cham cong hom nay", summary.checked_in_today ?? 0],
      ["Attendance rate", `${summary.attendance_rate ?? 0}%`],
      ["Failed scans", summary.failed_scans_today ?? 0],
    ];
  }, [dashboard]);

  function handleExportAll() {
    exportFile("guardian-ai-report.csv", [
      ["Employee Code", "Full Name", "Checked In At", "Snapshot"],
      ...records.map((record) => [record.employee_code, record.full_name, record.checked_in_at, record.snapshot_url || ""]),
    ]);
  }

  function handleExportSummary() {
    exportFile("guardian-ai-summary.csv", [["Metric", "Value"], ...cards]);
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Reporting Hub</span>
          <h1>Trung tam bao cao va xuat du lieu</h1>
          <p className="text-secondary">
            Tao goi CSV nhanh cho KPI tong quan va lich su camera de chia se voi van hanh hoac HR.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Dang tai bo du lieu bao cao...
        </div>
      ) : (
        <>
          <section className="kpi-grid">
            {cards.map(([label, value]) => (
              <article key={label} className="kpi-card">
                <span className="section-label">{label}</span>
                <strong>{value}</strong>
                <p className="text-secondary">Guardian AI snapshot</p>
              </article>
            ))}
          </section>

          <section className="employee-grid">
            <article className="glass-panel employee-table-panel">
              <div className="stack-sm">
                <span className="section-label">Export Center</span>
                <h2>Tap lenh xuat bao cao</h2>
                <p className="text-secondary">
                  Chon loai file can chia se va tai ve ngay lap tuc theo du lieu hien co trong he thong.
                </p>
              </div>

              <div className="report-actions">
                <button type="button" className="btn btn-primary" onClick={handleExportAll}>
                  Tai lich su CSV
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleExportSummary}>
                  Tai KPI summary
                </button>
              </div>
            </article>

            <article className="glass-panel employee-create-panel">
              <div className="stack-sm">
                <span className="section-label">AI Notes</span>
                <h2>Goi y van hanh</h2>
              </div>
              <div className="insight-list">
                <div className="insight-card">
                  <strong>Export ngay cuoi tuan</strong>
                  <p className="text-secondary">Dung file lich su de doi chieu cham cong va camera snapshot.</p>
                </div>
                <div className="insight-card">
                  <strong>Review confidence thap</strong>
                  <p className="text-secondary">Danh sach confidence thap nen duoc xac minh lai bo mau khuon mat.</p>
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
