import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteFaceSamples, enrollFaceSamples, getFaceSamples } from "../lib/api";
import { getFriendlyErrorMessage } from "../lib/errorMessages";
import { useManagerAuth } from "../context/ManagerAuthContext";

export function EmployeeFacesPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { setUnauthenticated } = useManagerAuth();
  const [employee, setEmployee] = useState(null);
  const [faceSamples, setFaceSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
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
      if (error.status === 404) {
        setMessage("Employee not found");
        setEmployee(null);
        setFaceSamples([]);
        return;
      }
      setMessage(error.message || "Failed to load face samples");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFaceSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function handleEnroll(event) {
    event.preventDefault();
    setMessage("");

    if (files.length !== 5) {
      setMessage("Please select exactly 5 images.");
      return;
    }

    setSubmitting(true);

    try {
      await enrollFaceSamples(employeeId, files);
      setFiles([]);
      await loadFaceSamples();
      setMessage("Face enrollment completed successfully");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Could not enroll faces. Please try again."));
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
      setMessage("Face registration deleted successfully");
    } catch (error) {
      if (error.status === 401) {
        setUnauthenticated();
        navigate("/manager/login", { replace: true });
        return;
      }
      setMessage(getFriendlyErrorMessage(error, "Could not delete face registration. Please try again."));
    } finally {
      setDeleting(false);
    }
  }

  const sampleCount = faceSamples.length;

  return (
    <div className="stack">
      <div className="compact">
        <p className="eyebrow">Face registration</p>
        <h2>Employee face management</h2>
        <p className="note">
          {employee ? `${employee.employee_code} - ${employee.full_name}` : "Loading employee..."}
        </p>
      </div>

      <div className="split">
        <section className="compact">
          <h3>Current face samples</h3>
          {loading ? (
            <div className="muted-box">Loading face samples...</div>
          ) : sampleCount === 0 ? (
            <div className="muted-box">No face samples registered.</div>
          ) : (
            <div className="preview-list">
              {faceSamples.map((sample) => (
                <div className="preview-item" key={sample.id}>
                  <strong>Sample {sample.sample_index}</strong>
                  <span className="note">{sample.image_path}</span>
                </div>
              ))}
            </div>
          )}

          <div className="action-row">
            <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={deleting || loading}>
              {deleting ? "Deleting..." : "Delete face registration"}
            </button>
            <Link className="btn btn-ghost" to="/manager/employees">
              Back to roster
            </Link>
          </div>
        </section>

        <section className="compact">
          <h3>Enroll 5 face images</h3>
          <form className="field-grid" onSubmit={handleEnroll}>
            <label className="field">
              <span>Face images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </label>
            <p className="note">Select exactly 5 images before submitting.</p>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Enrolling..." : "Enroll faces"}
            </button>
          </form>
        </section>
      </div>

      {message && (
        <p className={message.includes("successfully") ? "status" : "status error"} role={message.includes("successfully") ? undefined : "alert"}>
          {message}
        </p>
      )}
    </div>
  );
}
