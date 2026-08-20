import { del, get, getFull, post, put } from './api'

export const customerService = {
  search: (q) => get('/customers/search', { q }),
  create: (payload) => post('/customers', payload),
  list: (params) => getFull('/customers', params),
  get: (id) => get(`/customers/${id}`),
  update: (id, payload) => put(`/customers/${id}`, payload),
  remove: (id) => del(`/customers/${id}`),
  history: (id, params) => get(`/customers/${id}/history`, params),
}

export default customerService
