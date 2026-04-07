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

export function deleteEmployeeFaceSamples(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}/face-samples`, {
    method: 'DELETE',
  })
}

export const deleteFaceSamples = deleteEmployeeFaceSamples
