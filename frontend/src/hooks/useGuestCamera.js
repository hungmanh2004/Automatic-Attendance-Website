import { useCallback, useEffect, useRef, useState } from "react";

function getCameraErrorMessage(error) {
  if (!error) return "Không thể truy cập camera.";

  if (error.name === "NotAllowedError") {
    return "Quyền camera đã bị từ chối. Hãy cho phép camera và thử lại.";
  }

  if (error.name === "NotFoundError") {
    return "Không tìm thấy camera phù hợp trên thiết bị này.";
  }

  return "Không thể khởi động camera trên trình duyệt. Hãy thử lại.";
}

export function useGuestCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState("idle");
  const [cameraError, setCameraError] = useState("");

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;

    if (video) {
      video.srcObject = null;
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraState("unavailable");
      setCameraError("Trình duyệt này không hỗ trợ camera.");
      return false;
    }

    setCameraState("requesting");
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Ignore autoplay rejections; the preview can still render.
        }
      }

      setCameraState("ready");
      return true;
    } catch (error) {
      const nextState = error?.name === "NotAllowedError" ? "denied" : error?.name === "NotFoundError" ? "unavailable" : "error";

      setCameraState(nextState);
      setCameraError(getCameraErrorMessage(error));
      return false;
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return {
    cameraError,
    cameraState,
    retryCamera: startCamera,
    startCamera,
    stopCamera,
    videoRef,
  };
}
