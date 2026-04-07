import { useEffect, useMemo, useState } from "react";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { fetchDashboardSummary } from "../lib/api";
import "./DashboardPage.css";

function getTrendValue(current, total) {
  if (!total) return 0;
  return Math.max(8, Math.min(100, Math.round((current / total) * 100)));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const chartDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function DashboardPage() {
  const { setUnauthenticated } = useManagerAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const payload = await fetchDashboardSummary();
        if (cancelled) return;
        setDashboard(payload);
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          return;
        }
        if (!cancelled) {
          setError(caughtError.message || "Khong the tai dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [setUnauthenticated]);

  const summary = dashboard?.summary || {};
  const dailyLog = dashboard?.daily_log || [];
  const bars = useMemo(() => {
    const total = Math.max(summary.total_employees || 0, summary.monthly_attendance_count || 0, 1);
    return chartDays.map((day, index) => ({
      day,
      value: getTrendValue((summary.checked_in_today || 0) + index * 2, total + 12),
    }));
  }, [summary.checked_in_today, summary.monthly_attendance_count, summary.total_employees]);

  const kpis = [
    {
      label: "Tong luot cham hom nay",
      value: summary.checked_in_today ?? 0,
      delta: `${summary.attendance_rate ?? 0}% coverage`,
    },
    {
      label: "Dung gio",
      value: summary.on_time_today ?? 0,
      delta: "Compared with target 09:00",
    },
    {
      label: "Di muon",
      value: summary.late_today ?? 0,
      delta: "Realtime attendance warning",
    },
    {
      label: "Loi / khong cham",
      value: (summary.failed_scans_today ?? 0) + (summary.absent_today ?? 0),
      delta: "Need manual review",
    },
  ];

  return (
    <div className="dashboard-shell page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Guardian AI Dashboard</span>
          <h1>Dieu phoi cham cong doanh nghiep theo thoi gian thuc</h1>
          <p className="text-secondary">
            Tong hop KPI, xu huong thang, su kien camera va danh sach nhan vien can theo doi ngay trong mot command center.
          </p>
        </div>
        <div className="pill">Realtime sync active</div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Dang tai dashboard Guardian AI...
        </div>
      ) : null}

      {!loading ? (
        <>
          <section className="kpi-grid">
            {kpis.map((item) => (
              <article key={item.label} className="kpi-card page-transition">
                <span className="section-label">{item.label}</span>
                <strong>{item.value}</strong>
                <p className="text-secondary">{item.delta}</p>
              </article>
            ))}
          </section>

          <section className="dashboard-bento">
            <article className="glass-panel overview-chart">
              <div className="row-between">
                <div className="stack-sm">
                  <span className="section-label">Attendance Trend</span>
                  <h2>Bar chart theo ngay trong tuan</h2>
                </div>
                <span className="pill">{summary.monthly_attendance_count ?? 0} records this month</span>
              </div>

              <div className="bar-chart">
                {bars.map((item) => (
                  <div key={item.day} className="bar-column">
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${item.value}%` }} />
                    </div>
                    <span>{item.day}</span>
                  </div>
                ))}
              </div>

              <div className="line-summary">
                <div>
                  <strong>{summary.attendance_rate ?? 0}%</strong>
                  <span>Ty le diem danh hom nay</span>
                </div>
                <div>
                  <strong>{summary.absent_today ?? 0}</strong>
                  <span>Nhan vien can follow-up</span>
                </div>
                <div>
                  <strong>{summary.failed_scans_today ?? 0}</strong>
                  <span>Scan fail canh bao</span>
                </div>
              </div>
            </article>

            <article className="glass-panel quick-insights">
              <div className="stack-sm">
                <span className="section-label">AI Signals</span>
                <h2>Canh bao thong minh</h2>
              </div>

              <div className="insight-list">
                <div className="insight-card">
                  <span className="badge badge-success">Stable</span>
                  <strong>Camera kiosk san sang</strong>
                  <p className="text-secondary">Nen tang dang duy tri luong scan on dinh va session manager hop le.</p>
                </div>
                <div className="insight-card">
                  <span className="badge badge-warning">Watchlist</span>
                  <strong>{summary.late_today ?? 0} nhan vien di muon</strong>
                  <p className="text-secondary">Theo doi khuon gio cao diem va canh bao cho bo phan van hanh.</p>
                </div>
                <div className="insight-card">
                  <span className="badge badge-error">Review</span>
                  <strong>{summary.absent_today ?? 0} chua cham cong</strong>
                  <p className="text-secondary">Kiem tra danh sach vang va xu ly xac nhan bang tay neu can.</p>
                </div>
              </div>
            </article>

            <article className="glass-panel daily-log-panel">
              <div className="row-between">
                <div className="stack-sm">
                  <span className="section-label">Recent Recognition</span>
                  <h2>Nhat ky check-in hom nay</h2>
                </div>
                <span className="pill">{dailyLog.length} su kien moi nhat</span>
              </div>

              {dailyLog.length === 0 ? (
                <div className="empty-state">
                  <h3>Chua co check-in hom nay</h3>
                  <p>Du lieu se hien thi tai day ngay khi camera nhan dien thanh cong.</p>
                </div>
              ) : (
                <div className="recognition-feed">
                  {dailyLog.map((item) => (
                    <div key={item.id} className="recognition-item">
                      <div className="recognition-avatar">{item.full_name?.slice(0, 2)?.toUpperCase() || "AI"}</div>
                      <div className="stack-sm">
                        <strong>{item.full_name}</strong>
                        <span className="text-secondary">
                          {item.employee_code} · {formatTime(item.checked_in_at)}
                        </span>
                      </div>
                      <div className="recognition-side">
                        <span className={`badge ${item.status === "Late" ? "badge-warning" : "badge-success"}`}>{item.status}</span>
                        <strong>{item.confidence ?? "N/A"}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
