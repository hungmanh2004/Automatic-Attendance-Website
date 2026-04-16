import { apiRequest } from './api'

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams()
  if (params.from) {
    searchParams.set('from', params.from)
  }
  if (params.to) {
    searchParams.set('to', params.to)
  }
  if (params.search) {
    searchParams.set('search', params.search)
  }
  if (params.department) {
    searchParams.set('department', params.department)
  }
  if (params.position) {
    searchParams.set('position', params.position)
  }
  if (params.page != null) {
    searchParams.set('page', String(params.page))
  }
  if (params.per_page != null) {
    searchParams.set('per_page', String(params.per_page))
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function listAttendance(params = {}) {
  return apiRequest(`/api/manager/attendance${buildQuery(params)}`)
}