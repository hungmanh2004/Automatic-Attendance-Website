import "./EmployeeFaceScannerPage.override.css";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useManagerAuth } from "../context/ManagerAuthContext";
import { useFaceRegistration } from "../hooks/useFaceRegistration";

function getStatusItems(systemState, faceAnalysis) {
  return [
    {
      label: "Ánh sáng",
      value: systemState.cameraActive ? "Tối ưu" : "Chưa sẵn sàng",
      tone: systemState.cameraActive ? "success" : "neutral",
    },
    {
      label: "Khoảng cách",
      value: faceAnalysis?.isTooFar ? "Điều chỉnh" : "Ổn định",
      tone: faceAnalysis?.isTooFar ? "warning" : "success",
    },
    {
      label: "Khuôn mặt",
      value: faceAnalysis ? "Đã nhận" : "Đang chờ",
      tone: faceAnalysis ? "success" : "neutral",
    },
  ];
}

function getScannerCopy(registration) {
  const { status, guidance, systemState, completedCount, isSaving, saveState, activeStep } = registration;

  if (status === "camera-error") {
    return {
      eyebrow: "Camera chưa sẵn sàng",
      title: "Không thể khởi tạo camera",
      description: "Kiểm tra quyền truy cập camera rồi thử lại sau.",
    };
  }

  if (isSaving || status === "uploading") {
    return {
      eyebrow: "Đang đồng bộ dữ liệu",
      title: "Đang lưu bộ khuôn mặt",
      description: "Hệ thống đang gửi ảnh đã ghi nhận lên máy chủ.",
    };
  }

  if (saveState === "success") {
    return {
      eyebrow: "Hoàn tất đăng ký",
      title: "Đã lưu dữ liệu khuôn mặt",
      description: "Bạn có thể quay lại hồ sơ nhân viên bất cứ lúc nào.",
    };
  }

  if (!systemState.cameraActive) {
    return {
      eyebrow: "Hệ thống đang chuẩn bị",
      title: "Đang khởi tạo camera",
      description: "Vui lòng giữ khuôn mặt trong vùng quét. Quá trình này chỉ mất vài giây.",
    };
  }

  if (status === "capturing") {
    return {
      eyebrow: "Đang ghi nhận góc mặt",
      title: `Đang lấy ảnh ${activeStep.title.toLowerCase()}`,
      description: "Giữ nguyên tư thế thêm một chút để hệ thống chọn ảnh rõ nhất.",
    };
  }

  if (completedCount === 0) {
    return {
      eyebrow: "Sẵn sàng quét",
      title: "Đang căn chỉnh khuôn mặt",
      description: "Giữ khuôn mặt trong vùng oval và nhìn theo hướng dẫn trên màn hình.",
    };
  }

  return {
    eyebrow: "Đang quét sinh trắc học",
    title: guidance,
    description: "Hệ thống sẽ tự động ghi lại ảnh tốt nhất cho từng góc khuôn mặt.",
  };
}

function getPreparationSteps(registration) {
  const { systemState, faceAnalysis, status, completedCount, saveState, isSaving } = registration;

  const stepOneState = systemState.cameraActive ? "done" : status === "camera-error" ? "error" : "active";
  const stepTwoState = faceAnalysis ? "done" : systemState.cameraActive ? "active" : "pending";
  const stepThreeState =
    completedCount > 0 || isSaving || saveState === "success"
      ? "done"
      : faceAnalysis
        ? "active"
        : "pending";

  return [
    { label: "Kết nối camera", state: stepOneState },
    { label: "Hiệu chỉnh khuôn mặt", state: stepTwoState },
    { label: "Sẵn sàng quét", state: stepThreeState },
  ];
}

