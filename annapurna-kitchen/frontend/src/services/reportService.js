import { download, get } from './api'

const range = (start_date, end_date) => ({ start_date, end_date })

export const reportService = {
  dashboard: (date) => get('/reports/dashboard', date ? { date } : undefined),
  daily: (start, end) => get('/reports/daily', range(start, end)),
  itemWise: (start, end, limit) => get('/reports/item-wise', { ...range(start, end), limit }),
  staffWise: (start, end) => get('/reports/staff-wise', range(start, end)),
  expenses: (start, end) => get('/reports/expenses', range(start, end)),
  profitLoss: (start, end) => get('/reports/profit-loss', range(start, end)),
  summary: (start, end) => get('/reports/summary', range(start, end)),
  bills: (start, end) => get('/reports/bills', range(start, end)),
  quickRanges: () => get('/reports/quick-ranges'),

  /**
   * @param {string} kind  daily | item-wise | staff-wise | expenses |
   *                       profit-loss | bills | all
   * @param {'csv'|'xlsx'} format
   */
  export: (kind, format, start, end) =>
    download(
      `/reports/export/${kind}`,
      { format, ...range(start, end) },
      `annapurna-${kind}.${format === 'xlsx' ? 'xlsx' : 'csv'}`
    ),
}

export default reportService
