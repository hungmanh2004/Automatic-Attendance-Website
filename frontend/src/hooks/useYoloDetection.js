// ============================================================
// useYoloDetection.js — React Hook: YOLO ONNX trên browser
// ============================================================
// Quản lý toàn bộ vòng đời ONNX detection:
//   1. Load model (với progress bar)
//   2. Chạy detection loop qua requestAnimationFrame
//   3. Track khuôn mặt qua các frame (Centroid Tracker)
//   4. Trigger gửi crop+keypoints khi đủ điều kiện
//   5. Vẽ bounding box lên canvas overlay
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadModel,
  isModelLoaded,
  detectFaces,
  cropFace,
} from '../lib/yoloOnnxService'
import { submitGuestCheckinKpts } from '../lib/guestApi'
import { getFriendlyBackendErrorMessage } from '../lib/errorMessages'

// ============================================================
// Cấu hình State Machine
// ============================================================
const STABLE_FRAMES_REQUIRED = 5  // Số frame liên tục phải ổn định
const MIN_FACE_AREA_RATIO = 0.04  // Tối thiểu 4% diện tích video
const MIN_CONFIDENCE = 0.5        // Ngưỡng tin tưởng tối thiểu
const COOLDOWN_MS = 3000          // Thời gian chờ sau khi nhận diện
const MAX_RETRIES = 3             // Số lần thử lại cho unknown
const TRACK_LOST_FRAMES = 15      // Mất track sau N frame liên tục
const DETECTION_INTERVAL_MS = 100 // Chạy detect mỗi 100ms (~10fps YOLO)

/**
 * Tính khoảng cách Euclidean giữa 2 tâm box.
 */
function centroidDistance(boxA, boxB) {
  const cxA = (boxA.x1 + boxA.x2) / 2
  const cyA = (boxA.y1 + boxA.y2) / 2
  const cxB = (boxB.x1 + boxB.x2) / 2
  const cyB = (boxB.y1 + boxB.y2) / 2
  return Math.sqrt((cxA - cxB) ** 2 + (cyA - cyB) ** 2)
}

/**
 * Custom React Hook: Quản lý YOLO ONNX detection trên browser.
 *
 * @param {object} options
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef
 * @param {boolean} options.enabled - Bật/tắt detection loop
 * @param {boolean} options.cameraReady - Camera đã sẵn sàng chưa
 * @returns {{ modelState, modelProgress, detections, tracks, onResult }}
 */
