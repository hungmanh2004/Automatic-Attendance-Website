import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createEmployee, getEmployees } from "../lib/api";
import { getFriendlyErrorMessage } from "../lib/errorMessages";
import { useManagerAuth } from "../context/ManagerAuthContext";

export function EmployeeListPage() {
  const navigate = useNavigate();
  const { manager, setUnauthenticated } = useManagerAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadEmployees() {
    setLoading(true);
    setMessage("");

    try {
      const response = await getEmployees();
      setEmployees(response.employees || []);
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(error.message || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await createEmployee(code.trim(), fullName.trim());
      setCode("");
      setFullName("");
      await loadEmployees();
      setMessage("Employee created successfully");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Could not create employee. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <div className="compact">
        <p className="eyebrow">Employees</p>
        <h2>Roster management</h2>
        <p className="note">Signed in as {manager?.username ?? "manager"}.</p>
      </div>

      <div className="split">
        <section className="compact">
          <div className="row row-head" aria-hidden="true">
            <span>Code</span>
            <span>Name</span>
            <span>Status</span>
            <span>Faces</span>
          </div>
          {loading ? (
            <div className="muted-box">Loading employees...</div>
          ) : employees.length === 0 ? (
            <div className="muted-box">No employees yet.</div>
          ) : (
            <div className="table">
              {employees.map((employee) => (
                <div className="row" key={employee.id}>
                  <strong>{employee.employee_code}</strong>
                  <span>{employee.full_name}</span>
                  <span>{employee.is_active ? "Active" : "Inactive"}</span>
                  <Link className="btn btn-ghost" to={`/manager/employees/${employee.id}/faces`}>
                    Manage faces
                  </Link>
                </div>
              ))}
            </div>
          )}
          {message && (
            <p
              className={message.includes("successfully") ? "status" : "status error"}
              role={message.includes("successfully") ? undefined : "alert"}
            >
              {message}
            </p>
          )}
        </section>

        <section className="compact">
          <h3>Create employee</h3>
          <form className="field-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Employee code</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <label className="field">
              <span>Full name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create employee"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
