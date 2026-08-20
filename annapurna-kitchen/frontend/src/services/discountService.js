import { del, get, getFull, post, put } from './api'

export const discountService = {
  active: () => get('/discounts/active'),
  list: () => getFull('/discounts'),
  getGlobal: () => get('/discounts/global'),
  setGlobal: (payload) => put('/discounts/global', payload),
  create: (payload) => post('/discounts', payload),
  update: (id, payload) => put(`/discounts/${id}`, payload),
  remove: (id) => del(`/discounts/${id}`),
  evaluateOn: (date) => get('/discounts/evaluate', { date }),
}

export default discountService
