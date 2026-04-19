// ============================================================
// yoloOnnxService.js — Chạy YOLOv12-face trực tiếp trên Browser
// ============================================================
// Pipeline:
//   1. Load model ONNX (WebAssembly backend)
//   2. Tiền xử lý: Canvas → Float32Array (RGB normalized)
//   3. Inference: session.run()
//   4. Hậu xử lý: Decode raw tensor → boxes + keypoints + NMS
//
// Output cho mỗi khuôn mặt phát hiện được:
//   { box: {x1,y1,x2,y2}, score, keypoints: [[x,y],...] }
// ============================================================

import * as ort from 'onnxruntime-web'

// ============================================================
// Cấu hình mặc định
// ============================================================
const MODEL_URL = '/models/yolov12n-face.onnx'
const INPUT_SIZE = 640           // YOLO input resolution (vuông)
const CONF_THRESHOLD = 0.45      // Ngưỡng chặn dự đoán yếu
const IOU_THRESHOLD = 0.5        // Ngưỡng NMS loại box trùng
const NUM_KEYPOINTS = 5          // 5 điểm mốc: 2 mắt, mũi, 2 mép
const DEBUG_YOLO = false

// ============================================================
// State nội bộ (Singleton)
// ============================================================
let _session = null
let _loading = null  // Promise đang load (tránh race condition)

/**
 * Load model ONNX vào WASM session. Chỉ load 1 lần duy nhất.
 * Trả về Promise<InferenceSession>.
 *
 * @param {function} onProgress - Callback (percent) báo tiến trình tải
 */
export async function loadModel(onProgress) {
  if (_session) return _session
  if (_loading) return _loading

  _loading = (async () => {
    try {
      // Ưu tiên WebAssembly vì ổn định nhất trên mọi thiết bị
      ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4
      ort.env.wasm.simd = true

      if (onProgress) onProgress(10)

      const response = await fetch(MODEL_URL)
      if (!response.ok) throw new Error(`Cannot fetch model: ${response.status}`)

      const contentLength = response.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength) : 0
      const reader = response.body.getReader()

      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (onProgress && total > 0) {
          onProgress(10 + Math.round((received / total) * 70))
        }
      }

      const modelBuffer = new Uint8Array(received)
      let offset = 0
      for (const chunk of chunks) {
        modelBuffer.set(chunk, offset)
        offset += chunk.length
      }

      if (onProgress) onProgress(85)

      _session = await ort.InferenceSession.create(modelBuffer.buffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })

      if (onProgress) onProgress(100)

      console.log('[YOLO-ONNX] Model loaded. Inputs:', _session.inputNames, 'Outputs:', _session.outputNames)
      return _session
    } catch (err) {
      _loading = null
      throw err
    }
  })()

  return _loading
}

/**
 * Kiểm tra model đã load chưa.
 */
export function isModelLoaded() {
  return _session !== null
}

// ============================================================
// Tiền xử lý: Chuyển video frame → Float32Array chuẩn YOLO
// ============================================================

/**
 * Lấy 1 frame từ <video> và chuyển sang tensor NCHW [1, 3, 640, 640].
 *
 * Cách làm: Letterbox resize (giữ tỷ lệ gốc, đệm phần thừa bằng
 * pixel xám 114/255) để ảnh không bị méo.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLCanvasElement} workCanvas - Canvas tạm để vẽ frame
 * @returns {{ tensor: ort.Tensor, scale: number, padX: number, padY: number }}
 */
export function preprocessFrame(videoEl, workCanvas) {
  const vw = videoEl.videoWidth
  const vh = videoEl.videoHeight

  workCanvas.width = INPUT_SIZE
  workCanvas.height = INPUT_SIZE
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true })

  // Letterbox: tính scale giữ tỷ lệ gốc
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh)
  const newW = Math.round(vw * scale)
  const newH = Math.round(vh * scale)
  const padX = (INPUT_SIZE - newW) / 2
  const padY = (INPUT_SIZE - newH) / 2

  // Nền xám (114, 114, 114) - chuẩn YOLO letterbox
  ctx.fillStyle = 'rgb(114, 114, 114)'
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  ctx.drawImage(videoEl, padX, padY, newW, newH)

  // Đọc pixel data RGBA
  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
  const pixels = imageData.data  // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]

  // Chuyển sang NCHW Float32 normalized [0..1]
  const totalPixels = INPUT_SIZE * INPUT_SIZE
  const float32 = new Float32Array(3 * totalPixels)

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 4
    float32[i]                  = pixels[base]     / 255.0  // R channel
    float32[totalPixels + i]     = pixels[base + 1] / 255.0  // G channel
    float32[2 * totalPixels + i] = pixels[base + 2] / 255.0  // B channel
  }

  const tensor = new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])

  return { tensor, scale, padX, padY }
}

// ============================================================
// Hậu xử lý: Decode raw tensor → boxes + keypoints + NMS
// ============================================================

/**
 * Chạy inference và trả về danh sách khuôn mặt.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLCanvasElement} workCanvas
 * @returns {Promise<Array<{box: {x1,y1,x2,y2}, score: number, keypoints: number[][]}>>}
 */
