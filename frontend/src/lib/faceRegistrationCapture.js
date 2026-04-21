export const DEFAULT_CAPTURE_CONFIG = Object.freeze({
  minFrames: 8,
  maxFrames: 12,
  thumbnailLimit: 10,
  minCaptureGapMs: 300,
})

export const CAPTURE_LOOP_INTERVAL_MS = 100
export const CAPTURE_SOFT_WARNING_MS = 15000
export const MIN_DETECTOR_SCORE = 0.55
export const MIN_FACE_AREA_RATIO = 0.035
export const MIN_BLUR_SCORE = 14

export function normalizeCaptureConfig(config = {}) {
  return {
    minFrames: clampInt(config.min_frames ?? config.minFrames, DEFAULT_CAPTURE_CONFIG.minFrames, 5, 30),
    maxFrames: clampInt(config.max_frames ?? config.maxFrames, DEFAULT_CAPTURE_CONFIG.maxFrames, 5, 30),
    thumbnailLimit: clampInt(config.thumbnail_limit ?? config.thumbnailLimit, DEFAULT_CAPTURE_CONFIG.thumbnailLimit, 5, 12),
    minCaptureGapMs: clampInt(config.min_capture_gap_ms ?? config.minCaptureGapMs, DEFAULT_CAPTURE_CONFIG.minCaptureGapMs, 300, 2000),
  }
}

export function evaluateFrameQuality({
  detections,
  videoWidth,
  videoHeight,
  nowMs,
  lastAcceptedAtMs,
  blurScore,
  config,
}) {
  if (!Array.isArray(detections) || detections.length === 0) {
    return { accepted: false, reason: "no_face" }
  }

  if (detections.length > 1) {
    return { accepted: false, reason: "multiple_faces" }
  }

  const detection = detections[0]
  const score = Number(detection?.score || 0)
  if (score < MIN_DETECTOR_SCORE) {
    return { accepted: false, reason: "low_confidence", detection }
  }

  if (!isFaceInsideGuide(detection, videoWidth, videoHeight)) {
    return { accepted: false, reason: "off_guide", detection }
  }

  const normalizedConfig = normalizeCaptureConfig(config)
  if (Number.isFinite(lastAcceptedAtMs) && nowMs - lastAcceptedAtMs < normalizedConfig.minCaptureGapMs) {
    return { accepted: false, reason: "capture_gap", detection }
  }

  if (typeof blurScore === "number" && blurScore < MIN_BLUR_SCORE) {
    return { accepted: false, reason: "blurry", detection }
  }

  return {
    accepted: true,
    reason: "accepted",
    detection,
    hintPose: inferPoseHint(detection),
  }
}

export function isFaceInsideGuide(detection, videoWidth, videoHeight) {
  const width = Math.max(videoWidth || 0, 1)
  const height = Math.max(videoHeight || 0, 1)
  const box = detection?.box
  if (!box) return false

  const faceWidth = Math.max(0, box.x2 - box.x1)
  const faceHeight = Math.max(0, box.y2 - box.y1)
  if (faceWidth === 0 || faceHeight === 0) return false

  const areaRatio = (faceWidth * faceHeight) / (width * height)
  if (areaRatio < MIN_FACE_AREA_RATIO) return false

  const centerX = (box.x1 + box.x2) / 2
  const centerY = (box.y1 + box.y2) / 2
  const ellipse = getGuideEllipse(width, height)
  const normX = (centerX - ellipse.cx) / ellipse.rx
  const normY = (centerY - ellipse.cy) / ellipse.ry

  return normX * normX + normY * normY <= 1
}

export function getGuideEllipse(videoWidth, videoHeight) {
  return {
    cx: videoWidth / 2,
    cy: videoHeight / 2,
    rx: videoWidth * 0.18,
    ry: videoHeight * 0.34,
  }
}

export function computeBlurScore(imageData) {
  const pixels = imageData?.data
  const width = imageData?.width || 0
  const height = imageData?.height || 0
  if (!pixels || width < 3 || height < 3) return 0

  const grayscale = new Float32Array(width * height)
  for (let index = 0; index < width * height; index += 1) {
    const base = index * 4
    grayscale[index] =
      (pixels[base] * 0.299) +
      (pixels[base + 1] * 0.587) +
      (pixels[base + 2] * 0.114)
  }

  let total = 0
  let totalSquares = 0
  let sampleCount = 0

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x
      const laplacian =
        (4 * grayscale[idx]) -
        grayscale[idx - 1] -
        grayscale[idx + 1] -
        grayscale[idx - width] -
        grayscale[idx + width]

      total += laplacian
      totalSquares += laplacian * laplacian
      sampleCount += 1
    }
  }

  if (sampleCount === 0) return 0
  const mean = total / sampleCount
  return (totalSquares / sampleCount) - (mean * mean)
}

