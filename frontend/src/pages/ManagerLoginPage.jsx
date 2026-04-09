import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
    <main className="kiosk-shell page-transition" style={{ placeContent: "center" }}>
      <section className="glass-panel" style={{ maxWidth: 480, margin: "0 auto", padding: 32, display: "grid", gap: 24 }}>
        <div className="stack-sm">
          <span className="section-label">Truy cập Guardian AI</span>
          <h1>Đăng nhập quản trị</h1>
          <p className="text-secondary">Đăng nhập để quản lý kiosk, nhân viên, lịch sử camera và báo cáo AI.</p>
        </div>

        <form className="field-group" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="manager-user">Tên đăng nhập</label>
            <input
              id="manager-user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="admin"
            />
          </div>

          <div className="field">
            <label htmlFor="manager-pass">Mật khẩu</label>
            <input
              id="manager-pass"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
            />
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
      </section>
    </main>
  );
}
