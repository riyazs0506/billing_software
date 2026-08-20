# API Reference

Base URL: `/api` — every response uses one envelope.

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { "total": 42, "page": 1 } }

// failure
{
  "success": false,
  "error": {
    "code": "payment_short",
    "message": "Payment is short by 120.00. …",
    "details": { "bill_total": "420.00", "shortfall": "120.00" }
  }
}
```

Authenticate with `Authorization: Bearer <access_token>`.

**Access legend:** 🔓 public · 👥 admin + cashier · 🔒 admin only

---

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `validation_error` | 422 | A field failed validation; `details.field` names it |
| `invalid_credentials` | 401 | Wrong username or password |
| `token_expired` | 401 | Access token past its expiry — refresh |
| `session_expired` | 401 | Idle longer than `SESSION_IDLE_MINUTES` |
| `session_ended` | 401 | The shift was closed (logged out elsewhere) |
| `forbidden` | 403 | Role lacks access; `details` shows required vs actual |
| `not_found` | 404 | No such record |
| `conflict` | 409 | State conflict (already billed, name taken, …) |
| `table_busy` | 409 | Table already has an open order; `details.order_id` |
| `item_unavailable` | 409 | Menu item marked unavailable |
| `nothing_to_bill` | 409 | No unbilled lines on the order |
| `nothing_to_send` | 409 | No new lines for a KOT |
| `payment_short` | 422 | Tenders do not cover the bill |
| `payment_excess` | 422 | Tenders exceed the bill |
| `backup_failed` | 500 | Backup attempt failed; `details` carries the log row |
| `database_unavailable` | 503 | Database unreachable |

---

## Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | 🔓 | `{username, password}` → tokens + user + shift |
| POST | `/auth/refresh` | 🔓* | Send the **refresh** token |
| POST | `/auth/logout` | 👥 | Records the shift logout time |
| GET | `/auth/me` | 👥 | Current user + open shift |
| GET | `/auth/session` | 👥 | Cheap liveness probe |
| GET | `/auth/shifts` | 👥 | Admin: all shifts. Cashier: own only |
| POST | `/auth/change-password` | 👥 | Own password only |
| GET | `/auth/roles` | 🔒 | The two fixed roles, for report filters |

```http
POST /api/auth/login
{ "username": "cashier", "password": "Cashier@12345" }
```
```jsonc
{ "success": true, "data": {
  "access_token": "eyJ…", "refresh_token": "eyJ…",
  "user": { "id": 2, "name": "Counter Cashier", "username": "cashier", "role": "cashier" },
  "shift": { "id": 7, "login_time": "2026-08-20T14:32:11", "is_open": true }
}}
```

> There is no endpoint to create, edit, disable or delete another account.
> Accounts come from `backend/seed.py`.

---

## Menu

| Method | Path | Access |
| --- | --- | --- |
| GET | `/menu/categories` | 👥 |
| POST · PUT · DELETE | `/menu/categories[/:id]` | 🔒 |
| GET | `/menu/items` `?category_id&search&available_only&with_recipe` | 👥 |
| GET | `/menu/items/grid` | 👥 |
| GET | `/menu/items/:id` | 👥 |
| POST · PUT · DELETE | `/menu/items[/:id]` | 🔒 |
| PATCH | `/menu/items/:id/availability` | 🔒 |

`/menu/items/grid` is what the POS renders: categories with their items, plus
the current `low_stock_alerts`. Deleting an item is a soft delete so historical
bills keep their reference.

---

## Tables

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/tables` `?with_orders&active_only` | 👥 | Adds `meta`-style `counts` per status |
| GET | `/tables/:id` | 👥 | |
| POST · PUT · DELETE | `/tables[/:id]` | 🔒 | Tables with history are retired, not deleted |
| POST | `/tables/:id/assign` | 👥 | Opens a dine-in order (or returns the open one) |
| POST | `/tables/merge` | 👥 | `{target_order_id, source_order_id}` |
| POST | `/tables/split` | 👥 | `{order_id, groups:[{order_item_ids:[…]}, …]}` |
| POST | `/tables/:id/release` | 👥 | Refuses while anything is unsettled |

Lifecycle: `empty → occupied → bill_pending → empty`. Status is derived from
the orders on the table, never set by hand.

