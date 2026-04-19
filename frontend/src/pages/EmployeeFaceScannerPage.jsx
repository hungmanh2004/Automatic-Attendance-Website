import "./EmployeeFaceScannerPage.override.css";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { useFaceRegistration } from "../hooks/useFaceRegistration";

function ActionPanel({ sessionStatus, acceptedCount, targetCount, canStart, errorMessage, onStart, onReset }) {
  if (sessionStatus === "success") {
    return (
      <div className="reg-success-banner">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span>Hoàn tất đăng ký khuôn mặt</span>
      </div>
    );
  }

  if (sessionStatus === "uploading") {
    return (
      <div className="reg-processing-panel">
        <div className="reg-spinner-ring" />
        <div className="reg-processing-text">
          <strong>Đang gửi lên hệ thống...</strong>
          <span>{acceptedCount} / {targetCount} ảnh đã sẵn sàng để đăng ký.</span>
        </div>
      </div>
    );
  }

  if (sessionStatus === "collecting") {
    return (
      <div className="reg-recording-panel">
        <div className="reg-countdown">
          <span className="reg-countdown-number">{acceptedCount}</span>
          <span className="reg-countdown-label">Đang thu thập / {targetCount} ảnh</span>
        </div>
        <div className="reg-progress-bar">
          <div
            className="reg-progress-fill"
            style={{ width: `${Math.min(100, Math.round((acceptedCount / Math.max(targetCount, 1)) * 100))}%` }}
          />
        </div>
        <div className="reg-recording-actions">
          <p className="reg-recording-hint">
            Xoay đầu chậm và đều để AI nhận thêm nhiều góc nhìn rõ nét.
          </p>
          <button type="button" className="btn btn-ghost btn-sm reg-inline-reset" onClick={onReset}>
            Hủy / Làm lại
          </button>
        </div>
      </div>
    );
  }

  if (sessionStatus === "error") {
    return (
      <div className="reg-error-panel">
        <span>{errorMessage || "Không thể hoàn tất đăng ký trong lượt vừa rồi."}</span>
        <button type="button" className="reg-btn reg-btn--retry" onClick={onReset}>
          Làm lại
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="reg-record-btn"
      onClick={onStart}
      disabled={!canStart}
    >
      <span className="reg-record-icon" />
      {`Bắt đầu thu thập (${targetCount} ảnh)`}
    </button>
  );
}

export default function EmployeeFaceScannerPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { setUnauthenticated } = useManagerAuth();

  const {
    videoRef,
    cameraState,
    cameraError,
    modelState,
    sessionStatus,
    acceptedCount,
    targetCount,
    thumbnailFrames,
    thumbnailLimit,
    liveFeedback,
    elapsedMs,
    softWarningVisible,
    saveMessage,
    saveState,
    canStart,
    canReset,
    employee,
    startRecording,
    resetRegistration,
  } = useFaceRegistration(employeeId, {
    onUnauthenticated: () => {
      setUnauthenticated();
      navigate("/manager/login", { replace: true });
    },
  });

  const previewSlots = Array.from({ length: thumbnailLimit }, (_, index) => thumbnailFrames[index] || null);
  const isCameraReady = cameraState === "ready";
  const isModelReady = modelState === "ready";
  const feedbackToneClass = `tone-${liveFeedback?.tone || "neutral"}`;

  return (
    <div className="page-shell simple-face-page">
      <div className="simple-face-layout">
        <aside className="simple-face-sidebar">
          <article className="glass-panel simple-face-card simple-employee-card">
            <div className="simple-employee-avatar">
              {employee.full_name?.slice(0, 2)?.toUpperCase() || "NV"}
            </div>
            <div className="stack-sm">
              <span className="section-label">
                Mã nhân viên: {employee.employee_code || employee.id}
              </span>
              <h2>{employee.full_name}</h2>
              <p className="text-secondary">
                {employee.department || "Chưa có phòng ban"}
              </p>
            </div>
            <div className="simple-employee-meta">
              <div>
                <span>Trạng thái</span>
                <strong>{employee.registration_status || "Chưa đăng ký"}</strong>
              </div>
              <div>
                <span>Tiến độ</span>
                <strong>{acceptedCount} / {targetCount} ảnh</strong>
              </div>
            </div>
          </article>

          <article className="glass-panel simple-face-card simple-instruction-card">
            <div className="stack-sm">
              <span className="section-label">Hướng dẫn</span>
              <h3>Đăng ký khuôn mặt</h3>
            </div>
            <div className="reg-instruction-body">
              <p>
                Nhấn <strong>Bắt đầu thu thập</strong>, giữ khuôn mặt trong vùng oval
                rồi xoay nhẹ đầu sang trái, phải, lên, xuống. Hệ thống sẽ tự gom
                đủ ảnh rõ nét thay vì bắt bạn quay theo countdown cố định.
              </p>
              <ul className="reg-tips">
                <li>Mỗi ảnh đạt chuẩn sẽ xuất hiện ngay ở phần xem trước bên dưới.</li>
                <li>Nếu AI báo ảnh nhòe, hãy chậm lại một nhịp rồi tiếp tục xoay.</li>
                <li>Giữ một người trong khung hình và tránh ánh sáng quá gắt.</li>
              </ul>
            </div>

            <div className="reg-system-status">
              <div className={`reg-status-pill ${isCameraReady ? "is-ok" : cameraState === "error" ? "is-error" : "is-warn"}`}>
                <span className="reg-status-dot" />
                <span>Camera</span>
                <strong>
                  {cameraState === "initializing" ? "Khởi tạo..." : isCameraReady ? "Sẵn sàng" : cameraError ? "Lỗi" : "Chờ..."}
                </strong>
              </div>
              <div className={`reg-status-pill ${isModelReady ? "is-ok" : modelState === "error" ? "is-error" : "is-warn"}`}>
                <span className="reg-status-dot" />
                <span>AI YOLO</span>
                <strong>
                  {modelState === "loading" ? "Đang tải..." : isModelReady ? "Sẵn sàng" : modelState === "error" ? "Lỗi" : "Chờ..."}
                </strong>
              </div>
            </div>

            <div className={`reg-feedback-card ${feedbackToneClass}`}>
              <div className="reg-feedback-header">
                <span className="section-label">Feedback trực tiếp</span>
                {sessionStatus === "collecting" ? (
                  <strong>{Math.floor(elapsedMs / 1000)}s</strong>
                ) : null}
              </div>
              <h4>{liveFeedback?.label || "Sẵn sàng thu thập"}</h4>
              <p>{liveFeedback?.message || "Nhấn bắt đầu để gom ảnh khuôn mặt."}</p>
              {softWarningVisible ? (
                <div className="reg-soft-warning">
                  Thu thập đang lâu hơn bình thường. Hãy xoay chậm hơn hoặc chỉnh ánh sáng đều trên mặt.
                </div>
              ) : null}
            </div>
          </article>
        </aside>

        <section className="simple-face-main">
          <article className="glass-panel simple-scanner-card">
            <div className={`simple-scanner-stage ${sessionStatus === "collecting" ? "is-recording" : ""}`}>
              <video
                ref={videoRef}
                className="simple-scanner-video simple-scanner-video--mirrored"
                autoPlay
                muted
                playsInline
              />

              <div className="reg-guide-oval" />

              <div className="simple-scanner-overlay">
                <div className="simple-scanner-vignette" />
                <div className="simple-scanner-gridlines" />
                <div className="simple-scanner-radar" />

                {sessionStatus === "collecting" ? (
                  <div className="reg-live-badge">
                    <span className="reg-live-dot" />
                    ĐANG THU THẬP
                  </div>
                ) : null}

                <div className="reg-action-area">
                  <ActionPanel
                    sessionStatus={sessionStatus}
                    acceptedCount={acceptedCount}
                    targetCount={targetCount}
                    canStart={canStart}
                    errorMessage={saveMessage}
                    onStart={startRecording}
                    onReset={resetRegistration}
                  />
                </div>
              </div>
            </div>
          </article>

          <article className="glass-panel simple-gallery-card">
            <div className="row-between">
              <div className="stack-sm">
                <span className="section-label">Xem trước thu thập</span>
                <h3>{acceptedCount} / {targetCount} ảnh đã nhận</h3>
                <p className="text-secondary">
                  Hiển thị {thumbnailLimit} khung hình hợp lệ gần nhất để bạn biết hệ thống đang bắt ảnh tốt.
                </p>
              </div>
              {canReset ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={resetRegistration}
                >
                  Hủy / Làm lại
                </button>
              ) : null}
            </div>

            <div className="reg-thumb-grid reg-thumb-grid--fixed">
              {previewSlots.map((frame, index) => (
                <div
                  key={index}
                  className={`reg-thumb-slot ${frame ? "is-filled" : ""}`}
                >
                  {frame ? (
                    <img src={frame.previewUrl} alt={`Frame ${index + 1}`} />
                  ) : (
                    <span className="reg-thumb-empty" />
                  )}
                </div>
              ))}
            </div>
          </article>

          {saveMessage ? (
            <div className={`alert alert-${saveState === "success" ? "success" : saveState === "error" ? "error" : "info"}`}>
              {saveMessage}
            </div>
          ) : null}

          <div className="simple-face-footer row-between">
            <div className="text-muted">
              © 2026 Hệ thống định danh. Bảo lưu mọi quyền.
            </div>
            <div className="row">
              <Link
                className="btn btn-secondary btn-sm"
                to={`/manager/employees/${employeeId}/faces`}
              >
                Quản lý ảnh tĩnh
              </Link>
              <Link className="btn btn-ghost btn-sm" to="/manager/employees">
                Quay lại nhân viên
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
