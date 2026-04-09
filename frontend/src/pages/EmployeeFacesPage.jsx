import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { deleteFaceSamples, enrollFaceSamples, getFaceSamples, replaceEmployeeFaceSample } from "../lib/api";
import { getFriendlyErrorMessage } from "../lib/errorMessages";

const TOTAL_SLOTS = 5;

export default function EmployeeFacesPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { setUnauthenticated } = useManagerAuth();
  const [employee, setEmployee] = useState(null);
  const [faceSamples, setFaceSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState(null);

  async function loadFaceSamples() {
    setLoading(true);
    setMessage("");

    try {
      const response = await getFaceSamples(employeeId);
      setEmployee(response.employee);
      setFaceSamples(response.face_samples || []);
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(error.message || "Không thể tải dữ liệu khuôn mặt.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFaceSamples();
  }, [employeeId]);

  async function handleEnroll(event) {
    event.preventDefault();
    setMessage("");

    if (files.length !== TOTAL_SLOTS) {
      setMessage(`Cần chọn đúng ${TOTAL_SLOTS} ảnh khuôn mặt.`);
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    try {
      await enrollFaceSamples(employeeId, files);
      setFiles([]);
      await loadFaceSamples();
      setMessage("Đã cập nhật bộ khuôn mặt nhân viên.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Không thể đăng ký khuôn mặt."));
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage("");
    try {
      await deleteFaceSamples(employeeId);
      await loadFaceSamples();
      setMessage("Đã xóa bộ khuôn mặt hiện tại.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Không thể xóa bộ khuôn mặt."));
      setMessageType("error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleReplaceSample(sampleIndex, file) {
    if (!file) return;

    setReplacingIndex(sampleIndex);
    setMessage("");

    try {
      await replaceEmployeeFaceSample(employeeId, sampleIndex, file);
      await loadFaceSamples();
      setMessage(`Đã cập nhật ảnh mẫu ${sampleIndex}.`);
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, `Không thể cập nhật ảnh mẫu ${sampleIndex}.`));
      setMessageType("error");
    } finally {
      setReplacingIndex(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Phòng thí nghiệm khuôn mặt</span>
          <h1>Quản lý bộ 5 ảnh khuôn mặt AI</h1>
          <p className="text-secondary">{employee ? `${employee.employee_code} · ${employee.full_name}` : "Đang tải thông tin nhân viên..."}</p>
        </div>
        <Link className="btn btn-secondary" to="/manager/employees">
          Quay lại nhân viên
        </Link>
      </div>

      {message ? <div className={`alert alert-${messageType}`}>{message}</div> : null}

      <section className="employee-grid">
        <article className="glass-panel employee-table-panel">
          <div className="row-between">
            <div className="stack-sm">
              <span className="section-label">Mẫu đã đăng ký</span>
              <h2>Mẫu khuôn mặt hiện tại</h2>
            </div>
            <span className={`badge ${faceSamples.length === TOTAL_SLOTS ? "badge-success" : "badge-warning"}`}>
              {faceSamples.length}/{TOTAL_SLOTS} mẫu
            </span>
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner" />
              Đang tải dữ liệu khuôn mặt...
            </div>
          ) : (
            <div className="face-grid">
              {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
                const sampleIndex = index + 1;
                const sample = faceSamples.find((item) => item.sample_index === sampleIndex);
                return (
                  <div key={sampleIndex} className={`face-slot ${sample ? "is-filled" : ""}`}>
                    <strong>{`Mẫu ${sampleIndex}`}</strong>
                    {sample?.image_url ? (
                      <img className="face-thumb" src={sample.image_url} alt={`Mẫu ${sampleIndex}`} />
                    ) : (
                      <div className="face-thumb-placeholder">Chưa có ảnh</div>
                    )}
                    <span>{sample ? "Đã sẵn sàng nhận diện" : "Đang chờ ảnh mới"}</span>
                    <label className="btn btn-ghost btn-sm">
                      {replacingIndex === sampleIndex ? "Đang cập nhật..." : sample ? "Sửa ảnh này" : "Thêm ảnh này"}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={replacingIndex === sampleIndex}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void handleReplaceSample(sampleIndex, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {faceSamples.length > 0 ? (
            <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={deleting || loading}>
              {deleting ? "Đang xóa..." : "Xóa toàn bộ khuôn mặt"}
            </button>
          ) : null}
        </article>

        <article className="glass-panel employee-create-panel">
          <div className="stack-sm">
            <span className="section-label">Bộ tải lên</span>
            <h2>Tải lên 5 ảnh huấn luyện</h2>
            <p className="text-secondary">Dùng 5 ảnh rõ mặt, ánh sáng ổn định, nhiều góc nhìn để AI tạo bộ embedding chính xác.</p>
          </div>

          <form className="field-group" onSubmit={handleEnroll}>
            <div className="field">
              <label htmlFor="face-files">Ảnh khuôn mặt</label>
              <input id="face-files" type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            </div>
            <div className="pill">
              {files.length} / {TOTAL_SLOTS} ảnh đã chọn
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="spinner" />
                  Đang xử lý AI...
                </>
              ) : (
                "Đăng ký khuôn mặt"
              )}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
