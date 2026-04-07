import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const { status } = useManagerAuth();

  if (status === "loading") {
    return (
      <main className="kiosk-shell" style={{ placeContent: "center" }}>
        <div className="glass-panel" style={{ maxWidth: 420, margin: "0 auto", padding: 28 }}>
          <div className="loading-row">
            <div className="spinner" />
            Dang kiem tra phien dang nhap quan ly...
          </div>
        </div>
      </main>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/manager/login" replace state={{ from: location.pathname }} />;
  }

  return children ?? <Outlet />;
}

export default ProtectedRoute;
