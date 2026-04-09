import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { createEmployee, deleteEmployee, fetchDashboardSummary, getEmployees, updateEmployee } from "../lib/api";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

function getPerformance(employee) {
  const worked = employee.total_days_worked || 0;
  const absent = employee.absent_count || 0;
  const total = worked + absent || 1;
  return Math.max(0, Math.min(100, Math.round((worked / total) * 100)));
}

function getStatus(employee) {
  const performance = getPerformance(employee);
  if (performance >= 85) return { label: "Tốt", tone: "success" };
  if (performance >= 60) return { label: "Cảnh báo", tone: "warning" };
  return { label: "Vấn đề", tone: "error" };
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
  const [departmentName, setDepartmentName] = useState("");
  const [position, setPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editDepartmentName, setEditDepartmentName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

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
      setMessage(error.message || "Không thể tải danh sách nhân viên.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await createEmployee({
        employee_code: code.trim(),
        full_name: fullName.trim(),
        department: departmentName.trim(),
        position: position.trim(),
      });
      setCode("");
      setFullName("");
      setDepartmentName("");
      setPosition("");
      await loadEmployees();
      setMessage("Đã thêm nhân viên mới vào hệ thống.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Không thể tạo nhân viên mới."));
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(employee) {
    setEditingId(employee.id);
    setEditCode(employee.employee_code || "");
    setEditFullName(employee.full_name || "");
    setEditDepartmentName(employee.department || "");
    setEditPosition(employee.position || "");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCode("");
    setEditFullName("");
    setEditDepartmentName("");
    setEditPosition("");
  }

  async function handleUpdate(employeeId) {
    setActionLoading(true);
    setMessage("");

    try {
      await updateEmployee(employeeId, {
        employee_code: editCode.trim(),
        full_name: editFullName.trim(),
        department: editDepartmentName.trim(),
        position: editPosition.trim(),
      });
      cancelEdit();
      await loadEmployees();
      setMessage("Đã cập nhật nhân viên.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Không thể cập nhật nhân viên."));
      setMessageType("error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(employeeId) {
    const confirmed = window.confirm("Bạn có chắc muốn xóa nhân viên này?");
    if (!confirmed) return;

    setActionLoading(true);
    setMessage("");

    try {
      await deleteEmployee(employeeId);
      if (editingId === employeeId) {
        cancelEdit();
      }
      await loadEmployees();
      setMessage("Đã xóa nhân viên và vô hiệu hóa dữ liệu nhận diện.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Không thể xóa nhân viên."));
      setMessageType("error");
    } finally {
      setActionLoading(false);
    }
  }

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.is_active !== false), [employees]);

  const departments = useMemo(() => {
    const values = new Set(activeEmployees.map((employee) => employee.department || "Văn phòng"));
    return ["all", ...values];
  }, [activeEmployees]);

  const positions = useMemo(() => {
    const values = new Set(activeEmployees.map((employee) => employee.position || "Nhân viên"));
    return values;
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return activeEmployees.filter((employee) => {
      const matchSearch =
        !normalized ||
        employee.full_name?.toLowerCase().includes(normalized) ||
        employee.employee_code?.toLowerCase().includes(normalized);
      const matchDepartment = department === "all" || (employee.department || "Văn phòng") === department;
      return matchSearch && matchDepartment;
    });
  }, [activeEmployees, department, search]);

  return (
    <div className="page-shell employee-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Phân tích nhân sự</span>
          <h1>Quản lý nhân viên, hiệu suất và dữ liệu khuôn mặt</h1>
          <p className="text-secondary">Tìm kiếm, lọc, quan sát hiệu suất tháng và truy cập nhanh luồng đăng ký khuôn mặt cho từng nhân viên.</p>
        </div>
      </div>

      {message ? <div className={`alert alert-${messageType}`}>{message}</div> : null}

      <section className="employee-grid">
        <article className="glass-panel employee-table-panel">
          <div className="row-between employee-toolbar">
            <div className="stack-sm">
              <span className="section-label">Danh bạ nhân viên</span>
              <h2>Bảng nhân viên nâng cao</h2>
            </div>

            <div className="employee-filters">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã nhân viên" />
              <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                {departments.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "Tất cả phòng ban" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner" />
              Đang tải bảng nhân viên...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="empty-state">
              <h3>Không tìm thấy nhân viên</h3>
              <p>Thử đổi từ khóa tìm kiếm hoặc bộ lọc phòng ban.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Phòng ban</th>
                    <th>Chức vụ</th>
                    <th>Tổng ngày</th>
                    <th>Đúng giờ</th>
                    <th>Đi muộn</th>
                    <th>Vắng</th>
                    <th>Hiệu suất</th>
                    <th>Trạng thái</th>
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
                          {editingId === employee.id ? (
                            <div className="stack-sm">
                              <input aria-label={`Họ và tên ${employee.employee_code}`} value={editFullName} onChange={(event) => setEditFullName(event.target.value)} placeholder="Họ và tên" />
                              <input aria-label={`Mã nhân viên ${employee.employee_code}`} value={editCode} onChange={(event) => setEditCode(event.target.value)} placeholder="Mã nhân viên" />
                            </div>
                          ) : (
                            <div className="employee-name-cell">
                              <div className="employee-avatar">{employee.full_name?.slice(0, 2)?.toUpperCase() || "AI"}</div>
                              <div className="stack-sm">
                                <strong>{employee.full_name}</strong>
                                <span className="text-secondary">{employee.employee_code}</span>
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          {editingId === employee.id ? (
                            <input aria-label={`Phòng ban ${employee.employee_code}`} value={editDepartmentName} onChange={(event) => setEditDepartmentName(event.target.value)} placeholder="Phòng ban" />
                          ) : (
                            employee.department || "Văn phòng"
                          )}
                        </td>
                        <td>
                          {editingId === employee.id ? (
                            <input
                              aria-label={`Chức vụ ${employee.employee_code}`}
                              value={editPosition}
                              onChange={(event) => setEditPosition(event.target.value)}
                              placeholder="Chức vụ"
                              list="employee-position-options"
                            />
                          ) : (
                            employee.position || "Nhân viên"
                          )}
                        </td>
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
                          <div className="row-actions">
                            <Link className="btn btn-ghost btn-sm" to={`/manager/employees/${employee.id}/faces`}>
                              Khuôn mặt
                            </Link>
                            {editingId === employee.id ? (
                              <>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleUpdate(employee.id)} disabled={actionLoading}>
                                  Lưu
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={actionLoading}>
                                  Hủy
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(employee)} disabled={actionLoading}>
                                  Sửa
                                </button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(employee.id)} disabled={actionLoading}>
                                  Xóa
                                </button>
                              </>
                            )}
                          </div>
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
            <span className="section-label">Tạo hồ sơ mới</span>
            <h2>Thêm nhân viên mới</h2>
            <p className="text-secondary">Tạo nhanh hồ sơ nhân viên trước khi thu thập bộ 5 ảnh khuôn mặt.</p>
          </div>

          <form className="field-group" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="employee-code">Mã nhân viên</label>
              <input id="employee-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="VD: NV001" />
            </div>
            <div className="field">
              <label htmlFor="employee-name">Họ và tên</label>
              <input id="employee-name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="VD: Nguyễn Văn A" />
            </div>
            <div className="field">
              <label htmlFor="employee-position">Chức vụ</label>
              <input id="employee-position" value={position} onChange={(event) => setPosition(event.target.value)} placeholder="VD: Lễ tân / Kỹ sư / Quản lý" list="employee-position-options" />
            </div>
            <div className="field">
              <label htmlFor="employee-department">Phòng ban</label>
              <input id="employee-department" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="VD: Kinh doanh / Kỹ thuật / Nhân sự" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="spinner" />
                  Đang tạo...
                </>
              ) : (
                "Tạo nhân viên"
              )}
            </button>
          </form>
          <datalist id="employee-position-options">
            {Array.from(positions).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </article>
      </section>
    </div>
  );
}
