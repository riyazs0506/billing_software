import { del, get, patch, post, put } from './api'

export const menuService = {
  // categories
  categories: (params) => get('/menu/categories', params),
  createCategory: (payload) => post('/menu/categories', payload),
  updateCategory: (id, payload) => put(`/menu/categories/${id}`, payload),
  deleteCategory: (id) => del(`/menu/categories/${id}`),

  // items
  items: (params) => get('/menu/items', params),
  grid: () => get('/menu/items/grid'),
  item: (id) => get(`/menu/items/${id}`),
  createItem: (payload) => post('/menu/items', payload),
  updateItem: (id, payload) => put(`/menu/items/${id}`, payload),
  toggleAvailability: (id, is_available) =>
    patch(`/menu/items/${id}/availability`, { is_available }),
  deleteItem: (id) => del(`/menu/items/${id}`),
}

export default menuService
