import { apiRequest } from './api'

export function createGuestFrameFormData(frameFile) {
  const formData = new FormData()
  formData.append('frame', frameFile, frameFile?.name || 'guest-frame.jpg')
  return formData
}

export async function submitGuestCheckin(frameFile) {
  return apiRequest('/api/guest/checkin', {
    body: createGuestFrameFormData(frameFile),
    method: 'POST',
  })
}

/**
 * Luồng mới: gửi ảnh crop khuôn mặt + 5 keypoints lên backend.
 * Frontend đã chạy YOLO ONNX để detect + crop, backend chỉ align + embed.
 *
 * @param {Blob} cropBlob - Ảnh crop JPEG (đã có padding)
 * @param {number[]} localKeypoints - Mảng flat [x0,y0,...,x4,y4] tọa độ local
 * @returns {Promise<object>} Response từ backend
 */
export async function submitGuestCheckinKpts(cropBlob, localKeypoints) {
  const formData = new FormData()
  formData.append('crop', cropBlob, 'face-crop.jpg')
  if (localKeypoints && localKeypoints.length > 0) {
    formData.append('kpts', JSON.stringify(localKeypoints))
  }

  return apiRequest('/api/guest/checkin-kpts', {
    body: formData,
    method: 'POST',
  })
}

export async function captureGuestFrame(videoElement) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight

  const context = canvas.getContext('2d')
  if (context) {
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
  }

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })

  if (!blob) {
    return null
  }

  return new File([blob], 'guest-frame.jpg', { type: 'image/jpeg' })
}

