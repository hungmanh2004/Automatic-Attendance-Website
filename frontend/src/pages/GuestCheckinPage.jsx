import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useGuestCamera } from "../hooks/useGuestCamera";
import { captureGuestFrame, submitGuestCheckin } from "../lib/guestApi";
import { getFriendlyBackendErrorMessage, getGuestResultCopy } from "../lib/errorMessages";
import "./GuestCheckinPage.css";

const SCAN_INTERVAL_MS = 2200;
const SUCCESS_COOLDOWN_SECONDS = 5;
const MAX_HISTORY_ITEMS = 10;

function getTone(status) {
  if (status === "recognized" || status === "already_checked_in") return "success";
  if (status === "multiple_faces") return "warning";
  if (status === "network_error" || status === "unknown") return "danger";
  if (status === "paused") return "paused";
  return "scanning";
}

function getStatusLabel(cameraState, scanMode) {
  if (cameraState !== "ready") return "Lỗi camera";
  if (scanMode === "paused") return "Tạm dừng";
  return "Đang quét";
}

function getConfidenceValue(distance) {
  if (distance == null || Number.isNaN(distance)) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - distance) * 1000) / 10));
}

function getEmployeeInitials(name) {
  if (!name) return "AI";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Đang chờ dữ liệu";
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${date.toLocaleDateString()}`;
}

function getHistoryBadge(entry) {
  if (entry.status === "recognized" || entry.status === "already_checked_in") return "badge-success";
  if (entry.status === "multiple_faces" || entry.status === "no_face") return "badge-warning";
  return "badge-error";
}

export default function GuestCheckinPage() {
  const { videoRef, cameraState, cameraError, retryCamera, stopCamera } = useGuestCamera();
  const [scanMode, setScanMode] = useState("scanning");
  const [submissionState, setSubmissionState] = useState("idle");
  const [result, setResult] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [history, setHistory] = useState([]);
  const [manualFile, setManualFile] = useState(null);
  const [showFallback, setShowFallback] = useState(false);
  const [statusText, setStatusText] = useState("AI đang quét khuôn mặt theo thời gian thực.");
  const inflightRef = useRef(false);

  const isScanning = scanMode === "scanning" && cooldownSeconds === 0;
  const isPaused = scanMode === "paused";
  const isBusy = submissionState === "loading";
  const cameraReady = cameraState === "ready";
  const copy = useMemo(() => getGuestResultCopy(result), [result]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!isScanning || !cameraReady) return undefined;
    const timer = window.setInterval(() => {
      if (!inflightRef.current) {
        void runAutoScan();
      }
    }, SCAN_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [cameraReady, isScanning]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!cameraReady) {
      setStatusText(cameraError || "Camera đang ngoại tuyến. Hãy kiểm tra quyền truy cập hoặc thiết bị.");
      return;
    }

    if (isPaused && cooldownSeconds > 0) {
      setStatusText(`AI đang tạm dừng. Tự động tiếp tục sau ${cooldownSeconds} giây.`);
      return;
    }

    if (isPaused) {
      setStatusText("Hệ thống đang tạm dừng, nhấn Bắt đầu quét để tiếp tục.");
      return;
    }

    if (result?.message) {
      setStatusText(result.message);
      return;
    }

    setStatusText("AI đang quét khuôn mặt theo thời gian thực.");
  }, [cameraError, cameraReady, cooldownSeconds, isPaused, result]);

  function pushHistory(payload) {
    const confidence = getConfidenceValue(payload?.distance);
    const entry = {
      id: `${Date.now()}-${Math.random()}`,
      status: payload?.status || "unknown",
      full_name: payload?.full_name || "Người lạ / chưa xác định",
      checked_in_at: payload?.checked_in_at || new Date().toISOString(),
      confidence,
    };

    setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY_ITEMS));
  }

  function applyResult(payload) {
    setResult(payload);
    pushHistory(payload);

    // Pause briefly after a successful match to avoid duplicate scans from the same person.
    if (payload?.status === "recognized" || payload?.status === "already_checked_in") {
      setScanMode("paused");
      setCooldownSeconds(SUCCESS_COOLDOWN_SECONDS);
    }
  }

  async function runAutoScan() {
    if (!cameraReady || !isScanning || inflightRef.current) return;

    inflightRef.current = true;
    setSubmissionState("loading");

    try {
      const frame = await captureGuestFrame(videoRef.current);
      if (!frame) {
        applyResult({
          status: "no_face",
          message: "Không phát hiện khuôn mặt trong khung quét.",
          checked_in_at: new Date().toISOString(),
        });
        return;
      }

      const payload = await submitGuestCheckin(frame);
      applyResult(payload);
    } catch (error) {
      applyResult({
        status: "network_error",
        message: getFriendlyBackendErrorMessage(error, "Không thể gửi dữ liệu đến backend."),
        checked_in_at: new Date().toISOString(),
      });
    } finally {
      inflightRef.current = false;
      setSubmissionState("idle");
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    if (!manualFile || isBusy) return;

    setSubmissionState("loading");
    try {
      const payload = await submitGuestCheckin(manualFile);
      applyResult(payload);
    } catch (error) {
      applyResult({
        status: "network_error",
        message: getFriendlyBackendErrorMessage(error, "Không thể gửi ảnh thủ công đến backend."),
        checked_in_at: new Date().toISOString(),
      });
    } finally {
      setSubmissionState("idle");
    }
  }

  const confidence = getConfidenceValue(result?.distance);
  const confidenceStroke = 339.292;
  const confidenceOffset = confidenceStroke - (confidence / 100) * confidenceStroke;
  const recentPersonName = result?.full_name || "Đang chờ AI xác nhận";

  return (
    <main className="kiosk-shell page-transition">
      <section className="kiosk-topbar">
        <div className="stack-sm">
          <span className="section-label">Trạm quét Guardian AI</span>
          <h1>Điểm danh khuôn mặt thông minh</h1>
          <p className="text-secondary">
            Hệ thống nhận diện khuôn mặt với camera thời gian thực, lớp phủ AI và nhật ký cập nhật liên tục.
          </p>
        </div>

        <div className="kiosk-actions">
          <Link className="btn btn-secondary" to="/manager/login">
            Mở khu quản trị
          </Link>
          <span className={`kiosk-live-pill tone-${getTone(cameraReady ? (scanMode === "paused" ? "paused" : "recognized") : "network_error")}`}>
            {getStatusLabel(cameraState, scanMode)}
          </span>
        </div>
      </section>

      <section className="kiosk-grid">
        <div className="kiosk-camera-panel panel-dark">
          <div className="kiosk-camera-stage">
            <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />
            <div className={`kiosk-overlay ${cameraReady ? "" : "is-error"} ${isPaused ? "is-paused" : ""}`}>
              <div className="face-box">
                <span />
                <span />
                <span />
                <span />
              </div>
              {cameraReady && !isPaused ? <div className="laser-line" /> : null}
              <div className="overlay-status">
                <span className={`scan-dot ${cameraReady && !isPaused ? "active" : ""}`} />
                {getStatusLabel(cameraState, scanMode)}
              </div>
              {!cameraReady ? (
                <div className="overlay-message">
                  <strong>Lỗi camera</strong>
                  <p>{cameraError || "Không kết nối được camera."}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retryCamera}>
                    Thử lại camera
                  </button>
                </div>
              ) : null}
              {isPaused ? (
                <div className="overlay-message">
                  <strong>Tạm dừng bộ quét AI</strong>
                  <p>{cooldownSeconds > 0 ? `Tự động tiếp tục sau ${cooldownSeconds} giây.` : "Nhấn Bắt đầu quét để tiếp tục."}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="kiosk-toolbar">
            <div className="stack-sm">
              <span className="section-label">Điều khiển quét</span>
              <strong>{isPaused ? "Camera đang tạm dừng" : "Camera đang quét liên tục"}</strong>
            </div>

            <div className="kiosk-toolbar-actions">
              {isPaused ? (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => {
                    setCooldownSeconds(0);
                    setScanMode("scanning");
                  }}
                  disabled={!cameraReady || isBusy}
                >
                  Bắt đầu quét
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setScanMode("paused")}
                  disabled={!cameraReady || isBusy}
                >
                  Dừng quét
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="kiosk-side-panel">
          <div className="glass-panel kiosk-result-card">
            <div className="row-between">
              <div className="stack-sm">
                <span className="section-label">Kết quả AI</span>
                <h2>Người vừa quét</h2>
              </div>
              <span className={`badge badge-${getTone(result?.status) === "success" ? "success" : getTone(result?.status) === "warning" ? "warning" : getTone(result?.status) === "danger" ? "error" : "info"}`}>
                {copy?.label || "Đang quét"}
              </span>
            </div>

            <div className="kiosk-profile">
              <div className="kiosk-avatar">{getEmployeeInitials(recentPersonName)}</div>
              <div className="stack-sm">
                <strong>{recentPersonName}</strong>
                <span className="text-secondary">{result?.employee_code || "Luồng khách Guardian AI"}</span>
                <span className="text-muted">{formatDateTime(result?.checked_in_at)}</span>
              </div>
            </div>

            <div className="kiosk-confidence">
              <div className="confidence-ring">
                <svg viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" />
                  <circle
                    className="progress-ring"
                    cx="60"
                    cy="60"
                    r="54"
                    style={{ strokeDasharray: confidenceStroke, strokeDashoffset: confidenceOffset }}
                  />
                </svg>
                <div>
                  <strong>{confidence.toFixed(1)}%</strong>
                  <span>Khớp</span>
                </div>
              </div>

              <div className="stack-sm">
                <div className="pill">{cameraReady ? "AI trực tuyến" : "Camera ngoại tuyến"}</div>
                <p className="text-secondary">{statusText}</p>
              </div>
            </div>

            <div className="kiosk-meta-grid">
              <div className="kiosk-meta">
                <span>Trạng thái</span>
                <strong>{getStatusLabel(cameraState, scanMode)}</strong>
              </div>
              <div className="kiosk-meta">
                <span>Điểm danh</span>
                <strong>{formatTime(result?.checked_in_at)}</strong>
              </div>
              <div className="kiosk-meta">
                <span>Camera</span>
                <strong>{cameraState}</strong>
              </div>
              <div className="kiosk-meta">
                <span>Ghi chú AI</span>
                <strong>{copy?.message || "Đang chờ dữ liệu mới"}</strong>
              </div>
            </div>
          </div>

          <div className="glass-panel kiosk-history-card">
            <div className="row-between">
              <div className="stack-sm">
                <span className="section-label">Lượt quét gần đây</span>
                <h2>Lịch sử gần nhất</h2>
              </div>
              <span className="pill">{history.length} bản ghi</span>
            </div>

            <div className="kiosk-history-list">
              {history.length === 0 ? (
                <div className="empty-state">
                  <h3>Chưa có log</h3>
                  <p>AI sẽ cập nhật danh sách này ngay khi có lượt quét mới.</p>
                </div>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="kiosk-history-item">
                    <div className="kiosk-history-avatar">{getEmployeeInitials(entry.full_name)}</div>
                    <div className="stack-sm kiosk-history-copy">
                      <strong>{entry.full_name}</strong>
                      <span className="text-secondary">{formatDateTime(entry.checked_in_at)}</span>
                    </div>
                    <div className="stack-sm kiosk-history-side">
                      <span className={`badge ${getHistoryBadge(entry)}`}>{entry.status}</span>
                      <strong>{entry.confidence.toFixed(1)}%</strong>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button type="button" className="btn btn-ghost" onClick={() => setShowFallback((current) => !current)}>
              {showFallback ? "Đóng tải ảnh thủ công" : "Camera lỗi? Tải ảnh thủ công"}
            </button>

            {showFallback ? (
              <form className="kiosk-upload-panel" onSubmit={handleManualSubmit}>
                <div className="field">
                  <label htmlFor="manual-upload">Ảnh khuôn mặt</label>
                  <input
                    id="manual-upload"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={!manualFile || isBusy}>
                  Gửi ảnh lên AI
                </button>
              </form>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
