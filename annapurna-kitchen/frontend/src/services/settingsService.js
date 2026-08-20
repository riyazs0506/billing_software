import { get, post, put } from './api'

export const settingsService = {
  all: () => get('/settings'),
  public: () => get('/settings/public'),
  update: (settings) => put('/settings', { settings }),
  reset: (prefix) => post('/settings/reset', { prefix }),
  printerTest: () => post('/settings/printer/test'),
}

export default settingsService