export function useYoloDetection({ videoRef, enabled, cameraReady }) {
  // --- State public ---
  const [modelState, setModelState] = useState('idle')  // idle | loading | ready | error
  const [modelProgress, setModelProgress] = useState(0)
  const [detections, setDetections] = useState([])       // Mảng detection hiện tại
  const [lastResult, setLastResult] = useState(null)      // Kết quả nhận diện mới nhất

  // --- Refs nội bộ ---
  const workCanvasRef = useRef(null)
  const tracksRef = useRef(new Map())     // Map<trackId, trackState>
  const nextTrackIdRef = useRef(1)
  const loopActiveRef = useRef(false)
  const lastDetectTimeRef = useRef(0)

  // ============================================================
  // Bước 1: Load model ONNX khi component mount
  // ============================================================
  useEffect(() => {
    if (isModelLoaded()) {
      setModelState('ready')
      setModelProgress(100)
      return
    }

    let cancelled = false
    setModelState('loading')

    loadModel((percent) => {
      if (!cancelled) setModelProgress(percent)
    })
      .then(() => {
        if (!cancelled) {
          setModelState('ready')
          setModelProgress(100)
        }
      })
      .catch((err) => {
        console.error('[useYoloDetection] Model load failed:', err)
        if (!cancelled) setModelState('error')
      })

    return () => { cancelled = true }
  }, [])

  // ============================================================
  // Bước 2: Tạo work canvas (dùng để preprocessing)
  // ============================================================
  useEffect(() => {
    if (!workCanvasRef.current) {
      workCanvasRef.current = document.createElement('canvas')
    }
  }, [])

  // ============================================================
  // Bước 3: Xử lý kết quả nhận diện (callback từ API)
  // ============================================================
  const handleRecognitionResult = useCallback((trackId, payload) => {
    const tracks = tracksRef.current
    const track = tracks.get(trackId)
    if (!track) return

    if (payload.status === 'recognized' || payload.status === 'already_checked_in') {
      track.state = 'recognized'
      track.result = payload
    } else if (payload.status === 'unknown') {
      track.retries += 1
      if (track.retries >= MAX_RETRIES) {
        track.state = 'unknown'
      } else {
        track.state = 'detecting'
        track.stableFrames = 0
      }
    } else {
      // no_face, error, etc. → reset
      track.state = 'detecting'
      track.stableFrames = 0
    }

    track.inflight = false
    setLastResult({ ...payload, trackId })
  }, [])

  // ============================================================
  // Bước 4: Gửi crop+keypoints lên backend (trigger khi đủ điều kiện)
  // ============================================================
  const sendCropToBackend = useCallback(async (trackId, videoEl, detection) => {
    const tracks = tracksRef.current
    const track = tracks.get(trackId)
    if (!track || track.inflight) return

    track.inflight = true
    track.state = 'recognizing'

    try {
      const cropResult = await cropFace(videoEl, detection, 0.4)
      if (!cropResult) {
        track.inflight = false
        track.state = 'detecting'
        return
      }

      const payload = await submitGuestCheckinKpts(
        cropResult.blob,
        cropResult.localKeypoints,
      )
      handleRecognitionResult(trackId, payload)
    } catch (error) {
      handleRecognitionResult(trackId, {
        status: 'network_error',
        message: getFriendlyBackendErrorMessage(error, 'Lỗi gửi dữ liệu.'),
        checked_in_at: new Date().toISOString(),
      })
    }
  }, [handleRecognitionResult])

  // ============================================================
  // Bước 5: Centroid Tracker — gán ID cho khuôn mặt qua các frame
  // ============================================================
  const updateTracks = useCallback((newDetections, videoEl) => {
    const tracks = tracksRef.current
    const vw = videoEl.videoWidth || 1
    const vh = videoEl.videoHeight || 1
    const frameArea = vw * vh

    // Đánh dấu tất cả tracks là "chưa match"
    for (const track of tracks.values()) {
      track.matched = false
    }

    // Gán detection → track gần nhất (Centroid matching)
    for (const det of newDetections) {
      let bestTrackId = null
      let bestDist = Infinity

      for (const [id, track] of tracks.entries()) {
        if (track.matched) continue
        const dist = centroidDistance(det.box, track.lastBox)
        if (dist < bestDist) {
          bestDist = dist
          bestTrackId = id
        }
      }

      // Ngưỡng: nếu centroid quá xa (>25% chiều rộng video) → track mới
      const maxDist = vw * 0.25
      if (bestTrackId !== null && bestDist < maxDist) {
        const track = tracks.get(bestTrackId)
        track.matched = true
        track.lastBox = det.box
        track.lastDetection = det
        track.missedFrames = 0
        track.stableFrames += 1
      } else {
        // Tạo track mới
        const newId = nextTrackIdRef.current++
        tracks.set(newId, {
          lastBox: det.box,
          lastDetection: det,
          state: 'detecting',   // detecting → recognizing → recognized/unknown
          stableFrames: 1,
          missedFrames: 0,
          retries: 0,
          inflight: false,
          result: null,
          cooldownUntil: 0,
          matched: true,
        })
      }
    }

    // Tăng missedFrames cho track không match, xóa track mất quá lâu
    for (const [id, track] of tracks.entries()) {
      if (!track.matched) {
        track.missedFrames += 1
        if (track.missedFrames > TRACK_LOST_FRAMES) {
          tracks.delete(id)
        }
      }
    }

    // Check trigger conditions cho từng track
    for (const [id, track] of tracks.entries()) {
      if (track.state !== 'detecting') continue
      if (track.inflight) continue
      if (Date.now() < track.cooldownUntil) continue

      const det = track.lastDetection
      if (!det) continue

      // Kiểm tra diện tích
      const bw = det.box.x2 - det.box.x1
      const bh = det.box.y2 - det.box.y1
      const faceArea = bw * bh
      if (faceArea / frameArea < MIN_FACE_AREA_RATIO) {
        console.warn(`[Track#${id}] SKIP: faceArea ${(faceArea/frameArea).toFixed(4)} < min ${MIN_FACE_AREA_RATIO}`)
        continue
      }

      // Kiểm tra confidence
      if (det.score < MIN_CONFIDENCE) {
        console.warn(`[Track#${id}] SKIP: score ${det.score.toFixed(3)} < min ${MIN_CONFIDENCE}`)
        continue
      }

      // Kiểm tra stable frames
      if (track.stableFrames < STABLE_FRAMES_REQUIRED) {
        console.warn(`[Track#${id}] SKIP: stableFrames ${track.stableFrames} < required ${STABLE_FRAMES_REQUIRED}`)
        continue
      }

      console.warn(`[Track#${id}] TRIGGER → backend (score=${det.score.toFixed(3)}, areaRatio=${(faceArea/frameArea).toFixed(4)})`)
      // ĐỦ ĐIỀU KIỆN → Gửi crop!
      track.cooldownUntil = Date.now() + COOLDOWN_MS
      sendCropToBackend(id, videoEl, det)
    }
  }, [sendCropToBackend])

  // ============================================================
  // Bước 6: Detection Loop (chạy liên tục khi enabled)
  // ============================================================
  useEffect(() => {
    if (modelState !== 'ready' || !enabled || !cameraReady) {
      loopActiveRef.current = false
      return
    }

    loopActiveRef.current = true
    let rafId = null
    // Thêm biến ref để đo thời gian detect YOLO
    const detectStartRef = { current: null }; /////

    const loop = async () => {
      if (!loopActiveRef.current) return

      const now = Date.now()
      if (now - lastDetectTimeRef.current >= DETECTION_INTERVAL_MS) {
        lastDetectTimeRef.current = now

        const videoEl = videoRef.current
        if (videoEl && videoEl.readyState >= 2 && workCanvasRef.current) {
          try {
            detectStartRef.current = performance.now(); ////////
            const dets = await detectFaces(videoEl, workCanvasRef.current)
            const detectEnd = performance.now();//////
            console.log('[YOLO] detectFaces time:', (detectEnd - detectStartRef.current).toFixed(2), 'ms');
            if (dets.length > 0) {
              console.warn(`[detectFaces] ✓ ${dets.length} face(s) detected`)
            }
            setDetections(dets)
            updateTracks(dets, videoEl)
          } catch (err) {
            console.error('[useYoloDetection] Detection error:', err)
          }
        }
      }

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      loopActiveRef.current = false
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [modelState, enabled, cameraReady, videoRef, updateTracks])

  // ============================================================
  // Bước 7: Export trạng thái tracks để UI vẽ bounding box
  // ============================================================
  const getTracksSnapshot = useCallback(() => {
    const result = []
    for (const [id, track] of tracksRef.current.entries()) {
      result.push({
        id,
        box: track.lastBox,
        state: track.state,
        result: track.result,
        score: track.lastDetection?.score || 0,
      })
    }
    if (result.length > 0) {
      console.warn(`[tracks] ${result.length} track(s):`, result.map(t => `#${t.id} state=${t.state} box=(${t.box?.x1?.toFixed(0)},${t.box?.y1?.toFixed(0)}) score=${t.score.toFixed(3)}`))
    }
    return result
  }, [])

  return {
    modelState,
    modelProgress,
    detections,
    lastResult,
    getTracksSnapshot,
  }
}
