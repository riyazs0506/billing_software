import { del, get, post, put } from './api'

export const inventoryService = {
  dashboard: () => get('/inventory/dashboard'),
  alerts: () => get('/inventory/alerts'),

  materials: (params) => get('/inventory/materials', params),
  createMaterial: (payload) => post('/inventory/materials', payload),
  updateMaterial: (id, payload) => put(`/inventory/materials/${id}`, payload),
  deleteMaterial: (id) => del(`/inventory/materials/${id}`),

  updateStock: (id, current_stock, note) =>
    post(`/inventory/materials/${id}/stock`, { current_stock, note }),
  bulkStock: (entries) => post('/inventory/stock/bulk', { entries }),
  movements: (id, params) => get(`/inventory/materials/${id}/movements`, params),

  yields: (params) => get('/inventory/yields', params),
  createYield: (payload) => post('/inventory/yields', payload),
  updateYield: (id, payload) => put(`/inventory/yields/${id}`, payload),
  deleteYield: (id) => del(`/inventory/yields/${id}`),

  /** Output = stock x yield/unit, previewed without saving anything. */
  calculate: (stock, min_yield, max_yield) =>
    get('/inventory/calculate', { stock, min_yield, max_yield }),
}

export default inventoryService