export function inferPoseHint(detection) {
  const keypoints = detection?.keypoints
  const box = detection?.box
  if (!Array.isArray(keypoints) || keypoints.length < 5 || !box) {
    return "front"
  }

  const [leftEye, rightEye, nose, leftMouth, rightMouth] = keypoints
  if (!leftEye || !rightEye || !nose || !leftMouth || !rightMouth) {
    return "front"
  }

  const eyeMidX = (leftEye[0] + rightEye[0]) / 2
  const eyeMidY = (leftEye[1] + rightEye[1]) / 2
  const mouthMidY = (leftMouth[1] + rightMouth[1]) / 2
  const boxWidth = Math.max(1, box.x2 - box.x1)
  const horizontalOffset = (nose[0] - eyeMidX) / boxWidth

  if (horizontalOffset <= -0.05) return "left"
  if (horizontalOffset >= 0.05) return "right"

  const verticalDenominator = Math.max(1, mouthMidY - eyeMidY)
  const verticalRatio = (nose[1] - eyeMidY) / verticalDenominator
  if (verticalRatio <= 0.42) return "up"
  if (verticalRatio >= 0.68) return "down"

  return "front"
}

export function mirrorHintPose(hintPose) {
  if (hintPose === "left") return "right"
  if (hintPose === "right") return "left"
  return hintPose || "front"
}

export function buildCaptureFeedback(reason, { acceptedCount = 0, targetCount = DEFAULT_CAPTURE_CONFIG.minFrames } = {}) {
  switch (reason) {
    case "accepted":
      return {
        tone: "success",
        label: `Đã nhận khung hình #${acceptedCount}`,
        message: `Tiếp tục xoay nhẹ đầu để đủ ${targetCount} ảnh hợp lệ.`,
      }
    case "no_face":
      return {
        tone: "neutral",
        label: "Chưa thấy khuôn mặt",
        message: "Đưa mặt vào giữa khung oval và giữ ánh sáng ổn định.",
      }
    case "multiple_faces":
      return {
        tone: "warning",
        label: "Nhiều khuôn mặt",
        message: "Chỉ để một người trong khung hình để hệ thống thu thập chính xác hơn.",
      }
    case "low_confidence":
      return {
        tone: "warning",
        label: "Khung hình chưa rõ",
        message: "Giữ đầu ổn định hơn trong một nhịp ngắn để AI bắt nét tốt hơn.",
      }
    case "off_guide":
      return {
        tone: "warning",
        label: "Căn lại khuôn mặt",
        message: "Đưa khuôn mặt vào vùng oval và giữ kích thước vừa khung.",
      }
    case "blurry":
      return {
        tone: "warning",
        label: "Ảnh bị nhòe",
        message: "Xoay chậm hơn một chút và tránh giật đầu đột ngột.",
      }
    case "capture_gap":
      return {
        tone: "neutral",
        label: "Giữ nhịp chậm",
        message: "Đợi một nhịp ngắn rồi xoay tiếp để các ảnh đủ đa dạng góc nhìn.",
      }
    case "needs_more_frames":
      return {
        tone: "warning",
        label: "Cần thêm góc nhìn",
        message: `Máy chủ cần thêm vài khung hình khác nhau. Hãy xoay tiếp để hệ thống gom đủ ${targetCount} ảnh.`,
      }
    case "uploading":
      return {
        tone: "info",
        label: "Đang gửi lên hệ thống",
        message: "Đã đủ ảnh hợp lệ. Hệ thống đang tạo batch đăng ký khuôn mặt.",
      }
    case "success":
      return {
        tone: "success",
        label: "Hoàn tất thu thập",
        message: "Batch ảnh đã được gửi thành công và đang sẵn sàng cho nhận diện.",
      }
    case "error":
      return {
        tone: "error",
        label: "Không thể hoàn tất đăng ký",
        message: "Bạn có thể làm lại ngay khi camera và AI vẫn sẵn sàng.",
      }
    default:
      return {
        tone: "neutral",
        label: "Sẵn sàng thu thập",
        message: `Nhấn bắt đầu để gom đủ ${targetCount} ảnh khuôn mặt rõ nét.`,
      }
  }
}

export function shouldExtendCaptureAfterBatchError(error, {
  acceptedCount = 0,
  currentTargetCount = DEFAULT_CAPTURE_CONFIG.minFrames,
  maxFrames = DEFAULT_CAPTURE_CONFIG.maxFrames,
} = {}) {
  const errorStatus = error?.payload?.status || error?.status || error?.message
  return (
    errorStatus === "insufficient_valid_frames" &&
    acceptedCount >= currentTargetCount &&
    currentTargetCount < maxFrames &&
    acceptedCount < maxFrames
  )
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}
