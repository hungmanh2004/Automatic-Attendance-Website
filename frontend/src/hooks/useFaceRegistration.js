import { useEffect, useRef, useState } from "react";

import { ApiError, enrollEmployeeFacesBatch, getFaceSamples } from "../lib/api";
import {
  analyzeDetectedFace,
  captureFrame,
  createFaceDetector,
  detectFaces,
  isPoseMatching,
  startCamera,
  stopCamera,
} from "../lib/cameraService";

export const FACE_REGISTRATION_STEPS = [
  { id: "straight", title: "Nhìn thẳng", description: "Giữ khuôn mặt ở giữa khung và nhìn trực diện vào camera." },
  { id: "left", title: "Quay trái", description: "Xoay nhẹ mặt sang trái để lấy biên dạng bên trái." },
  { id: "right", title: "Quay phải", description: "Xoay nhẹ mặt sang phải để hoàn tất cặp góc ngang." },
  { id: "up", title: "Nhìn lên", description: "Ngẩng cằm nhẹ và giữ ổn định trong khung quét." },
  { id: "down", title: "Nhìn xuống", description: "Cúi nhẹ đầu xuống để hoàn tất quá trình đăng ký." },
];

const MIN_BATCH_FRAME_COUNT = 20;
const MAX_BATCH_FRAME_COUNT = 30;

const MOCK_EMPLOYEE = {
  department: "Phòng Kế toán",
  employee_code: "NV001",
  full_name: "Nguyễn Văn A",
  id: "NV001",
  is_active: true,
};

function getInitialCaptures() {
  return FACE_REGISTRATION_STEPS.reduce((result, step) => {
    result[step.id] = null;
    return result;
  }, {});
}

function getStepStatus(stepIndex, activeIndex, captures) {
  const step = FACE_REGISTRATION_STEPS[stepIndex];
  if (captures[step.id]) return "completed";
  if (stepIndex === activeIndex) return "active";
  if (stepIndex < activeIndex) return "completed";
  return "pending";
}

function scoreCandidateFrame(analysis, stepId) {
  if (!analysis) return 0;

  const poseBonus = isPoseMatching(stepId, analysis.pose) ? 1 : 0;
  const centeredBonus = analysis.isCentered ? 1 : 0;
  const insideBonus = analysis.isInsideGuide ? 1 : 0;
  const distanceScore = Math.min(Math.max(analysis.widthRatio || 0, 0.18), 0.42);
  const confidenceScore = Math.max(analysis.confidence || 0, 0.4);
  const stabilityPenalty = Math.abs(analysis.yaw || 0) + Math.abs(analysis.pitch || 0);

  return poseBonus * 3 + centeredBonus * 2 + insideBonus * 1.5 + distanceScore * 4 + confidenceScore * 2 - stabilityPenalty;
}

