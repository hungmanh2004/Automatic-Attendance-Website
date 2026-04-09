import { Navigate, Route, Routes } from "react-router-dom";
import { ManagerAuthProvider } from "./context/ManagerAuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ManagerLayout from "./components/ManagerLayout";
import GuestCheckinPage from "./pages/GuestCheckinPage";
import ManagerLoginPage from "./pages/ManagerLoginPage";
import EmployeeListPage from "./pages/EmployeeListPage";
import EmployeeFacesPage from "./pages/EmployeeFacesPage";
import AttendancePage from "./pages/AttendancePage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";

export function App() {
  return (
    <ManagerAuthProvider>
      <Routes>
        <Route path="/" element={<GuestCheckinPage />} />
        <Route path="/guest" element={<GuestCheckinPage />} />
        <Route path="/manager/login" element={<ManagerLoginPage />} />
        <Route
          path="/manager"
          element={
            <ProtectedRoute>
              <ManagerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="employees" element={<EmployeeListPage />} />
          <Route path="employees/:employeeId/faces" element={<EmployeeFacesPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ManagerAuthProvider>
  );
}

export default App;