---

## Orders

| Method | Path | Access |
| --- | --- | --- |
| GET | `/orders` `?status=active&order_type&table_id&limit` | 👥 |
| GET | `/orders/:id` | 👥 |
| POST | `/orders` | 👥 |
| PUT | `/orders/:id` | 👥 |
| POST | `/orders/:id/items` | 👥 |
| PUT · DELETE | `/orders/:id/items/:itemId` | 👥 |
| POST | `/orders/:id/kot` | 👥 |
| GET | `/orders/:id/kot` | 👥 |
| POST | `/orders/:id/cancel` | 👥 |

`POST /orders` accepts an optional `items` array and a `client_uid`; replaying
the same `client_uid` returns the original order instead of creating a second.

`POST /orders/:id/kot` fires **only the new lines** and returns the print
payload. `GET` returns the full ticket for a reprint after a printer failure.

---

## Billing

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/billing/calculate` | 👥 | Non-mutating preview |
| GET | `/billing/active-discount` | 👥 | What the engine would apply now |
| GET | `/billing/tax-config` | 👥 | Rate + mode |
| POST | `/billing/generate` | 👥 | Creates a pending invoice |
| POST | `/billing/bills/:id/complete` | 👥 | **The atomic transaction** |
| POST | `/billing/quick-sale` | 👥 | Order → bill → payment in one call |
| GET | `/billing/bills` `?status&order_id&date&search&mine&limit` | 👥 | Bill History feed. Cashiers see their own by default; pass `mine=false` as admin for the whole ledger |
| GET | `/billing/bills/pending` | 👥 | |
| GET | `/billing/bills/:id` · `/receipt` | 👥 | |
| POST | `/billing/bills/:id/void` | 🔒 | Unpaid bills only |
| POST | `/billing/sync` | 👥 | Replay the offline queue |

### Totals

```
subtotal      = Σ (price_at_order × quantity)
discount      = subtotal × active_rate%          ← before GST
taxable_value = subtotal − discount              (exclusive)
              = (subtotal − discount) / (1+rate) (inclusive)
cgst = sgst   = taxable_value × (rate / 2)%
total         = taxable_value + cgst + sgst      (exclusive)
              = subtotal − discount              (inclusive)
```

Decimal throughout, rounded half-up to two places.

### Completing a bill

```http
POST /api/billing/bills/12/complete
{
  "payments": [
    { "mode": "cash", "amount": "500.00", "tendered": "500.00" },
    { "mode": "upi",  "amount": "256.00", "reference": "UPI-9931" }
  ],
  "client_uid": "ak-8f21…"
}
```

Runs in one transaction: validate tender → record payments → deduct
recipe-linked stock → mark the bill paid → update order and table status. Any
failure rolls everything back — stock is never half-deducted and no partial
paid bill survives. `sum(payments)` must equal the bill total exactly.

The response carries `bill`, `payments`, `deductions`, the recalculated
`inventory` snapshot, `receipt` and `table`.

---

## Payments

| Method | Path | Access |
| --- | --- | --- |
| GET | `/payments/modes` | 👥 |
| GET | `/payments/bill/:billId` | 👥 |
| POST | `/payments/validate` | 👥 |
| POST | `/payments/bill/:billId` | 👥 |
| GET | `/payments` `?mode&limit` | 🔒 |

`POST /payments/bill/:id` records a partial tender. The bill stays `pending`
until the full total is settled — a bill is never marked paid on a part payment.

---

## Inventory

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/inventory/dashboard` | 🔒 | Live card per material |
| GET | `/inventory/alerts` | 👥 | Low-stock banner feed |
| GET · POST | `/inventory/materials` | 🔒 | |
| PUT · DELETE | `/inventory/materials/:id` | 🔒 | |
| POST | `/inventory/materials/:id/stock` | 🔒 | Absolute daily stock entry |
| POST | `/inventory/stock/bulk` | 🔒 | Morning stock-take |
| GET | `/inventory/materials/:id/movements` | 🔒 | Audit trail |
| GET · POST | `/inventory/yields` | 🔒 | Recipe links |
| PUT · DELETE | `/inventory/yields/:id` | 🔒 | |
| GET | `/inventory/calculate` `?stock&min_yield&max_yield` | 🔒 | Ad-hoc preview |

