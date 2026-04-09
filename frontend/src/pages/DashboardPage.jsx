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

function translateStatus(status) {
  if (status === "Late") return "Đi muộn";
  if (status === "On-time") return "Đúng giờ";
  return status || "Chưa xác định";
}

const chartDays = ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"];

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
          setError(caughtError.message || "Không thể tải trang tổng quan.");
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
      label: "Tổng lượt chấm hôm nay",
      value: summary.checked_in_today ?? 0,
      delta: `${summary.attendance_rate ?? 0}% tỷ lệ bao phủ`,
    },
    {
      label: "Đúng giờ",
      value: summary.on_time_today ?? 0,
      delta: "So với mốc mục tiêu 09:00",
    },
    {
      label: "Đi muộn",
      value: summary.late_today ?? 0,
      delta: "Cảnh báo chấm công theo thời gian thực",
    },
    {
      label: "Lỗi / chưa chấm",
      value: (summary.failed_scans_today ?? 0) + (summary.absent_today ?? 0),
      delta: "Cần rà soát thủ công",
    },
  ];

  return (
    <div className="dashboard-shell page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Tổng quan Guardian AI</span>
          <h1>Điều phối chấm công doanh nghiệp theo thời gian thực</h1>
          <p className="text-secondary">
            Tổng hợp KPI, xu hướng tháng, sự kiện camera và danh sách nhân viên cần theo dõi ngay trong một trung tâm điều phối.
          </p>
        </div>
        <div className="pill">Đồng bộ thời gian thực đang bật</div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Đang tải trang tổng quan Guardian AI...
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
                  <span className="section-label">Xu hướng chấm công</span>
                  <h2>Biểu đồ theo ngày trong tuần</h2>
                </div>
                <span className="pill">{summary.monthly_attendance_count ?? 0} bản ghi trong tháng</span>
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
                  <span>Tỷ lệ điểm danh hôm nay</span>
                </div>
                <div>
                  <strong>{summary.absent_today ?? 0}</strong>
                  <span>Nhân viên cần theo dõi</span>
                </div>
                <div>
                  <strong>{summary.failed_scans_today ?? 0}</strong>
                  <span>Lượt quét lỗi cần cảnh báo</span>
                </div>
              </div>
            </article>

            <article className="glass-panel quick-insights">
              <div className="stack-sm">
                <span className="section-label">Tín hiệu AI</span>
                <h2>Cảnh báo thông minh</h2>
              </div>

              <div className="insight-list">
                <div className="insight-card">
                  <span className="badge badge-success">Ổn định</span>
                  <strong>Camera điểm danh sẵn sàng</strong>
                  <p className="text-secondary">Nền tảng đang duy trì luồng quét ổn định và phiên quản trị hợp lệ.</p>
                </div>
                <div className="insight-card">
                  <span className="badge badge-warning">Theo dõi</span>
                  <strong>{summary.late_today ?? 0} nhân viên đi muộn</strong>
                  <p className="text-secondary">Theo dõi khung giờ cao điểm và cảnh báo cho bộ phận vận hành.</p>
                </div>
                <div className="insight-card">
                  <span className="badge badge-error">Rà soát</span>
                  <strong>{summary.absent_today ?? 0} chưa chấm công</strong>
                  <p className="text-secondary">Kiểm tra danh sách vắng và xử lý xác nhận bằng tay nếu cần.</p>
                </div>
              </div>
            </article>

            <article className="glass-panel daily-log-panel">
              <div className="row-between">
                <div className="stack-sm">
                  <span className="section-label">Nhận diện gần đây</span>
                  <h2>Nhật ký điểm danh hôm nay</h2>
                </div>
                <span className="pill">{dailyLog.length} sự kiện mới nhất</span>
              </div>

              {dailyLog.length === 0 ? (
                <div className="empty-state">
                  <h3>Chưa có lượt điểm danh hôm nay</h3>
                  <p>Dữ liệu sẽ hiển thị tại đây ngay khi camera nhận diện thành công.</p>
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
                        <span className={`badge ${item.status === "Late" ? "badge-warning" : "badge-success"}`}>
                          {translateStatus(item.status)}
                        </span>
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
