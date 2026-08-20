import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const TOKEN_KEY = 'ak.access_token'
export const REFRESH_KEY = 'ak.refresh_token'
export const USER_KEY = 'ak.user'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set(access, refresh) {
    if (access) localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Callbacks the app registers so it can react to auth/connectivity events. */
const listeners = {
  onSessionExpired: null,
  onOffline: null,
  onOnline: null,
}

export function registerApiListeners(handlers) {
  Object.assign(listeners, handlers)
}

/** Normalises every backend failure into one predictable shape. */
export class ApiError extends Error {
  constructor({ message, code, status, details }) {
    super(message)
    this.name = 'ApiError'
    this.code = code || 'error'
    this.status = status || 0
    this.details = details || null
  }

  get isOffline() {
    return this.code === 'network_error'
  }

  get isAuth() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }
}

function toApiError(error) {
  if (error.response) {
    const body = error.response.data || {}
    const detail = body.error || {}
    return new ApiError({
      message: detail.message || `Request failed (${error.response.status})`,
      code: detail.code || 'error',
      status: error.response.status,
      details: detail.details,
    })
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError({ message: 'The server took too long to respond.', code: 'timeout' })
  }
  return new ApiError({
    message: 'Cannot reach the server. Working offline.',
    code: 'network_error',
  })
}

let refreshing = null

async function tryRefresh() {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE_URL}/auth/refresh`, null, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      })
      .then((response) => {
        const next = response.data?.data?.access_token
        if (next) {
          tokenStore.set(next, null)
          return true
        }
        return false
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

api.interceptors.response.use(
  (response) => {
    listeners.onOnline?.()
    return response
  },
  async (error) => {
    const apiError = toApiError(error)
    const original = error.config || {}

    // One silent refresh attempt before giving up on an expired access token.
    if (
      apiError.status === 401 &&
      apiError.code === 'token_expired' &&
      !original.__retried
    ) {
      original.__retried = true
      if (await tryRefresh()) {
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${tokenStore.get()}`
        return api.request(original)
      }
    }

    if (apiError.isAuth) {
      tokenStore.clear()
      listeners.onSessionExpired?.(apiError)
    }
    if (apiError.isOffline) {
      listeners.onOffline?.(apiError)
    }
    return Promise.reject(apiError)
  }
)

/** Unwraps the {success, data, ...meta} envelope; throws ApiError otherwise. */
export async function request(config) {
  const response = await api.request(config)
  const body = response.data
  if (body && typeof body === 'object' && 'success' in body) {
    if (!body.success) throw new ApiError(body.error || { message: 'Request failed' })
    return body.data
  }
  return body
}

/** Same as request() but keeps the sibling meta keys (counts, pagination). */
export async function requestFull(config) {
  const response = await api.request(config)
  return response.data
}

export const get = (url, params, config = {}) => request({ method: 'get', url, params, ...config })
export const getFull = (url, params, config = {}) =>
  requestFull({ method: 'get', url, params, ...config })
export const post = (url, data, config = {}) => request({ method: 'post', url, data, ...config })
export const postFull = (url, data, config = {}) =>
  requestFull({ method: 'post', url, data, ...config })
export const put = (url, data, config = {}) => request({ method: 'put', url, data, ...config })
export const patch = (url, data, config = {}) => request({ method: 'patch', url, data, ...config })
export const del = (url, config = {}) => request({ method: 'delete', url, ...config })

/** Downloads a file and hands the browser a save dialog. */
export async function download(url, params, fallbackName = 'export') {
  const response = await api.request({ method: 'get', url, params, responseType: 'blob' })
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : fallbackName

  const href = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(href)
  return filename
}

/** Liveness probe used by the offline indicator. */
export async function health() {
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 4000 })
    return response.data?.data?.status === 'ok'
  } catch {
    return false
  }
}

export default api