export async function detectFaces(videoEl, workCanvas) {
  if (!_session) return []

  const { tensor, scale, padX, padY } = preprocessFrame(videoEl, workCanvas)

  // Chạy model
  const inputName = _session.inputNames[0]
  const results = await _session.run({ [inputName]: tensor })

  // Output tensor: shape [1, numFeatures, numDetections]
  // numFeatures = 4 (box: cx,cy,w,h) + 1 (score) + numKeypoints*3 (x,y,conf)
  const outputName = _session.outputNames[0]
  const output = results[outputName]
  const data = output.data  // Float32Array
  const shape = output.dims // [1, numFeatures, numDetections]

  if (DEBUG_YOLO) {
    console.info(`[YOLO model] output shape=${JSON.stringify(shape)}`)
  }

  const numDetections = shape[1]
  const numFeatures = shape[2]

  // Decode tất cả detections
  // Tensor layout: [batch=1, numDetections=300, numFeatures=6]
  // Với 6 features: [x1, y1, x2, y2, score, ...]
  const candidates = []

  for (let d = 0; d < numDetections; d++) {
    const base = d * numFeatures

    // Score ở feature index 4: data[d * 6 + 4]
    const score = data[base + 4]
    if (score < CONF_THRESHOLD) continue

    // Box: [x1, y1, x2, y2] — thẳng tọa độ pixel đã decode sẵn
    const x1 = data[base + 0]
    const y1 = data[base + 1]
    const x2 = data[base + 2]
    const y2 = data[base + 3]

    // Chuyển từ tọa độ letterbox → tọa độ video gốc
    const bx1 = (x1 - padX) / scale
    const by1 = (y1 - padY) / scale
    const bx2 = (x2 - padX) / scale
    const by2 = (y2 - padY) / scale

    // Parse keypoints (nếu model có — feature 5+: 5 điểm × 3 values = 15)
    const keypoints = []
    const kptBase = base + 5
    for (let k = 0; k < NUM_KEYPOINTS; k++) {
      const kx = data[kptBase + k * 3]
      const ky = data[kptBase + k * 3 + 1]
      keypoints.push([
        (kx - padX) / scale,
        (ky - padY) / scale,
      ])
    }

    candidates.push({ box: { x1: bx1, y1: by1, x2: bx2, y2: by2 }, score, keypoints })
  }

  // NMS: loại bỏ các box trùng lặp
  const result = nms(candidates, IOU_THRESHOLD)
  if (DEBUG_YOLO && result.length > 0) {
    console.info(`[YOLO] raw=${candidates.length} → nms=${result.length} | first box: x1=${result[0].box.x1.toFixed(0)} y1=${result[0].box.y1.toFixed(0)} score=${result[0].score.toFixed(3)}`)
  }
  return result
}

// ============================================================
// Non-Maximum Suppression (NMS) viết bằng JS
// ============================================================

/**
 * Lọc danh sách detections bằng thuật toán NMS Greedy chuẩn.
 *
 * Thuật toán:
 *   1. Sắp xếp theo score giảm dần
 *   2. Lấy box score cao nhất → keep
 *   3. Xóa các box có IoU > ngưỡng so với box vừa keep
 *   4. Lặp lại cho đến hết
 *
 * @param {Array} detections - Mảng { box, score, keypoints }
 * @param {number} iouThreshold
 * @returns {Array} Detections đã lọc
 */
function nms(detections, iouThreshold) {
  if (detections.length === 0) return []

  // Sắp xếp theo score giảm dần
  detections.sort((a, b) => b.score - a.score)

  const kept = []
  const suppressed = new Set()

  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue
    kept.push(detections[i])

    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) continue
      if (computeIoU(detections[i].box, detections[j].box) > iouThreshold) {
        suppressed.add(j)
      }
    }
  }

  return kept
}

/**
 * Tính IoU (Intersection over Union) giữa 2 box.
 */
function computeIoU(a, b) {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (intersection === 0) return 0

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)

  return intersection / (areaA + areaB - intersection)
}

// ============================================================
// Tiện ích: Cắt khuôn mặt từ video frame (cho gửi lên server)
// ============================================================

/**
 * Cắt 1 khuôn mặt từ video với padding ~40%, trả về Blob JPEG
 * và mảng keypoints đã re-map về tọa độ local trong crop.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {{box, keypoints}} detection
 * @param {number} paddingRatio - Tỷ lệ padding (0.4 = 40%)
 * @returns {Promise<{blob: Blob, localKeypoints: number[], canvas: HTMLCanvasElement}>}
 */
export async function cropFace(videoEl, detection, paddingRatio = 0.4) {
  const vw = videoEl.videoWidth
  const vh = videoEl.videoHeight
  const { box, keypoints } = detection

  // Tính vùng crop có padding
  const bw = box.x2 - box.x1
  const bh = box.y2 - box.y1
  const padW = bw * paddingRatio
  const padH = bh * paddingRatio

  const cropX1 = Math.max(0, Math.round(box.x1 - padW))
  const cropY1 = Math.max(0, Math.round(box.y1 - padH))
  const cropX2 = Math.min(vw, Math.round(box.x2 + padW))
  const cropY2 = Math.min(vh, Math.round(box.y2 + padH))
  const cropW = cropX2 - cropX1
  const cropH = cropY2 - cropY1

  if (cropW < 20 || cropH < 20) return null

  // Vẽ vùng crop lên canvas tạm
  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  ctx.translate(cropW, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(videoEl, cropX1, cropY1, cropW, cropH, 0, 0, cropW, cropH)

  // Re-map keypoints về tọa độ local (trong crop)
  // Format flat: [x0,y0, x1,y1, x2,y2, x3,y3, x4,y4]
  const localKeypoints = []
  if (keypoints) {
    for (const [kx, ky] of keypoints) {
      const localX = Math.round(kx - cropX1)
      localKeypoints.push(
        cropW - localX,
        Math.round(ky - cropY1),
      )
    }
  }

  // Chuyển canvas → JPEG blob
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })

  return { blob, localKeypoints, canvas }
}
