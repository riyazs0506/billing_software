import { get, post, tokenStore, USER_KEY } from './api'

export const authService = {
  async login(username, password) {
    const data = await post('/auth/login', { username, password })
    tokenStore.set(data.access_token, data.refresh_token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    return data
  },

  async logout() {
    try {
      await post('/auth/logout')
    } finally {
      tokenStore.clear()
    }
  },

  me: () => get('/auth/me'),
  validateSession: () => get('/auth/session'),
  shifts: (params) => get('/auth/shifts', params),
  changePassword: (current_password, new_password) =>
    post('/auth/change-password', { current_password, new_password }),

  cachedUser() {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  hasToken: () => Boolean(tokenStore.get()),
}

export default authService
