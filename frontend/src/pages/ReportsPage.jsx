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
        const [dashboardPayload, attendancePayload] = await Promise.all([fetchDashboardSummary(), listAttendance({})]);
        if (cancelled) return;
        setDashboard(dashboardPayload);
        setRecords(attendancePayload.records || []);
      } catch (caughtError) {
        if (caughtError?.status === 401) {
          setUnauthenticated();
          return;
        }
        if (!cancelled) {
          setError(caughtError.message || "Không thể tải dữ liệu báo cáo.");
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
      ["Tổng nhân viên", summary.total_employees ?? 0],
      ["Chấm công hôm nay", summary.checked_in_today ?? 0],
      ["Tỷ lệ điểm danh", `${summary.attendance_rate ?? 0}%`],
      ["Lượt quét lỗi", summary.failed_scans_today ?? 0],
    ];
  }, [dashboard]);

  function handleExportAll() {
    exportFile("bao-cao-lich-su-guardian-ai.csv", [
      ["Mã nhân viên", "Họ và tên", "Thời gian điểm danh", "Ảnh chụp"],
      ...records.map((record) => [record.employee_code, record.full_name, record.checked_in_at, record.snapshot_url || ""]),
    ]);
  }

  function handleExportSummary() {
    exportFile("tong-hop-kpi-guardian-ai.csv", [["Chỉ số", "Giá trị"], ...cards]);
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Trung tâm báo cáo</span>
          <h1>Trung tâm báo cáo và xuất dữ liệu</h1>
          <p className="text-secondary">Tạo gói CSV nhanh cho KPI tổng quan và lịch sử camera để chia sẻ với vận hành hoặc nhân sự.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          Đang tải bộ dữ liệu báo cáo...
        </div>
      ) : (
        <>
          <section className="kpi-grid">
            {cards.map(([label, value]) => (
              <article key={label} className="kpi-card">
                <span className="section-label">{label}</span>
                <strong>{value}</strong>
                <p className="text-secondary">Ảnh chụp nhanh từ Guardian AI</p>
              </article>
            ))}
          </section>

          <section className="employee-grid">
            <article className="glass-panel employee-table-panel">
              <div className="stack-sm">
                <span className="section-label">Khu xuất dữ liệu</span>
                <h2>Tập lệnh xuất báo cáo</h2>
                <p className="text-secondary">Chọn loại file cần chia sẻ và tải về ngay lập tức theo dữ liệu hiện có trong hệ thống.</p>
              </div>

              <div className="report-actions">
                <button type="button" className="btn btn-primary" onClick={handleExportAll}>
                  Tải lịch sử CSV
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleExportSummary}>
                  Tải tổng hợp KPI
                </button>
              </div>
            </article>

            <article className="glass-panel employee-create-panel">
              <div className="stack-sm">
                <span className="section-label">Gợi ý AI</span>
                <h2>Gợi ý vận hành</h2>
              </div>
              <div className="insight-list">
                <div className="insight-card">
                  <strong>Xuất báo cáo cuối tuần</strong>
                  <p className="text-secondary">Dùng file lịch sử để đối chiếu chấm công và ảnh chụp từ camera.</p>
                </div>
                <div className="insight-card">
                  <strong>Rà soát độ khớp thấp</strong>
                  <p className="text-secondary">Danh sách độ khớp thấp nên được xác minh lại bộ mẫu khuôn mặt.</p>
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
