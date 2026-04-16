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

export function fetchEmployees() {
  return apiRequest('/api/manager/employees')
}

export const getEmployees = fetchEmployees

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
 * Batch face enrollment: captures multiple frames and sends them with
 * metadata to the backend's batch enrollment endpoint.
 *
 * @param {number} employeeId
 * @param {object} payloadByPose  - { front: dataUrl, left: dataUrl, ... } (legacy/fallback data)
 * @param {Array}  batchFrames    - [{ image: dataUrl, pose: string, timestamp: number }]
 * @returns {Promise<object>} Backend response
 */
export function enrollEmployeeFacesBatch(employeeId, payloadByPose, batchFrames = []) {
  const formData = new FormData()
  let appendedCount = 0

  batchFrames.forEach((frame, index) => {
    if (!frame?.image) return
    formData.append('frames', _dataUrlToBlob(frame.image), `frame-${index + 1}.jpg`)
    appendedCount += 1
  })

  appendedCount = _appendFallbackFrames(formData, payloadByPose, appendedCount)

  if (appendedCount < 20) {
    throw new ApiError('Chưa thu đủ khung hình để gửi lên máy chủ.', {
      payload: { frame_count: appendedCount, status: 'insufficient_frames' },
      status: 400,
    })
  }

  formData.append('metadata', JSON.stringify(_buildBatchMetadata(batchFrames, payloadByPose)))

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

function _appendFallbackFrames(formData, payloadByPose, existingCount) {
  const fallbackImages = Object.entries(FACE_FIELD_MAP)
    .map(([pose]) => ({ pose, image: payloadByPose?.[pose] }))
    .filter((item) => item.image)

  let count = existingCount
  let index = 0

  while (count < 20 && fallbackImages.length > 0) {
    const item = fallbackImages[index % fallbackImages.length]
    formData.append('frames', _dataUrlToBlob(item.image), `fallback-${count + 1}.jpg`)
    count += 1
    index += 1
  }

  return count
}

function _buildBatchMetadata(batchFrames, payloadByPose) {
  const source = batchFrames.length ? 'scanner_capture' : 'guided_manual'
  const frames = batchFrames.length
    ? batchFrames.map((frame, i) => ({ index: i, hint_pose: frame.pose || 'front', timestamp_ms: frame.timestamp || i * 180 }))
    : Object.entries(FACE_FIELD_MAP)
        .map(([pose]) => ({ image: payloadByPose?.[pose], pose }))
        .filter((item) => item.image)
        .flatMap((item) =>
          Array.from({ length: 4 }, (_, i) => ({ ...item, timestamp: i * 180 })),
        )

  return { source, capture_mode: 'guided', frames }
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