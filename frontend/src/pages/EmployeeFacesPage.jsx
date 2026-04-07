import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { deleteFaceSamples, enrollFaceSamples, getFaceSamples } from "../lib/api";
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
      setMessage(error.message || "Khong the tai du lieu khuon mat.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFaceSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function handleEnroll(event) {
    event.preventDefault();
    setMessage("");

    if (files.length !== TOTAL_SLOTS) {
      setMessage(`Can chon dung ${TOTAL_SLOTS} anh khuon mat.`);
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    try {
      await enrollFaceSamples(employeeId, files);
      setFiles([]);
      await loadFaceSamples();
      setMessage("Da cap nhat bo khuon mat nhan vien.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Khong the dang ky khuon mat."));
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
      setMessage("Da xoa bo khuon mat hien tai.");
      setMessageType("success");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Khong the xoa bo khuon mat."));
      setMessageType("error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-info">
          <span className="section-label">Face Enrollment Lab</span>
          <h1>Quan ly bo 5 anh khuon mat AI</h1>
          <p className="text-secondary">
            {employee ? `${employee.employee_code} · ${employee.full_name}` : "Dang tai thong tin nhan vien..."}
          </p>
        </div>
        <Link className="btn btn-secondary" to="/manager/employees">
          Quay lai nhan vien
        </Link>
      </div>

      {message ? <div className={`alert alert-${messageType}`}>{message}</div> : null}

      <section className="employee-grid">
        <article className="glass-panel employee-table-panel">
          <div className="row-between">
            <div className="stack-sm">
              <span className="section-label">Registered Samples</span>
              <h2>Mau khuon mat hien tai</h2>
            </div>
            <span className={`badge ${faceSamples.length === TOTAL_SLOTS ? "badge-success" : "badge-warning"}`}>
              {faceSamples.length}/{TOTAL_SLOTS} mau
            </span>
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner" />
              Dang tai du lieu khuon mat...
            </div>
          ) : (
            <div className="face-grid">
              {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
                const sample = faceSamples[index];
                return (
                  <div key={index} className={`face-slot ${sample ? "is-filled" : ""}`}>
                    <strong>{sample ? `Mau ${sample.sample_index}` : `Slot ${index + 1}`}</strong>
                    <span>{sample ? "Embedding ready" : "Dang cho anh moi"}</span>
                  </div>
                );
              })}
            </div>
          )}

          {faceSamples.length > 0 ? (
            <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={deleting || loading}>
              {deleting ? "Dang xoa..." : "Xoa toan bo khuon mat"}
            </button>
          ) : null}
        </article>

        <article className="glass-panel employee-create-panel">
          <div className="stack-sm">
            <span className="section-label">Upload Kit</span>
            <h2>Tai len 5 anh huan luyen</h2>
            <p className="text-secondary">
              Dung 5 anh ro mat, anh sang on dinh, nhieu goc nhin de AI tao bo embedding chinh xac.
            </p>
          </div>

          <form className="field-group" onSubmit={handleEnroll}>
            <div className="field">
              <label htmlFor="face-files">Anh khuon mat</label>
              <input
                id="face-files"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </div>
            <div className="pill">{files.length} / {TOTAL_SLOTS} anh da chon</div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="spinner" />
                  Dang xu ly AI...
                </>
              ) : (
                "Dang ky khuon mat"
              )}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
