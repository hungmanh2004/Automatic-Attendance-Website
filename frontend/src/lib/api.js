async function parseResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { rawBody: text };
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && payload.message) ||
      (payload && typeof payload === "object" && payload.rawBody) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    body:
      options.body instanceof FormData || typeof options.body === "string"
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });

  return parseResponse(response);
}

export function loginManager(username, password) {
  return apiRequest("/api/manager/login", {
    method: "POST",
    body: { username, password },
  });
}

export function getCurrentManager() {
  return apiRequest("/api/manager/me");
}

export function getEmployees() {
  return apiRequest("/api/manager/employees");
}

export function createEmployee(employeeCode, fullName) {
  return apiRequest("/api/manager/employees", {
    method: "POST",
    body: {
      employee_code: employeeCode,
      full_name: fullName,
    },
  });
}

export function getFaceSamples(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}/face-samples`);
}

export function enrollFaceSamples(employeeId, files) {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("images", file);
  });

  return apiRequest(`/api/manager/employees/${employeeId}/face-enrollment`, {
    method: "POST",
    body: formData,
  });
}

export function deleteFaceSamples(employeeId) {
  return apiRequest(`/api/manager/employees/${employeeId}/face-samples`, {
    method: "DELETE",
  });
}
