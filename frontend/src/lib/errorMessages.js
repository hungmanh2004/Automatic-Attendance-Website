const FRIENDLY_ERROR_MESSAGES = {
  already_checked_in: 'Nhân viên này đã được điểm danh trước đó.',
  denied: 'Quyền camera đã bị từ chối. Hãy cho phép camera và thử lại.',
  duplicate_employee_code: 'Mã nhân viên đã tồn tại.',
  employee_not_found: 'Không tìm thấy nhân viên được yêu cầu.',
  face_registration_exists: 'Nhân viên này đã có đăng ký khuôn mặt. Hãy xóa trước khi đăng ký lại.',
  face_sample_not_found: 'Không tìm thấy ảnh khuôn mặt được yêu cầu.',
  insufficient_valid_frames: 'Khung hình hợp lệ chưa đủ để hoàn tất đăng ký. Hãy thu thập lại chậm hơn và giữ mặt rõ nét.',
  invalid_credentials: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  invalid_request: 'Yêu cầu gửi lên không hợp lệ. Hãy thử lại.',
  multiple_faces: 'Trong khung hình có nhiều hơn một khuôn mặt. Hãy để chỉ một người vào khung.',
  network_error: 'Không thể kết nối tới máy chủ. Hãy thử lại.',
  no_face: 'Không phát hiện khuôn mặt. Hãy điều chỉnh góc nhìn và thử lại.',
  rate_limited: 'Bạn đang gửi quá nhiều yêu cầu. Hãy đợi vài giây rồi thử lại.',
  unauthorized: 'Bạn cần đăng nhập lại.',
  unknown: 'Không xác định được khuôn mặt. Hãy thử lại.',
}

const GUEST_RESULT_COPY = {
  already_checked_in: {
    label: 'Đã điểm danh',
    message: 'Khuôn mặt đã được ghi nhận trước đó trong ngày hôm nay.',
    tone: 'info',
    meta: (payload) =>
      [payload?.employee_code, payload?.full_name, payload?.checked_in_at]
        .filter(Boolean)
        .join(' | '),
  },
  multiple_faces: {
    label: 'Nhiều khuôn mặt',
    message: 'Chỉ cần một người trong khung hình để hệ thống nhận diện chính xác hơn.',
    tone: 'warning',
  },
  network_error: {
    label: 'Lỗi kết nối',
    message: 'Không thể kết nối tới máy chủ. Hãy thử lại.',
    tone: 'warning',
  },
  no_face: {
    label: 'Chưa thấy khuôn mặt',
    message: 'Hãy đưa mặt vào trung tâm khung hình và giữ ánh sáng ổn định.',
    tone: 'warning',
  },
  recognized: {
    label: 'Điểm danh thành công',
    message: 'Nhận diện thành công và đã ghi nhận check-in.',
    tone: 'success',
    meta: (payload) =>
      [payload?.employee_code, payload?.full_name, payload?.checked_in_at]
        .filter(Boolean)
        .join(' | '),
  },
  unknown: {
    label: 'Không nhận diện được',
    message: 'Hệ thống chưa xác định được khuôn mặt. Hãy thử lại với góc nhìn rõ hơn.',
    tone: 'neutral',
  },
}

export function getFriendlyBackendErrorMessage(errorOrCode, fallback = 'Đã có lỗi xảy ra.') {
  if (!errorOrCode) return fallback

  const candidateValues = []

  if (typeof errorOrCode === 'string') {
    candidateValues.push(errorOrCode)
  } else {
    if (typeof errorOrCode?.payload === 'string') {
      candidateValues.push(errorOrCode.payload)
    }

    if (errorOrCode?.payload && typeof errorOrCode.payload === 'object') {
      candidateValues.push(errorOrCode.payload.status)
      candidateValues.push(errorOrCode.payload.message)
    }

    if (typeof errorOrCode?.message === 'string') {
      candidateValues.push(errorOrCode.message)
    }

    if (typeof errorOrCode?.status === 'string') {
      candidateValues.push(errorOrCode.status)
    }
  }

  for (const candidate of candidateValues) {
    if (candidate && FRIENDLY_ERROR_MESSAGES[candidate]) {
      return FRIENDLY_ERROR_MESSAGES[candidate]
    }
  }

  return fallback
}

export const getFriendlyErrorMessage = getFriendlyBackendErrorMessage
export const getBackendErrorMessage = getFriendlyBackendErrorMessage

export function getGuestStatusMessage(status) {
  return FRIENDLY_ERROR_MESSAGES[status] || FRIENDLY_ERROR_MESSAGES.unknown
}

export const getGuestRecognitionMessage = getGuestStatusMessage

export function getGuestResultCopy(payload) {
  if (!payload?.status) {
    return {
      label: 'Chưa có kết quả',
      message: 'Hệ thống đang sẵn sàng.',
      tone: 'neutral',
    }
  }

  const copy =
    GUEST_RESULT_COPY[payload.status] || {
      label: 'Kết quả khác',
      message: getGuestStatusMessage(payload.status),
      tone: 'neutral',
    }

  if (typeof copy.meta === 'function') {
    return { ...copy, meta: copy.meta(payload) }
  }

  return copy
}
