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
      setMessage(getFriendlyErrorMessage(error, "Khong the dang nhap manager."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="kiosk-shell page-transition" style={{ placeContent: "center" }}>
      <section className="glass-panel" style={{ maxWidth: 480, margin: "0 auto", padding: 32, display: "grid", gap: 24 }}>
        <div className="stack-sm">
          <span className="section-label">Guardian AI Access</span>
          <h1>Manager Secure Login</h1>
          <p className="text-secondary">Dang nhap de quan tri kiosk, nhan vien, lich su camera va bao cao AI.</p>
        </div>

        <form className="field-group" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="manager-user">Ten dang nhap</label>
            <input
              id="manager-user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="admin"
            />
          </div>

          <div className="field">
            <label htmlFor="manager-pass">Mat khau</label>
            <input
              id="manager-pass"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Nhap mat khau"
            />
          </div>

          {message ? <div className="alert alert-error">{message}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <div className="spinner" />
                Dang xac thuc...
              </>
            ) : (
              "Dang nhap manager"
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
