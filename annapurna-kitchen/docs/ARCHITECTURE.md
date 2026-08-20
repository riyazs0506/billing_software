# Architecture Notes

Design decisions behind the implementation, and where the specification left
room for judgement.

---

## 1. Money is always Decimal

01-PRD requires GST to match a manual calculation with zero discrepancy, so no
float ever touches a bill.

- Columns are `DECIMAL(10,2)` for money, `DECIMAL(12,3)` for stock,
  `DECIMAL(10,3)` for yield rates.
- `app/utils/money.py` coerces through `str()` so `0.1` never becomes
  `0.1000000000000000055`.
- Rounding is `ROUND_HALF_UP` to two places at the point a number becomes
  printable — the convention Indian invoices use.
- JSON serialises money as a **string** (`"420.00"`), so a JavaScript client
  cannot silently re-introduce float error. The frontend formats for display
  and never does arithmetic on totals.

---

## 2. GST in two modes

```
exclusive   menu price is pre-tax
  taxable = subtotal − discount
  total   = taxable + cgst + sgst

inclusive   menu price already contains the tax
  gross   = subtotal − discount
  taxable = gross / (1 + rate)
  total   = gross
```

In inclusive mode `taxable_value` is back-computed as `total − cgst − sgst`
after rounding, so the printed lines always add up to the amount charged. A
receipt where the components do not sum to the total is a support call.

A 5% invoice prints as CGST 2.5% + SGST 2.5% (intra-state supply).

---

## 3. Discount precedence

The spec calls the special-date rule an *override*, so:

1. an active `special_date` rule covering today (highest percentage, if
   several qualify);
2. otherwise the `global` switch, if on;
3. otherwise nothing.

Evaluated **once**, at bill generation. The chosen percentage, the rule id and
its label are copied onto the bill row. Changing or deleting a rule afterwards
cannot alter a bill that already exists — required by 03-Application-Workflow
and covered by `test_completed_bills_are_never_recalculated`.

Discount is applied to the item total **before** GST.

---

## 4. Splitting and merging

The spec asks for "merge two tables into one bill" and "split one table's order
into multiple bills". Both are modelled through `order_items.bill_id`:

- **Merge** re-parents the source order's lines onto the target order, marks
  the source `merged` with `merged_into_order_id`, and frees its table.
- **Split** creates several bills against *one* order, each owning a subset of
  the lines. A line with `bill_id IS NULL` is still unbilled.

A table returns to `empty` only when no order on it has unbilled lines and
every bill is paid. That is why the status is always **derived**
(`refresh_table_status`) rather than assigned.

---

## 5. The yield engine

```
Output = Stock Quantity × Yield per Unit
```

`recipe_yield` stores `min_yield_per_unit`, `max_yield_per_unit` and
`avg_consumption_per_dish` per (dish, material) pair. Nothing about chapatis,
70 g or 80 g appears in code — the worked example lives in the seed script as
data.

- Servings are floored: you cannot sell 12.7 chapatis.
- A dish needing several materials is capped by its scarcest one.
- **Low stock** = the smallest minimum output across a material's linked dishes
  falls below its threshold. With no recipe linked, raw stock is compared
  instead, so a material like cooking oil still alerts.

Deduction runs at **payment completion**, not bill generation, matching the
workflow document ("bill prints → order complete → auto-deducts"). It happens
inside the same transaction, and every change writes a `stock_movements` row
for audit.

---

## 6. The atomic completion path

`billing_service.complete_bill` performs, in order: validate tender → record
payments → deduct raw materials → mark paid → update order status → update
table status. The route wraps it:

```python
try:
    result = billing_service.complete_bill(...)
    db.session.commit()
except Exception:
    db.session.rollback()
    raise
```

There is no intermediate commit, so a failure at any step leaves nothing
behind: no half-deducted stock, no orphaned payment row, no bill marked paid
without money. `test_a_failed_completion_rolls_everything_back` asserts this
against a deliberately short payment.

---

## 7. Offline queue and idempotency

`navigator.onLine` only proves the network adapter is up, so connectivity is
decided by a background probe of `/api/health`.

A sale completed while offline is written to IndexedDB with a `client_uid`.
On reconnect the queue replays to `/billing/sync`. The server stores
`client_uid` on `bills` with a **unique** constraint and checks it before doing
any work, so a replay — including a double replay — returns the original bill
rather than creating a second one. Orders carry `client_uid + "-order"` for the
same reason.

Failed items stay queued with the failure reason attached; nothing is dropped
silently.

---

## 8. Printing lives in the browser

02-TRD puts the printer on the billing device, not the cloud, so the server
never talks to hardware. It only returns *payloads*; the browser owns the
transport:

| Transport | Mechanism |
| --- | --- |
| `browser` | A hidden `.print-area` that the print stylesheet promotes to the only visible element |
| `qz` | WebSocket to QZ Tray on localhost, base64 ESC/POS |
| `webusb` | `navigator.usb` bulk transfer to interface class 7 |
| `bluetooth` | Web Bluetooth GATT writes, chunked for the BLE MTU |

`utils/escpos.js` builds the byte stream for the last three; the DOM templates
in `PrintTemplates.jsx` render the same document for the first. Receipt and KOT
printers are configured independently.

A job is reported as printed **only** when the transport accepted it. On
failure the user gets the reason plus *Retry* or *Skip* — the sale is already
saved either way.

---

## 9. Authorization

Two layers, and only one of them is security:

- **Frontend** `ProtectedRoute` + role-filtered navigation hides screens.
- **Backend** `role_required` on every protected route is the actual boundary.

The decorator resolves the user from the database and compares that role, not
just the JWT claim — a token with a forged `role` is still refused
(`test_a_forged_role_claim_does_not_grant_admin`). Idle sessions are closed
server-side against `shifts.last_seen_at`.

---

## 10. Deliberate additions to the documented schema

05-Schema-Structure was followed exactly for the documented columns. These were
added because the build specification requires behaviour the base schema cannot
express:

| Addition | Why |
| --- | --- |
| `bills.client_uid`, `orders.client_uid` | Offline-queue idempotency (§38) |
| `order_items.bill_id` | Makes split billing expressible |
| `orders.merged_into_order_id`, statuses `merged` / `cancelled` | Table merge (§9) |
| `bills.bill_number`, `orders.order_number` | Human-readable invoice numbers on receipts (§21) |
| `bills.taxable_value`, `cgst_rate`, `sgst_rate`, `tax_mode` | Inclusive/exclusive pricing on the printed invoice (§17) |
| `bills.status`, `paid_at`, `created_by`, `customer_id` | Payment state, audit trail, reporting by `paid_at` |
| `stock_movements` | Auditable inventory history (§42) |
| `settings` | The Settings screen (§28) |
| `backup_logs` | "Backup failures must be logged and surfaced" (§26) |
| `shifts.last_seen_at` | Idle-session auto-logout (§6) |
| `expenses.category`, `created_by` | Expense reporting breakdown |

Nothing was removed, and no staff-management structure was added.

---

## 11. Lessons from the first MySQL deployment

Three defects only appeared once the app ran against real MySQL and a real
browser. All three are now covered by tests.

**`NULLS LAST` is not MySQL.** `GET /api/discounts` ordered with
`.nullslast()`. SQLite accepts it, MySQL 8 raises a 1064, so the whole
Discounts screen failed with "a database error prevented this operation" —
invisible to a SQLite-only suite. `tests/test_mysql_portability.py` now
compiles the app's real queries against the MySQL dialect and asserts the DDL
renders, so engine-specific SQL fails the suite rather than the customer.

**Two dialogs, one scroll lock.** Each `Modal` saved and restored
`document.body.style.overflow` independently. With an edit dialog and a
delete-confirm stacked, closing them in the wrong order left the page stuck at
`overflow: hidden` — the list rendered but would not scroll. Replaced with a
reference-counted lock (`utils/scrollLock.js`); Escape now also closes only the
topmost dialog.

**Tailwind cannot see class names it never reads.** `DataTable` built its
responsive classes as `` `hidden ${column.hideBelow}:table-cell` ``. The JIT
scans source text, so `sm:table-cell` was never generated and *every* table in
the app kept those columns hidden at all widths. Class names must be literal;
the breakpoint map is now a static lookup. Table footers were also switched
from manual `colSpan` to a single spanning cell, because a fixed `colSpan`
cannot stay aligned once columns hide responsively.

The pattern behind all three: a fallback environment (SQLite) and a build-time
optimiser (JIT purging) both silently accept things the real target rejects.
Verify against the production engine and a real browser, not just the
convenient one.

---

## 12. What is not here

Per the build specification: no delivery orders, no table reservations, no
customer-facing app, no multi-language billing, and **no staff management**.

Multi-outlet was left as a clean seam rather than a v1 feature — the schema
uses `INT AUTO_INCREMENT` keys as documented, with the note that a UUID switch
is the migration path if a second branch ever needs to sync.

`backend/tests/test_security_and_roles.py` enforces the staff exclusion
mechanically: it walks the URL map, the route table, the filesystem and the
model definitions, and fails if a staff or employee route, file, class or CRUD
function reappears.