export function useFaceRegistration(employeeId, { onUnauthenticated } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const holdStartRef = useRef(null);
  const captureLockRef = useRef(false);
  const bestFrameRef = useRef(null);
  const autoSubmitTriggeredRef = useRef(false);
  const batchFramesRef = useRef([]);
  const batchFrameLastAddedAtRef = useRef(0);

  const [employee, setEmployee] = useState(MOCK_EMPLOYEE);
  const [status, setStatus] = useState("initializing");
  const [guidance, setGuidance] = useState("Đang khởi tạo camera");
  const [warning, setWarning] = useState("");
  const [captures, setCaptures] = useState(getInitialCaptures);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [faceAnalysis, setFaceAnalysis] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [batchFrameCount, setBatchFrameCount] = useState(0);
  const [systemState, setSystemState] = useState({
    cameraActive: false,
    detectorReady: false,
    mode: "FaceDetector gốc của trình duyệt",
  });

  const activeStep = FACE_REGISTRATION_STEPS[activeStepIndex] || FACE_REGISTRATION_STEPS.at(-1);
  const completedCount = FACE_REGISTRATION_STEPS.filter((step) => captures[step.id]).length;
  const canSave = completedCount === FACE_REGISTRATION_STEPS.length && !isSaving;

  function resetHoldTracking() {
    holdStartRef.current = null;
    bestFrameRef.current = null;
  }

  function resetBatchFrames() {
    batchFramesRef.current = [];
    batchFrameLastAddedAtRef.current = 0;
    setBatchFrameCount(0);
  }

  function collectBatchFrame(frame, pose) {
    if (!frame || batchFramesRef.current.length >= MAX_BATCH_FRAME_COUNT) return;

    const now = Date.now();
    if (now - batchFrameLastAddedAtRef.current < 140) return;

    batchFramesRef.current = [...batchFramesRef.current, { image: frame, pose, timestamp: now }];
    batchFrameLastAddedAtRef.current = now;
    setBatchFrameCount(batchFramesRef.current.length);
  }

  async function saveIdentity(force = false) {
    if ((!canSave && !force) || isSaving) return;

    setIsSaving(true);
    setSaveMessage("");
    setSaveState("uploading");
    setStatus("uploading");
    setGuidance("Đang gửi dữ liệu khuôn mặt");

    try {
      await enrollEmployeeFacesBatch(employeeId, captures, batchFramesRef.current);
      setSaveState("success");
      setSaveMessage(`Đã tự động lưu bộ khuôn mặt nhân viên từ ${batchFramesRef.current.length} khung hình.`);
      setStatus("upload-success");
      setGuidance("Đã đồng bộ khuôn mặt thành công");
      setEmployee((current) => ({ ...current, registration_status: "Đã đăng ký" }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthenticated?.();
        return;
      }

      autoSubmitTriggeredRef.current = false;
      setSaveState("error");
      setSaveMessage(error.message || "Không thể lưu dữ liệu khuôn mặt.");
      setStatus("upload-error");
      setGuidance("Tự động lưu thất bại, vui lòng thử lại");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const payload = await getFaceSamples(employeeId);
        if (!mounted) return;
        setEmployee(payload?.employee || MOCK_EMPLOYEE);
      } catch (error) {
        if (!mounted) return;
        if (error?.status === 401) {
          onUnauthenticated?.();
          return;
        }

        setEmployee((current) => ({
          ...current,
          id: employeeId || current.id,
        }));
      }

      try {
        detectorRef.current = await createFaceDetector();
        if (!mounted) return;

        setSystemState((current) => ({
          ...current,
          detectorReady: Boolean(detectorRef.current),
          mode: detectorRef.current ? "FaceDetector gốc của trình duyệt" : "Chế độ camera hướng dẫn",
        }));

        const stream = await startCamera(videoRef.current);
        if (!mounted) {
          stopCamera(stream);
          return;
        }

        streamRef.current = stream;
        setStatus("camera-ready");
        setGuidance("Nhìn thẳng");
        setSystemState((current) => ({
          ...current,
          cameraActive: true,
        }));
      } catch (error) {
        if (!mounted) return;
        setStatus("camera-error");
        setWarning(error.message || "Không thể mở camera.");
        setGuidance("Camera chưa sẵn sàng");
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
      if (analysisIntervalRef.current) {
        window.clearInterval(analysisIntervalRef.current);
      }
      stopCamera(streamRef.current);
    };
  }, [employeeId, onUnauthenticated]);

  useEffect(() => {
    if (!["camera-ready", "scanning", "capturing", "complete", "upload-error"].includes(status)) {
      return undefined;
    }

    const tick = async () => {
      const videoElement = videoRef.current;
      if (!videoElement?.videoWidth || captureLockRef.current) {
        return;
      }

      const faces = await detectFaces(detectorRef.current, videoElement);

      if (!faces.length) {
        resetHoldTracking();
        setStatus("scanning");
        setWarning(detectorRef.current ? "Không phát hiện khuôn mặt trong khung." : "Đang chờ camera ổn định để bắt đầu quét.");
        setGuidance("Đưa khuôn mặt vào giữa khung");
        setFaceAnalysis(null);
        return;
      }

      if (faces.length > 1) {
        resetHoldTracking();
        setStatus("scanning");
        setWarning("Chỉ cho phép một khuôn mặt trong khung.");
        setGuidance("Chỉ để một người trong vùng quét");
        setFaceAnalysis(null);
        return;
      }

      const analysis = analyzeDetectedFace(faces[0], videoElement.videoWidth, videoElement.videoHeight);

      setFaceAnalysis(analysis);
      setStatus("scanning");
      setWarning("");

      if (!analysis.isCentered || !analysis.isInsideGuide) {
        resetHoldTracking();
        setGuidance("Đưa khuôn mặt vào giữa khung");
        setWarning("Khuôn mặt đang lệch khỏi vùng quét.");
        return;
      }

      if (analysis.isTooFar) {
        resetHoldTracking();
        setGuidance("Tiến gần camera hơn");
        setWarning("Tiến gần hơn để hệ thống lấy đủ chi tiết khuôn mặt.");
        return;
      }

      const frame = captureFrame(videoElement);
      collectBatchFrame(frame, analysis.pose);

      if (completedCount === FACE_REGISTRATION_STEPS.length) {
        setGuidance(
          batchFramesRef.current.length >= MIN_BATCH_FRAME_COUNT
            ? "Đã thu đủ dữ liệu, đang tự động lưu"
            : "Giữ khuôn mặt thêm vài giây để hoàn tất dữ liệu video",
        );
        return;
      }

      if (!isPoseMatching(activeStep.id, analysis.pose)) {
        resetHoldTracking();
        setGuidance(activeStep.title);
        setWarning("Góc mặt hiện tại chưa đúng với bước đang thực hiện.");
        return;
      }

      const score = scoreCandidateFrame(analysis, activeStep.id);
      if (frame && (!bestFrameRef.current || score > bestFrameRef.current.score)) {
        bestFrameRef.current = { frame, score };
      }

      setGuidance(`Giữ yên: ${activeStep.title}`);
      if (!holdStartRef.current) {
        holdStartRef.current = Date.now();
        return;
      }

      if (Date.now() - holdStartRef.current < 950) {
        return;
      }

      captureLockRef.current = true;
      setStatus("capturing");
      const bestFrame = bestFrameRef.current?.frame || frame;

      if (bestFrame) {
        setCaptureFlash(true);
        window.setTimeout(() => setCaptureFlash(false), 280);
        setCaptures((current) => ({
          ...current,
          [activeStep.id]: bestFrame,
        }));
        const nextIndex = activeStepIndex + 1;
        const isComplete = nextIndex >= FACE_REGISTRATION_STEPS.length;
        setActiveStepIndex(isComplete ? activeStepIndex : nextIndex);
        setGuidance(isComplete ? "Đã thu đủ 5 góc, đang tự động lưu" : FACE_REGISTRATION_STEPS[nextIndex].title);
        setStatus(isComplete ? "complete" : "camera-ready");
      }

      resetHoldTracking();
      window.setTimeout(() => {
        captureLockRef.current = false;
      }, 320);
    };

    analysisIntervalRef.current = window.setInterval(() => {
      void tick();
    }, 180);

    return () => {
      if (analysisIntervalRef.current) {
        window.clearInterval(analysisIntervalRef.current);
      }
    };
  }, [activeStep, activeStepIndex, completedCount, status]);

  useEffect(() => {
    if (completedCount !== FACE_REGISTRATION_STEPS.length || autoSubmitTriggeredRef.current || saveState === "success") {
      return;
    }

    if (batchFramesRef.current.length < MIN_BATCH_FRAME_COUNT) {
      return;
    }

    autoSubmitTriggeredRef.current = true;
    void saveIdentity(true);
  }, [batchFrameCount, completedCount, saveState]);

  function recaptureCurrent() {
    const currentStep = FACE_REGISTRATION_STEPS[Math.min(activeStepIndex, FACE_REGISTRATION_STEPS.length - 1)];
    if (!currentStep) return;

    resetHoldTracking();
    autoSubmitTriggeredRef.current = false;
    resetBatchFrames();
    setCaptures((current) => ({
      ...current,
      [currentStep.id]: null,
    }));
    setStatus("camera-ready");
    setGuidance(currentStep.title);
    setWarning("");
    setSaveMessage("");
    setSaveState("idle");
  }

  function resetRegistration() {
    resetHoldTracking();
    autoSubmitTriggeredRef.current = false;
    resetBatchFrames();
    setCaptures(getInitialCaptures());
    setActiveStepIndex(0);
    setStatus(systemState.cameraActive ? "camera-ready" : "initializing");
    setGuidance("Nhìn thẳng");
    setWarning("");
    setSaveMessage("");
    setSaveState("idle");
  }

  const steps = FACE_REGISTRATION_STEPS.map((step, index) => ({
    ...step,
    status: getStepStatus(index, activeStepIndex, captures),
  }));

  return {
    activeStep,
    batchFrameCount,
    canSave,
    captureFlash,
    captures,
    completedCount,
    employee: {
      ...employee,
      registration_status:
        employee.registration_status ||
        (completedCount === FACE_REGISTRATION_STEPS.length
          ? "Đã đăng ký"
          : completedCount > 0
            ? "Đang thực hiện"
            : "Chưa đăng ký"),
    },
    faceAnalysis,
    guidance: warning || guidance,
    isSaving,
    recaptureCurrent,
    resetRegistration,
    saveIdentity,
    saveMessage,
    saveState,
    status,
    steps,
    systemState,
    videoRef,
  };
}
