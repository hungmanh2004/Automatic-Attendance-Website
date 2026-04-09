import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";

const navItems = [
  {
    to: "/manager/dashboard",
    icon: "AI",
    label: "Tổng quan",
    description: "KPI, xu hướng và cảnh báo thời gian thực",
  },
  {
    to: "/manager/employees",
    icon: "HR",
    label: "Nhân viên",
    description: "Hồ sơ, hiệu suất và khuôn mặt",
  },
  {
    to: "/manager/attendance",
    icon: "LOG",
    label: "Chấm công",
    description: "Lịch sử, bộ lọc và ảnh camera",
  },
  {
    to: "/manager/reports",
    icon: "CSV",
    label: "Báo cáo",
    description: "Xuất dữ liệu và thống kê kỳ",
  },
];

export default function ManagerLayout() {
  const { manager, logout } = useManagerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="manager-shell">
      <div className="manager-mobilebar">
        <div className="stack-sm">
          <span className="section-label">Nền tảng Guardian AI</span>
          <strong>Trung tâm điều phối chấm công</strong>
        </div>

        <button
          type="button"
          className="manager-menu-toggle"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <button type="button" className={`manager-backdrop${menuOpen ? " is-open" : ""}`} aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />

      <aside className={`manager-sidebar page-transition${menuOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="section-label">Nền tảng Guardian AI</span>
          <h2>Trung tâm điều phối chấm công</h2>
          <p>{manager?.username ? `Đăng nhập với ${manager.username}` : "Quản trị hệ thống chấm công AI doanh nghiệp."}</p>
        </div>

        <nav className="manager-nav" aria-label="Điều hướng quản trị">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="manager-logout" onClick={() => void handleLogout()}>
          <span className="nav-icon">OUT</span>
          <span className="nav-copy">
            <strong>Đăng xuất</strong>
            <span>Kết thúc phiên quản trị hiện tại</span>
          </span>
        </button>
      </aside>

      <main className="manager-main page-transition">
        <Outlet />
      </main>
    </div>
  );
}
