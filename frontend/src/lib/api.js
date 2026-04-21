export class ApiError extends Error {
  constructor(message, { payload = null, status = 0 } = {}) {
    super(message)
    this.name = 'ApiError'
    this.payload = payload
    this.status = status
  }
}

async function parseResponseBody(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    credentials = 'include',
    headers = {},
    method = 'GET',
  } = options

  const requestHeaders = { ...headers }
  const requestInit = { credentials, headers: requestHeaders, method }

  if (body instanceof FormData) {
    requestInit.body = body
  } else if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
    requestInit.body = JSON.stringify(body)
  }

  const response = await fetch(path, requestInit)
  const payload = await parseResponseBody(response)

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && payload.message) ||
      (typeof payload === 'string' ? payload : response.statusText) ||
      'Request failed'
    throw new ApiError(message, { payload, status: response.status })
  }

  return payload
}

export function loginManager(usernameOrCredentials, password) {
  const credentials =
    typeof usernameOrCredentials === 'object' && usernameOrCredentials !== null
      ? usernameOrCredentials
      : {
          password,
          username: usernameOrCredentials,
        }

  return apiRequest('/api/manager/login', {
    body: credentials,
    method: 'POST',
  })
}

export function logoutManager() {
  return apiRequest('/api/manager/logout', {
    method: 'POST',
  })
}

export function fetchManagerMe() {
  return apiRequest('/api/manager/me')
}

export const getCurrentManager = fetchManagerMe
export const getManager = fetchManagerMe

export function fetchDashboardSummary() {
  return apiRequest('/api/manager/dashboard')
}

export function fetchEmployees(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.department) searchParams.set('department', params.department);
  if (params.position) searchParams.set('position', params.position);
  const query = searchParams.toString();
  return apiRequest(`/api/manager/employees${query ? '?' + query : ''}`);
}

export const getEmployees = fetchEmployees;

export function createEmployee(employeeOrCode, fullName, position) {
  const employee =
    typeof employeeOrCode === 'object' && employeeOrCode !== null
      ? employeeOrCode
      : {
          employee_code: employeeOrCode,
          full_name: fullName,
          position,
        }

  return apiRequest('/api/manager/employees', {
    body: employee,
    method: 'POST',
  })
}

export function updateEmployee(employeeId, employee) {
  return apiRequest(`/api/manager/employees/${employeeId}`, {
    body: employee,
    method: 'PUT',
  })
}

export function deleteEmployee(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}`, {
    method: 'DELETE',
  })
}

export function fetchEmployeeFaceSamples(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}/face-samples`)
}

export const getFaceSamples = fetchEmployeeFaceSamples

export function enrollEmployeeFaces(employeeId, formDataOrFiles) {
  const formData =
    formDataOrFiles instanceof FormData
      ? formDataOrFiles
      : (() => {
          const converted = new FormData()
          Array.from(formDataOrFiles || []).forEach((file) => {
            converted.append('images', file, file?.name || 'face.jpg')
          })
          return converted
        })()

  return apiRequest(`/api/manager/employees/${employeeId}/face-enrollment`, {
    body: formData,
    method: 'POST',
  })
}

export const enrollFaceSamples = enrollEmployeeFaces

/**
 * Batch face enrollment: sends a single multipart request containing the
 * accepted frame crops plus lightweight capture metadata.
 *
 * Supported frame shape:
 *   { blob, capturedAtMs, detectorScore, blurScore, hintPose }
 *
 * Legacy callers may still pass `(employeeId, payloadByPose, batchFrames)`.
 */
export function enrollEmployeeFacesBatch(employeeId, payloadOrFrames = [], legacyBatchFrames = []) {
  const normalizedFrames = _normalizeBatchFrames(payloadOrFrames, legacyBatchFrames)
  const formData = new FormData()

  normalizedFrames.forEach((frame, index) => {
    if (!(frame?.blob instanceof Blob)) return
    const extension = _mimeTypeToExtension(frame.blob.type)
    formData.append('frames', frame.blob, `frame-${index + 1}.${extension}`)
  })

  if (normalizedFrames.length < 20) {
    throw new ApiError('Chưa thu đủ khung hình để gửi lên máy chủ.', {
      payload: { frame_count: normalizedFrames.length, status: 'insufficient_frames' },
      status: 400,
    })
  }

  formData.append('metadata', JSON.stringify(_buildBatchMetadata(normalizedFrames)))

  return apiRequest(`/api/manager/employees/${employeeId}/face-enrollment/batch`, {
    body: formData,
    method: 'POST',
  })
}

// ─── Internal helpers (not exported) ────────────────────────────────────────

function _dataUrlToBlob(dataUrl) {
  const [meta, content] = dataUrl.split(',')
  const mimeMatch = meta.match(/data:(.*?);base64/)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'
  const binary = window.atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

const FACE_FIELD_MAP = {
  straight: 'front_image',
  left: 'left_image',
  right: 'right_image',
  up: 'up_image',
  down: 'down_image',
}

function _normalizeBatchFrames(payloadOrFrames, legacyBatchFrames) {
  if (Array.isArray(payloadOrFrames)) {
    return payloadOrFrames.filter(_isAcceptedFrame)
  }

  if (Array.isArray(legacyBatchFrames) && legacyBatchFrames.length > 0) {
    return legacyBatchFrames
      .map((frame, index) => {
        const dataUrl = frame?.image
        if (!dataUrl) return null
        return {
          blob: _dataUrlToBlob(dataUrl),
          capturedAtMs: frame.timestamp ?? index * 180,
          detectorScore: frame.detectorScore ?? null,
          blurScore: frame.blurScore ?? null,
          hintPose: frame.pose || 'front',
        }
      })
      .filter(Boolean)
  }

  const payloadByPose = payloadOrFrames
  return Object.entries(FACE_FIELD_MAP)
    .map(([pose]) => payloadByPose?.[pose] ? {
      blob: _dataUrlToBlob(payloadByPose[pose]),
      capturedAtMs: 0,
      detectorScore: null,
      blurScore: null,
      hintPose: pose === 'straight' ? 'front' : pose,
    } : null)
    .filter(Boolean)
}

function _isAcceptedFrame(frame) {
  return frame?.blob instanceof Blob
}

function _buildBatchMetadata(frames) {
  return {
    source: 'scanner_capture',
    capture_mode: 'goal_based',
    frames: frames.map((frame, index) => ({
      index,
      hint_pose: frame.hintPose || 'front',
      timestamp_ms: Number.isFinite(frame.capturedAtMs) ? frame.capturedAtMs : index * 180,
      detector_score: typeof frame.detectorScore === 'number' ? frame.detectorScore : null,
      blur_score: typeof frame.blurScore === 'number' ? frame.blurScore : null,
    })),
  }
}

function _mimeTypeToExtension(mimeType) {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'jpg'
  }
}

// ─── Face sample management ──────────────────────────────────────────────────

export function deleteEmployeeFaceSamples(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}/face-samples`, {
    method: 'DELETE',
  })
}

export function replaceEmployeeFaceSample(employeeId, sampleIndex, file) {
  const formData = new FormData()
  formData.append('image', file, file?.name || `sample-${sampleIndex}.jpg`)

  return apiRequest(`/api/manager/employees/${employeeId}/face-samples/${sampleIndex}`, {
    body: formData,
    method: 'PUT',
  })
}

export const deleteFaceSamples = deleteEmployeeFaceSamples
