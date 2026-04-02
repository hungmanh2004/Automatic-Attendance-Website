import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, signIn, setError } = useManagerAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/manager/employees", { replace: true });
    }
  }, [navigate, status]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError(null);

    try {
      await signIn(username.trim(), password);
      navigate(location.state?.from || "/manager/employees", { replace: true });
    } catch (caughtError) {
      setMessage(getFriendlyErrorMessage(caughtError, "Unable to sign in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-frame">
        <section className="surface page-transition">
          <div className="stack">
            <p className="eyebrow">Manager access</p>
            <h2>Sign in to manage employees and face registrations.</h2>
            <form className="field-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>Username</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {message && (
                <p className="status error" role="alert">
                  {message}
                </p>
              )}
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
