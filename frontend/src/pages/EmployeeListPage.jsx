import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { createEmployee, fetchDashboardSummary, getEmployees } from "../lib/api";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

function buildDepartment(employee) {
  return employee.position || "Nhan vien";
}

function getPerformance(employee) {
  const worked = employee.total_days_worked || 0;
  const absent = employee.absent_count || 0;
  const total = worked + absent || 1;
  return Math.max(0, Math.min(100, Math.round((worked / total) * 100)));
}

function getStatus(employee) {
  const performance = getPerformance(employee);
  if (performance >= 85) return { label: "Tot", tone: "success" };
  if (performance >= 60) return { label: "Canh bao", tone: "warning" };
  return { label: "Van de", tone: "error" };
}

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const { setUnauthenticated } = useManagerAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  async function loadEmployees() {
    setLoading(true);
    setMessage("");

    try {
      const [employeePayload, dashboardPayload] = await Promise.all([getEmployees(), fetchDashboardSummary()]);
      const statsById = new Map((dashboardPayload.employee_stats || []).map((item) => [item.id, item]));
      const merged = (employeePayload.employees || []).map((employee) => ({
        ...employee,
        ...(statsById.get(employee.id) || {}),
      }));
      setEmployees(merged);
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(error.message || "Khong the tai danh sach nhan vien.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await createEmployee({
        employee_code: code.trim(),
        full_name: fullName.trim(),
        position: position.trim(),
      });
      setCode("");
      setFullName("");
      setPosition("");
      await loadEmployees();
      setMessage("Da them nhan vien moi vao he thong.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Khong the tao nhan vien moi."));
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  const departments = useMemo(() => {
    const values = new Set(employees.map((employee) => buildDepartment(employee)));
    return ["all", ...values];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchSearch =
        !normalized ||
        employee.full_name?.toLowerCase().includes(normalized) ||
        employee.employee_code?.toLowerCase().includes(normalized);
      const matchDepartment = department === "all" || buildDepartment(employee) === department;
      return matchSearch && matchDepartment;
    });
  }, [department, employees, search]);

  return (
    <div className="page-shell employee-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Employee Intelligence</span>
          <h1>Quan ly nhan vien, hieu suat va du lieu khuon mat</h1>
          <p className="text-secondary">
            Search, filter, quan sat hieu suat thang va truy cap nhanh luong dang ky khuon mat cho tung nhan vien.
          </p>
        </div>
      </div>

      {message ? <div className={`alert alert-${messageType}`}>{message}</div> : null}

      <section className="employee-grid">
        <article className="glass-panel employee-table-panel">
          <div className="row-between employee-toolbar">
            <div className="stack-sm">
              <span className="section-label">Directory</span>
              <h2>Bang nhan vien nang cao</h2>
            </div>

            <div className="employee-filters">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ten hoac ma NV" />
              <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                {departments.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "Tat ca phong ban" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner" />
              Dang tai bang nhan vien...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="empty-state">
              <h3>Khong tim thay nhan vien</h3>
              <p>Thu doi tu khoa tim kiem hoac bo loc phong ban.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhan vien</th>
                    <th>Phong ban</th>
                    <th>Tong ngay</th>
                    <th>On-time</th>
                    <th>Late</th>
                    <th>Vang</th>
                    <th>Hieu suat</th>
                    <th>Trang thai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => {
                    const status = getStatus(employee);
                    const performance = getPerformance(employee);
                    return (
                      <tr key={employee.id}>
                        <td>
                          <div className="employee-name-cell">
                            <div className="employee-avatar">{employee.full_name?.slice(0, 2)?.toUpperCase() || "AI"}</div>
                            <div className="stack-sm">
                              <strong>{employee.full_name}</strong>
                              <span className="text-secondary">{employee.employee_code}</span>
                            </div>
                          </div>
                        </td>
                        <td>{buildDepartment(employee)}</td>
                        <td>{employee.total_days_worked ?? 0}</td>
                        <td>{employee.on_time_count ?? 0}</td>
                        <td>{employee.late_count ?? 0}</td>
                        <td>{employee.absent_count ?? 0}</td>
                        <td style={{ minWidth: 160 }}>
                          <div className="stack-sm">
                            <strong>{performance}%</strong>
                            <div className="progress">
                              <span style={{ width: `${performance}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-${status.tone}`}>{status.label}</span>
                        </td>
                        <td>
                          <Link className="btn btn-ghost btn-sm" to={`/manager/employees/${employee.id}/faces`}>
                            Khuon mat
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="glass-panel employee-create-panel">
          <div className="stack-sm">
            <span className="section-label">Create New Profile</span>
            <h2>Them nhan vien moi</h2>
            <p className="text-secondary">Tao nhanh ho so nhan vien truoc khi thu thap bo 5 anh khuon mat.</p>
          </div>

          <form className="field-group" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="employee-code">Ma nhan vien</label>
              <input
                id="employee-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="VD: NV001"
              />
            </div>
            <div className="field">
              <label htmlFor="employee-name">Ho va ten</label>
              <input
                id="employee-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="VD: Nguyen Van A"
              />
            </div>
            <div className="field">
              <label htmlFor="employee-position">Chuc vu</label>
              <input
                id="employee-position"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="VD: Le tan / Ky su / Quan ly"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="spinner" />
                  Dang tao...
                </>
              ) : (
                "Tao nhan vien"
              )}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
