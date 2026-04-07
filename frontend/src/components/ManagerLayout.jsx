import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";

const navItems = [
  {
    to: "/manager/dashboard",
    icon: "AI",
    label: "Tong quan",
    description: "KPI, trend va canh bao realtime",
  },
  {
    to: "/manager/employees",
    icon: "HR",
    label: "Nhan vien",
    description: "Ho so, hieu suat va khuon mat",
  },
  {
    to: "/manager/attendance",
    icon: "LOG",
    label: "Cham cong",
    description: "Lich su, bo loc va anh camera",
  },
  {
    to: "/manager/reports",
    icon: "CSV",
    label: "Bao cao",
    description: "Xuat du lieu va thong ke ky",
  },
];

export default function ManagerLayout() {
  const { manager, logout } = useManagerAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="manager-shell">
      <div className="manager-mobilebar">
        <div className="stack-sm">
          <span className="section-label">Guardian AI Suite</span>
          <strong>Attendance Command Center</strong>
        </div>

        <button
          type="button"
          className="manager-menu-toggle"
          aria-label={menuOpen ? "Dong menu" : "Mo menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <button
        type="button"
        className={`manager-backdrop${menuOpen ? " is-open" : ""}`}
        aria-label="Dong menu"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`manager-sidebar page-transition${menuOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="section-label">Guardian AI Suite</span>
          <h2>Attendance Command Center</h2>
          <p>{manager?.username ? `Dang nhap voi ${manager.username}` : "Quan tri he thong cham cong AI doanh nghiep."}</p>
        </div>

        <nav className="manager-nav" aria-label="Manager navigation">
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

        <button type="button" className="manager-logout" onClick={logout}>
          <span className="nav-icon">OUT</span>
          <span className="nav-copy">
            <strong>Dang xuat</strong>
            <span>Ket thuc phien quan tri hien tai</span>
          </span>
        </button>
      </aside>

      <main className="manager-main page-transition">
        <Outlet />
      </main>
    </div>
  );
}
