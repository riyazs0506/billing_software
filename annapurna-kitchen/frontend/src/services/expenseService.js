import { del, get, getFull, post, put } from './api'

export const expenseService = {
  list: (params) => getFull('/expenses', params),
  create: (payload) => post('/expenses', payload),
  update: (id, payload) => put(`/expenses/${id}`, payload),
  remove: (id) => del(`/expenses/${id}`),
  categories: () => get('/expenses/categories'),
}

export default expenseService
