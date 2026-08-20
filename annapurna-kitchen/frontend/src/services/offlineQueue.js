/**
 * IndexedDB-backed offline billing queue (02-TRD: "local queue that syncs to
 * server on reconnect").
 *
 * Every queued sale carries a `client_uid`. The backend treats that as an
 * idempotency key, so replaying the queue - even twice - can never produce a
 * duplicate bill.
 */

const DB_NAME = 'annapurna-offline'
const DB_VERSION = 1
const SALES = 'pending_sales'
const RECEIPTS = 'cached_receipts'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser has no IndexedDB; offline billing is unavailable.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SALES)) {
        const store = db.createObjectStore(SALES, { keyPath: 'client_uid' })
        store.createIndex('queued_at', 'queued_at')
        store.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains(RECEIPTS)) {
        db.createObjectStore(RECEIPTS, { keyPath: 'client_uid' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

/** Wrap a single IDBRequest in a promise. */
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run one operation against a store and resolve with its result. */
async function run(storeName, mode, operation) {
  const db = await openDb()
  const transaction = db.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)
  const result = await wrap(operation(store))
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  return result
}

/** RFC4122-ish unique id; crypto.randomUUID where available. */
export function newClientUid() {
  if (window.crypto?.randomUUID) return `ak-${window.crypto.randomUUID()}`
  return `ak-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const offlineQueue = {
  available: () => 'indexedDB' in window,

  /** Store a completed-but-unsent sale. */
  async enqueue(sale) {
    const record = {
      ...sale,
      client_uid: sale.client_uid || newClientUid(),
      queued_at: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      last_error: null,
    }
    await run(SALES, 'readwrite', (store) => store.put(record))
    return record
  },

  async all() {
    const rows = (await run(SALES, 'readonly', (store) => store.getAll())) || []
    return rows.sort((a, b) => String(a.queued_at).localeCompare(String(b.queued_at)))
  },

  async pending() {
    const rows = await this.all()
    return rows.filter((row) => row.status !== 'synced')
  },

  async count() {
    try {
      return (await this.pending()).length
    } catch {
      return 0
    }
  },

  async remove(clientUid) {
    await run(SALES, 'readwrite', (store) => store.delete(clientUid))
  },

  async markFailed(clientUid, message) {
    const row = await run(SALES, 'readonly', (store) => store.get(clientUid))
    if (!row) return
    await run(SALES, 'readwrite', (store) =>
      store.put({
        ...row,
        status: 'failed',
        attempts: (row.attempts || 0) + 1,
        last_error: message,
      })
    )
  },

  async clear() {
    await run(SALES, 'readwrite', (store) => store.clear())
  },

  /** Cache the receipt payload so an offline sale can still be reprinted. */
  async cacheReceipt(clientUid, receipt) {
    await run(RECEIPTS, 'readwrite', (store) =>
      store.put({ client_uid: clientUid, receipt, cached_at: new Date().toISOString() })
    )
  },

  async getReceipt(clientUid) {
    const row = await run(RECEIPTS, 'readonly', (store) => store.get(clientUid))
    return row?.receipt || null
  },
}

export default offlineQueue