export default function EmployeeFaceScannerPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { setUnauthenticated } = useManagerAuth();
  const registration = useFaceRegistration(employeeId, {
    onUnauthenticated: () => {
      setUnauthenticated();
      navigate("/manager/login", { replace: true });
    },
  });

  const statusItems = getStatusItems(registration.systemState, registration.faceAnalysis);
  const scannerCopy = getScannerCopy(registration);
  const preparationSteps = getPreparationSteps(registration);
  const canRetrySave = registration.saveState === "error" && !registration.isSaving;
  const showUtilityDock = registration.systemState.cameraActive && !registration.isSaving && registration.saveState !== "success";
  const poseClass = `pose-${registration.faceAnalysis?.pose || "front"}`;

  return (
    <div className="page-shell simple-face-page">
      <div className="simple-face-layout">
        <aside className="simple-face-sidebar">
          <article className="glass-panel simple-face-card simple-employee-card">
            <div className="simple-employee-avatar">{registration.employee.full_name?.slice(0, 2)?.toUpperCase() || "NV"}</div>
            <div className="stack-sm">
              <span className="section-label">Mã nhân viên: {registration.employee.employee_code || registration.employee.id}</span>
              <h2>{registration.employee.full_name}</h2>
              <p className="text-secondary">{registration.employee.department || "Chưa có phòng ban"}</p>
            </div>
            <div className="simple-employee-meta">
              <div>
                <span>Trạng thái</span>
                <strong>{registration.employee.registration_status}</strong>
              </div>
              <div>
                <span>Tiến độ</span>
                <strong>{registration.completedCount}/5 góc</strong>
              </div>
            </div>
          </article>

          <article className="glass-panel simple-face-card simple-progress-card">
            <div className="stack-sm">
              <span className="section-label">Tiến trình đăng ký</span>
              <h3>Các góc đăng ký</h3>
            </div>

            <div className="simple-step-list">
              {registration.steps.map((step, index) => (
                <div key={step.id} className={`simple-step-item is-${step.status}`}>
                  <div className="simple-step-index">{step.status === "completed" ? "✓" : index + 1}</div>
                  <div>
                    <strong>{step.title}</strong>
                    {step.status === "active" ? <span>Đang thực hiện</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </aside>

        <section className="simple-face-main">
          <article className="glass-panel simple-scanner-card">
            <div className={`simple-scanner-stage ${poseClass}${registration.captureFlash ? " is-capturing" : ""}`}>
              <video ref={registration.videoRef} className="simple-scanner-video" autoPlay muted playsInline />

              <div className="simple-scanner-overlay">
                <div className="simple-scanner-vignette" />
                <div className="simple-scanner-gridlines" />
                <div className="simple-scanner-radar" />

                <div className="simple-scanner-center">
                  <div className="simple-biometric-frame">
                    <div className="simple-orbit-ring outer" />
                    <div className="simple-orbit-ring inner" />
                    <div className="simple-biometric-oval" />
                    <div className="simple-biometric-oval inner" />
                    <div className="simple-biometric-arc" />
                    <div className="simple-biometric-scanline" />
                    <div className="simple-biometric-glow" />
                    <span className="simple-biometric-corner corner-top-left" />
                    <span className="simple-biometric-corner corner-top-right" />
                    <span className="simple-biometric-corner corner-bottom-left" />
                    <span className="simple-biometric-corner corner-bottom-right" />
                  </div>
                </div>

                <div className="simple-status-stack">
                  {statusItems.map((item) => (
                    <div key={item.label} className={`simple-status-pill is-${item.tone}`}>
                      <span className="simple-status-dot" />
                      <span className="simple-status-label">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="simple-scanner-info-card">
                  <div className="simple-info-status">
                    <span className="simple-info-spinner" />
                    <span>{scannerCopy.eyebrow}</span>
                  </div>
                  <h3 className="simple-info-title">{scannerCopy.title}</h3>
                  <p className="simple-info-description">{scannerCopy.description}</p>

                  <div className="simple-info-progress">
                    {preparationSteps.map((step) => (
                      <div key={step.label} className={`simple-progress-step is-${step.state}`}>
                        <span className="simple-progress-dot" />
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>

                  {registration.status === "camera-error" ? (
                    <div className="simple-info-actions">
                      <button type="button" className="simple-info-btn is-primary" onClick={registration.retryCamera}>
                        Th? l?i camera
                      </button>
                      <Link className="simple-info-btn" to={`/manager/employees/${employeeId}/faces`}>
                        D?ng 5 ?nh t?nh
                      </Link>
                    </div>
                  ) : null}

                  {canRetrySave ? (
                    <div className="simple-info-actions">
                      <button type="button" className="simple-info-btn is-primary" onClick={() => registration.saveIdentity()}>
                        Lưu lại
                      </button>
                      <button type="button" className="simple-info-btn" onClick={registration.resetRegistration}>
                        Hủy
                      </button>
                    </div>
                  ) : null}
                </div>

                {showUtilityDock ? (
                  <div className="simple-utility-dock">
                    <button type="button" className="simple-utility-btn" onClick={registration.resetRegistration} aria-label="Làm lại toàn bộ">
                      ←
                    </button>
                    <button type="button" className="simple-utility-btn" onClick={registration.recaptureCurrent} aria-label="Chụp lại bước hiện tại">
                      ↻
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          <article className="glass-panel simple-gallery-card">
            <div className="row-between">
              <div className="stack-sm">
                <span className="section-label">Thư viện góc chụp</span>
                <h3>Ảnh các góc đã hoàn thành</h3>
              </div>
              <div className="simple-gallery-progress">
                <span>{Math.round((registration.completedCount / 5) * 100)}% hoàn tất</span>
                <div className="progress"><span style={{ width: `${(registration.completedCount / 5) * 100}%` }} /></div>
              </div>
            </div>

            <div className="simple-gallery-grid">
              {registration.steps.map((step) => (
                <div key={step.id} className={`simple-gallery-item${registration.captures[step.id] ? " is-filled" : ""}${registration.activeStep.id === step.id ? " is-active" : ""}`}>
                  <div className="simple-gallery-thumb">
                    {registration.captures[step.id] ? <img src={registration.captures[step.id]} alt={step.title} /> : <span>{registration.activeStep.id === step.id ? "Đang quét..." : "Chưa có"}</span>}
                  </div>
                  <strong>{step.title}</strong>
                </div>
              ))}
            </div>
          </article>

          {registration.saveMessage ? <div className={`alert alert-${registration.saveState === "error" ? "error" : registration.saveState === "success" ? "success" : "info"}`}>{registration.saveMessage}</div> : null}

          <div className="simple-face-footer row-between">
            <div className="text-muted">© 2026 Hệ thống định danh. Bảo lưu mọi quyền.</div>
            <div className="row">
              <Link className="btn btn-secondary btn-sm" to={`/manager/employees/${employeeId}/faces`}>
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
