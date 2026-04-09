import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-main)" }}>
      <div className="page-transition" style={{ width: "100%", maxWidth: 560, padding: "var(--sp-6)", textAlign: "center" }}>
        <div className="card-elevated" style={{ padding: "var(--sp-12) var(--sp-8)" }}>
          <div className="stack" style={{ alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-md)",
                background: "var(--brand-light)",
                display: "grid",
                placeItems: "center",
                fontSize: 28,
                marginBottom: "var(--sp-2)",
              }}
            >
              👤
            </div>

            <h1 style={{ fontSize: "1.75rem" }}>Điểm danh tự động</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "15px", maxWidth: "36ch", lineHeight: "var(--leading-relaxed)" }}>
              Hệ thống điểm danh bằng khuôn mặt. Chọn cách bạn muốn truy cập.
            </p>

            <div className="stack-sm" style={{ marginTop: "var(--sp-4)", width: "100%" }}>
              <Link className="btn btn-primary" to="/guest" style={{ width: "100%", padding: "12px 24px", fontSize: "15px" }}>
                📷 Điểm danh khuôn mặt
              </Link>
              <Link className="btn btn-secondary" to="/manager/login" style={{ width: "100%", padding: "12px 24px", fontSize: "15px" }}>
                🔐 Khu quản trị
              </Link>
            </div>

            <div style={{ marginTop: "var(--sp-6)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)", width: "100%" }}>
              <div style={{ padding: "var(--sp-4)", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", textAlign: "left" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>📷 Khu quét</p>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "var(--leading-relaxed)" }}>
                  Quét khuôn mặt qua camera trình duyệt để điểm danh tự động.
                </p>
              </div>
              <div style={{ padding: "var(--sp-4)", background: "var(--bg-main)", borderRadius: "var(--radius-sm)", textAlign: "left" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>🔐 Quản trị</p>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "var(--leading-relaxed)" }}>
                  Đăng nhập để quản lý nhân viên, đăng ký khuôn mặt và xem lịch sử điểm danh.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default LandingPage;