### The yield engine

```
Output = Stock Quantity × Yield per Unit
```

20 kg wheat flour at 12–16 chapatis/kg → `20×12 = 240` to `20×16 = 320`.
Partial servings are floored. The same call handles rice, chicken, paneer or
anything else configured — the numbers live in `recipe_yield`, never in code.

A material is **low** when the smallest minimum output across its linked dishes
falls below `low_stock_threshold` (or, with no recipe linked, when raw stock
does).

---

## Discounts

| Method | Path | Access |
| --- | --- | --- |
| GET | `/discounts/active` | 👥 |
| GET | `/discounts` | 🔒 |
| GET · PUT | `/discounts/global` | 🔒 |
| POST | `/discounts` | 🔒 |
| PUT · DELETE | `/discounts/:id` | 🔒 |
| GET | `/discounts/evaluate?date=YYYY-MM-DD` | 🔒 |

Precedence, evaluated once at bill generation:

1. An active `special_date` rule covering today (highest percentage wins)
2. Otherwise the `global` rule, if switched on
3. Otherwise no discount

A stored bill keeps the percentage it was generated with. Settled bills are
never recalculated.

---

## Customers · Expenses

| Method | Path | Access |
| --- | --- | --- |
| GET | `/customers/search?q=` | 👥 |
| POST | `/customers` | 👥 |
| GET | `/customers` `?search&page&per_page` | 🔒 |
| GET · PUT · DELETE | `/customers/:id` | 🔒 |
| GET | `/customers/:id/history` | 🔒 |
| GET · POST | `/expenses` | 🔒 |
| PUT · DELETE | `/expenses/:id` | 🔒 |
| GET | `/expenses/categories` | 🔒 |

Posting an existing phone returns that customer with `existing: true` rather
than erroring, so the counter flow never stalls.

---

## Reports · Export — all 🔒

| Path | Returns |
| --- | --- |
| `/reports/dashboard` `?date` | Today's card set, 7-day trend, alerts, best sellers |
| `/reports/daily` | Totals, per-day rows, payment and order-type splits |
| `/reports/item-wise` `?limit` | Quantity and revenue per dish, best/worst sellers |
| `/reports/staff-wise` | Sales grouped by the user recorded on each bill |
| `/reports/expenses` | Rows plus category breakdown |
| `/reports/profit-loss` | Gross, GST, net, expenses, profit, margin |
| `/reports/summary` | All five in one call |
| `/reports/bills` | The paid-bill ledger |
| `/reports/quick-ranges` | Preset date ranges |
| `/reports/export/:kind?format=csv\|xlsx` | File download |

All accept `?start_date=&end_date=` (ISO dates) and count **paid** bills by
`paid_at`. `:kind` is `daily`, `item-wise`, `staff-wise`, `expenses`,
`profit-loss`, `bills` or `all` (Excel workbook with every sheet).

Profit is `net revenue (excluding GST) − expenses`; GST is collected on behalf
of the government and is not income.

> **Staff-wise is a report, not a module.** It aggregates existing transaction
> rows by `bills.created_by`. Nothing in the API creates or edits users.

---

## Settings · Backup

| Method | Path | Access |
| --- | --- | --- |
| GET | `/settings/public` | 👥 |
| GET · PUT | `/settings` | 🔒 |
| POST | `/settings/reset` | 🔒 |
| POST | `/settings/printer/test` | 🔒 |
| GET | `/backup` | 🔒 |
| POST | `/backup/run` | 🔒 |
| GET | `/backup/download/:filename` | 🔒 |

`GET /backup` also reports `engine`, the resolved `tool_path` for `mysqldump`,
a `tool_error` when it cannot be found, and
`schedule.active_in_this_process` — so a misconfigured backup is visible in the
admin UI before the nightly run silently fails.

Writable keys are restricted to `business.*`, `tax.*`, `printer.*`,
`inventory.*` and `loyalty.*`; anything else is rejected with `422`. There are
no staff-management settings.

---

## Health

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health` | 🔓 |
| GET | `/api` | 🔓 |

`/health` reports database reachability and is what the frontend polls to drive
the offline indicator.
