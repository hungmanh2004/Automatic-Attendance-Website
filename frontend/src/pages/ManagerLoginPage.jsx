import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, User, Lock, ArrowLeft } from "lucide-react";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

export default function ManagerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, signIn, setError } = useManagerAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/manager/dashboard", { replace: true });
    }
  }, [navigate, status]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError(null);

    try {
      await signIn(username.trim(), password);
      navigate(location.state?.from || "/manager/dashboard", { replace: true });
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error, "Không thể đăng nhập quản trị."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell page-transition">
      <div className="login-panel">
        <section className="login-brand-side">
          <div className="login-brand-content">
            <div className="login-brand-icon">
              <ShieldCheck size={48} />
            </div>
            <h1>Guardian AI</h1>
            <p>Hệ thống điểm danh khuôn mặt thông minh cho doanh nghiệp hiện đại.</p>

            <div className="login-brand-features">
              <div className="login-brand-feature">
                <span>✓</span> Nhận diện khuôn mặt thời gian thực
              </div>
              <div className="login-brand-feature">
                <span>✓</span> Quản lý nhân viên toàn diện
              </div>
              <div className="login-brand-feature">
                <span>✓</span> Báo cáo và phân tích thông minh
              </div>
            </div>
          </div>
        </section>

        <section className="login-form-side">
          <Link to="/" className="login-back-link">
            <ArrowLeft size={16} />
            Về trang chủ
          </Link>

          <div className="login-form-content">
            <div className="stack-sm">
              <span className="section-label">Truy cập Guardian AI</span>
              <h2 style={{ fontSize: "1.6rem" }}>Đăng nhập quản trị</h2>
              <p className="text-secondary">Đăng nhập để quản lý nhân viên, lịch sử camera và báo cáo.</p>
            </div>

            <form className="field-group" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="manager-user">Tên đăng nhập</label>
                <div className="login-input-wrapper">
                  <User size={18} className="login-input-icon" />
                  <input
                    id="manager-user"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="admin"
                    style={{ paddingLeft: 44 }}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="manager-pass">Mật khẩu</label>
                <div className="login-input-wrapper">
                  <Lock size={18} className="login-input-icon" />
                  <input
                    id="manager-pass"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    style={{ paddingLeft: 44 }}
                  />
                </div>
              </div>

              {message ? <div className="alert alert-error">{message}</div> : null}

              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <div className="spinner" />
                    Đang xác thực...
                  </>
                ) : (
                  "Đăng nhập quản trị"
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
