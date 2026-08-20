import { del, get, getFull, post, put } from './api'
import offlineQueue, { newClientUid } from './offlineQueue'

/** Tables, orders and KOT. */
export const tableService = {
  list: (params) => getFull('/tables', params),
  get: (id) => get(`/tables/${id}`),
  create: (payload) => post('/tables', payload),
  update: (id, payload) => put(`/tables/${id}`, payload),
  remove: (id) => del(`/tables/${id}`),
  assign: (id, payload) => post(`/tables/${id}/assign`, payload || {}),
  merge: (target_order_id, source_order_id) =>
    post('/tables/merge', { target_order_id, source_order_id }),
  split: (order_id, groups) => post('/tables/split', { order_id, groups }),
  release: (id) => post(`/tables/${id}/release`),
}

export const orderService = {
  list: (params) => get('/orders', params),
  get: (id) => get(`/orders/${id}`),
  create: (payload) => post('/orders', payload),
  update: (id, payload) => put(`/orders/${id}`, payload),
  addItem: (orderId, payload) => post(`/orders/${orderId}/items`, payload),
  updateItem: (orderId, itemId, quantity) =>
    put(`/orders/${orderId}/items/${itemId}`, { quantity }),
  removeItem: (orderId, itemId) => del(`/orders/${orderId}/items/${itemId}`),
  sendKot: (orderId) => post(`/orders/${orderId}/kot`),
  reprintKot: (orderId) => get(`/orders/${orderId}/kot`),
  cancel: (orderId) => post(`/orders/${orderId}/cancel`),
}

/** Bill calculation, generation, payment and receipts. */
export const billingService = {
  calculate: (order_id, order_item_ids) =>
    post('/billing/calculate', { order_id, order_item_ids }),
  activeDiscount: () => get('/billing/active-discount'),
  taxConfig: () => get('/billing/tax-config'),

  generate: (order_id, extra = {}) => post('/billing/generate', { order_id, ...extra }),
  complete: (billId, payments, extra = {}) =>
    post(`/billing/bills/${billId}/complete`, { payments, ...extra }),

  bills: (params) => get('/billing/bills', params),
  pendingBills: () => get('/billing/bills/pending'),
  bill: (id) => get(`/billing/bills/${id}`),
  receipt: (id) => get(`/billing/bills/${id}/receipt`),
  voidBill: (id) => post(`/billing/bills/${id}/void`),

  quickSale: (payload) => post('/billing/quick-sale', payload),
  sync: (operations) => post('/billing/sync', { operations }),

  /**
   * Complete a sale, falling back to the offline queue when the network is
   * down. The client_uid makes the later replay idempotent.
   */
  async completeResilient(billId, payments, context = {}) {
    const clientUid = context.client_uid || newClientUid()
    try {
      const result = await this.complete(billId, payments, { client_uid: clientUid })
      return { ...result, queued: false }
    } catch (error) {
      if (!error.isOffline) throw error
      const queued = await offlineQueue.enqueue({
        client_uid: clientUid,
        order_type: context.order_type,
        table_id: context.table_id,
        customer_id: context.customer_id,
        items: context.items,
        payments,
        bill_snapshot: context.bill_snapshot || null,
      })
      if (context.receipt) await offlineQueue.cacheReceipt(clientUid, context.receipt)
      return { queued: true, client_uid: clientUid, record: queued }
    }
  },

  /** Push everything sitting in the offline queue. */
  async flushQueue() {
    const pending = await offlineQueue.pending()
    if (!pending.length) return { synced: 0, duplicates: 0, failed: 0, results: [] }

    const operations = pending.map((row) => ({
      client_uid: row.client_uid,
      order_type: row.order_type,
      table_id: row.table_id,
      customer_id: row.customer_id,
      items: row.items,
      payments: row.payments,
    }))
    const outcome = await this.sync(operations)

    await Promise.all(
      outcome.results.map(async (result) => {
        if (result.status === 'synced' || result.status === 'duplicate') {
          await offlineQueue.remove(result.client_uid)
        } else {
          await offlineQueue.markFailed(result.client_uid, result.error)
        }
      })
    )
    return outcome
  },
}

export const paymentService = {
  modes: () => get('/payments/modes'),
  forBill: (billId) => get(`/payments/bill/${billId}`),
  validate: (bill_id, payments) => post('/payments/validate', { bill_id, payments }),
  addPartial: (billId, payments) => post(`/payments/bill/${billId}`, { payments }),
  list: (params) => get('/payments', params),
}

export default billingService
