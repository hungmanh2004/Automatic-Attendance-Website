import { Link } from "react-router-dom";
import { ScanFace, ShieldCheck, Users, BarChart3 } from "lucide-react";

const features = [
  {
    icon: ScanFace,
    title: "Nhận diện khuôn mặt",
    description: "Công nghệ AI phát hiện và nhận diện khuôn mặt trong thời gian thực, chính xác đến từng mili giây.",
  },
  {
    icon: ShieldCheck,
    title: "Bảo mật doanh nghiệp",
    description: "Dữ liệu khuôn mặt được mã hóa và lưu trữ an toàn trên hệ thống nội bộ của bạn.",
  },
  {
    icon: Users,
    title: "Quản lý nhân sự",
    description: "Theo dõi hiệu suất, thống kê chấm công và quản lý hồ sơ nhân viên toàn diện.",
  },
  {
    icon: BarChart3,
    title: "Báo cáo thông minh",
    description: "Tự động tổng hợp dữ liệu, xuất báo cáo và phân tích xu hướng chấm công.",
  },
];

export function LandingPage() {
  return (
    <main className="landing-shell page-transition">
      <section className="landing-hero">
        <div className="landing-hero-content">
          <span className="section-label">Nền tảng Guardian AI</span>
          <h1>
            Điểm danh khuôn mặt
            <br />
            <span className="landing-gradient-text">thông minh cho doanh nghiệp</span>
          </h1>
          <p className="text-secondary" style={{ fontSize: "1.05rem", maxWidth: "52ch", lineHeight: 1.7 }}>
            Hệ thống chấm công tự động bằng nhận diện khuôn mặt AI.
            Chính xác, nhanh chóng và không cần tiếp xúc.
          </p>

          <div className="landing-cta-group">
            <Link className="btn btn-primary" to="/guest">
              <ScanFace size={20} />
              Điểm danh khuôn mặt
            </Link>
            <Link className="btn btn-secondary" to="/manager/login">
              <ShieldCheck size={20} />
              Khu quản trị
            </Link>
          </div>
        </div>

        <div className="landing-hero-visual">
          <div className="landing-scan-demo">
            <div className="landing-scan-ring" />
            <div className="landing-scan-ring landing-scan-ring-2" />
            <div className="landing-scan-icon">
              <ScanFace size={64} />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-features-header">
          <span className="section-label">Tính năng nổi bật</span>
          <h2>Tất cả trong một nền tảng</h2>
        </div>

        <div className="landing-features-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="landing-feature-card glass-panel">
                <div className="landing-feature-icon">
                  <Icon size={24} />
                </div>
                <h3>{feature.title}</h3>
                <p className="text-secondary">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="landing-footer">
        <p className="text-muted">Guardian AI · Hệ thống điểm danh khuôn mặt thông minh</p>
      </footer>
    </main>
  );
}

export default LandingPage;
