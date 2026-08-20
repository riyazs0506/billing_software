# Annapurna Kitchen — Restaurant Billing Software

POS billing, GST invoicing and yield-based inventory for a single-outlet,
multi-cuisine restaurant. Built to the project specification set
(`01-PRD` … `08-UI-UX`).

The counter goal is **order → bill → payment in under 60 seconds**, with GST
that matches a manual calculation to the paisa.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
  - [MySQL setup](#mysql-setup)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Migrations](#migrations)
- [Seed data](#seed-data)
- [Testing](#testing)
- [Production build & deployment](#production-build--deployment)
- [Environment variables](#environment-variables)
- [Printer setup](#printer-setup)
- [Offline billing](#offline-billing)
- [Backup](#backup)
- [Roles and access](#roles-and-access)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## What it does

**Billing**
- POS screen: category-tabbed menu grid, running order panel, one-tap
  `Generate Bill` — no confirmation step
- Dine-in and takeaway (no delivery)
- Table board: empty / occupied / bill-pending, with merge and split
- KOT to the kitchen printer, thermal receipt at the counter
- Cash, card, UPI and split tenders on one bill
- **Bill History** for both roles — searchable ledger with a full invoice
  breakdown and one-tap receipt reprint. Admins see every bill (with CSV/Excel
  export and the ability to void an unpaid one); a cashier sees the bills they
  raised, so they can reprint without any admin access.

**Tax & discounts**
- CGST + SGST on every invoice, tax-inclusive or tax-exclusive pricing
- Global discount switch, plus special-date rules that activate themselves on
  schedule. Discount applies **before** GST; settled bills are never
  recalculated.

**Inventory**
- Raw materials with a min/max yield per unit —
  `Output = Stock Quantity × Yield per Unit`
- 20 kg wheat at 12–16 chapatis/kg → **240–320 chapatis**, recalculated live
- Recipe-linked auto-deduction on every settled bill
- Low-stock alerts on both the billing screen and the inventory dashboard

**Business**
- Customer database with order history and optional loyalty
- Expense tracking feeding a profit/loss statement
- Reports: daily, item-wise, staff-wise, expenses, P&L — with CSV/Excel export
- Automated nightly database backup, plus manual backup on demand
- Admin dashboard with the day's numbers at a glance

### Deliberately out of scope

Delivery orders · table reservations · a customer-facing ordering app ·
multi-language billing · **staff management**.

> **On staff management.** The application has two roles, `admin` and
> `cashier`, and every transaction records the user who performed it (so the
> staff-wise sales report and the shift log both work). But there is **no
> staff-management module** — no staff screen, navigation entry, CRUD API,
> service or component. Accounts are provisioned by
> [`backend/seed.py`](backend/seed.py) or by a DBA. A signed-in user can change
> their own password and nothing else. `backend/tests/test_security_and_roles.py`
> asserts this and fails the build if a staff route, file or model reappears.

---

## Architecture

```
[Cashier tablet]  ─┐
[Admin desktop]   ─┼── HTTPS ──►  Flask API  ──►  SQLAlchemy  ──►  MySQL
[Thermal printer] ◄┘                (JWT, role-gated)
      ▲
      └── printed locally from the billing device (QZ Tray / WebUSB / Bluetooth)
```

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6, Axios, Recharts |
| Backend | Python 3.12, Flask 3, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-Migrate |
| Database | MySQL 8 (utf8mb4), native `ENUM`, `DECIMAL` money, `INT AUTO_INCREMENT` keys |
| Offline | IndexedDB queue with server-side idempotency keys |
| Printing | Browser print API for invoices; ESC/POS over QZ Tray, WebUSB or Web Bluetooth |

Design rules that the code follows throughout:

- Business logic lives in `app/services/`; route handlers stay thin.
- `role_required` guards **every** protected route — server-side, not just
  hidden UI.
- Pages consume `src/services/`; components never call the API directly.
- All money is `decimal.Decimal` end to end. No floats touch a bill.

---

## Prerequisites

| | Version |
| --- | --- |
| Python | 3.11+ (3.12 recommended) |
| Node.js | 20+ (22 recommended) |
| MySQL | 8.0+ |
| Docker | 24+ *(optional — only for the container route)* |

---

## Quick start (Docker)

```bash
cd annapurna-kitchen
cp .env.docker.example .env
# edit .env — set SECRET_KEY, JWT_SECRET_KEY and the MySQL passwords
docker compose up --build -d
docker compose exec backend flask --app run:app db upgrade
docker compose exec backend flask --app run:app seed
```

- Frontend → <http://localhost:8080>
- API → <http://localhost:5000/api>

---

## Local development

### MySQL setup

```sql
CREATE DATABASE annapurna_kitchen
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'annapurna'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON annapurna_kitchen.* TO 'annapurna'@'localhost';
FLUSH PRIVILEGES;
```

`database/schema.sql` holds the same schema as raw DDL, for DBAs who prefer to
create it by hand or to review the physical design. Normal installs use Alembic.

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # then fill in the MySQL credentials + secrets

flask --app run:app db upgrade
flask --app run:app seed

python run.py                 # http://127.0.0.1:5000
```

> **No MySQL to hand?** Set `DB_ENGINE=sqlite` in `backend/.env` for a laptop
> demo. Everything works; production runs on MySQL.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:5000`, so no CORS
configuration is needed while developing.

### Development commands

| Command | What it does |
| --- | --- |
| `python run.py` | Flask dev server with reloader |
| `flask --app run:app db migrate -m "msg"` | Generate a migration from model changes |
| `flask --app run:app db upgrade` | Apply migrations |
| `flask --app run:app seed --reset` | Drop, recreate and re-seed |
| `flask --app run:app backup` | Run a backup immediately |
| `pytest` | Backend test suite |
| `npm run dev` / `build` / `preview` / `lint` | Frontend |

---

## Migrations

Flask-Migrate (Alembic) owns the schema.

```bash
cd backend
flask --app run:app db upgrade                    # apply everything
flask --app run:app db migrate -m "add column"    # after editing models/
flask --app run:app db downgrade -1               # roll back one revision
flask --app run:app db current                    # show the applied revision
```

A fresh install is fully reproducible from `migrations/versions/` — the initial
revision creates all 17 tables with utf8mb4, native ENUMs and every index.

---

## Seed data

```bash
flask --app run:app seed             # idempotent; keeps existing rows
flask --app run:app seed --reset     # drop everything first
flask --app run:app seed --no-demo   # accounts + settings only, no demo data
```

Creates: two accounts, the six menu categories, 25 dishes, 12 tables, 7 raw
materials, 18 recipe/yield links (including the spec's wheat → chapati example),
sample customers, expenses and discount configuration.

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin@12345` |
| Cashier | `cashier` | `Cashier@12345` |

Override with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` /
`SEED_CASHIER_USERNAME` / `SEED_CASHIER_PASSWORD`.

> **Change these before go-live.** They exist for authentication and testing
> only. Since there is no staff-management screen, rotate them by re-running
> the seed with new environment values, from the Settings → My account screen,
> or directly in the database.

---

## Testing

```bash
cd backend
pytest                       # full suite
pytest -q --cov=app          # with coverage
```

186 tests covering authentication and token expiry, GST arithmetic in both tax
modes, the discount engine (including "never recalculate a settled bill"), the
yield engine and stock deduction, the table lifecycle with merge/split, every
payment mode, all five reports plus CSV/XLSX export, offline-queue idempotency,
role enforcement on every endpoint, and the continued absence of any
staff-management route, file or model. See [`tests/README.md`](tests/README.md).

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

---

## Production build & deployment

```bash
# frontend → static bundle
cd frontend
npm ci
npm run build          # emits dist/

# backend → WSGI
cd ../backend
gunicorn --bind 0.0.0.0:5000 --workers 2 --threads 4 run:app
```

Serve `frontend/dist` from nginx and proxy `/api` to gunicorn — see
[`frontend/nginx.conf`](frontend/nginx.conf) for a working configuration.

Production checklist:

- [ ] `FLASK_ENV=production` (the app refuses to boot with placeholder secrets)
- [ ] Long random `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] `CORS_ORIGINS` set to the real frontend origin
- [ ] HTTPS terminated at the proxy
- [ ] Seeded passwords rotated
- [ ] `BACKUP_ENABLED=true` and the backup volume on persistent storage
- [ ] `mysqldump` available to the backend process

---

## Environment variables

### `backend/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLASK_ENV` | `development` | `development` / `staging` / `production` / `testing` |
| `SECRET_KEY` | — | Flask session signing. **Required in production.** |
| `JWT_SECRET_KEY` | — | JWT signing. **Required in production.** |
| `DATABASE_URL` | — | Full SQLAlchemy URL; overrides the parts below |
| `DB_ENGINE` | `mysql` | `mysql` or `sqlite` |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | Database host |
| `MYSQL_DB` / `MYSQL_USER` / `MYSQL_PASSWORD` | — | Database credentials |
| `SQLITE_PATH` | `instance/annapurna.db` | Only when `DB_ENGINE=sqlite` |
| `JWT_ACCESS_MINUTES` | `60` | Access-token lifetime |
| `JWT_REFRESH_DAYS` | `7` | Refresh-token lifetime |
| `SESSION_IDLE_MINUTES` | `30` | Auto-logout after inactivity |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `BACKUP_ENABLED` | `true` | Enable the nightly job |
| `BACKUP_DIR` | `backups` | Where archives are written |
| `BACKUP_HOUR` / `BACKUP_MINUTE` | `23` / `45` | Schedule |
| `BACKUP_RETENTION_DAYS` | `14` | Older archives are pruned |
| `MYSQLDUMP_PATH` | `mysqldump` | Path to the dump binary |
| `SCHEDULER_LOCK_PORT` | `47615` | Loopback port that elects one scheduler owner |

### `frontend/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API base; `/api` uses the dev proxy or nginx |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:5000` | Where the dev server forwards `/api` |
| `VITE_QZ_HOST` | `localhost:8181` | QZ Tray websocket host |
| `VITE_PAPER_WIDTH` | `80` | Thermal paper width in mm |

Never commit a real `.env`. Both `.env.example` files are the templates.

---

## Printer setup

The printer is attached to the billing device, not the server, so all printing
runs in the browser. Configure it under **Settings → Printer**, per device.

| Transport | Use when | Notes |
| --- | --- | --- |
| **Browser** | Any machine, A4/A5 or thermal via the OS driver | Uses the print dialog; no install |
| **QZ Tray** | Standard POS thermal setup *(recommended)* | Install [QZ Tray](https://qz.io/), then set the printer name exactly as QZ reports it |
| **WebUSB** | Chrome/Edge with a USB ESC/POS printer | No extra software; the first print asks the user to pick the device |
| **Bluetooth** | Portable BLE thermal printers | Chrome/Edge only |

Receipt and KOT printers are configured separately, so tickets go to the
kitchen while invoices print at the counter. Paper width supports 58 mm
(32 columns) and 80 mm (48 columns).

**Printer test:** Settings → Printer → *Test receipt printer*. It sends a real
job and shows the exact text the printer receives.

**Failures are never silent.** If a job is rejected the app shows what failed
and offers *Retry print* or *Skip printing*; the sale itself is already saved
and the receipt can be reprinted from the bill later.

---

## Offline billing

Brief internet drops do not stop the counter.

1. A background probe of `/api/health` decides whether the server is really
   reachable — `navigator.onLine` alone is not trusted.
2. While offline, a completed sale is written to an **IndexedDB** queue with a
   unique `client_uid`, and the header shows an offline badge with the queue
   depth.
3. On reconnect the queue is replayed to `POST /api/billing/sync`.
4. The server treats `client_uid` as an **idempotency key** — replaying the
   same operation returns the original bill instead of creating a second one.
   Replaying twice is safe.

Failed items stay queued with the reason recorded, and can be retried from the
header. Nothing is discarded silently.

---

## Backup

- **Automated:** a daily job at `BACKUP_HOUR:BACKUP_MINUTE`. On MySQL it runs
  `mysqldump --single-transaction`; a SQLite file is copied. Under gunicorn,
  exactly one worker owns the schedule (elected via a loopback lock).
- **Manual:** Backup & Export → *Back up now*.
- **Retention:** archives older than `BACKUP_RETENTION_DAYS` are pruned.
- **Every attempt is logged** to `backup_logs` and shown in the admin UI. A
  failure raises a visible error with the reason — it is never swallowed.
- Archives can be downloaded from the same screen.

Data export (CSV / Excel) is separate and available per report, or as a single
workbook containing every sheet.

---

## Roles and access

Enforced on the server for every route. Hiding a button is not the boundary —
a cashier token calling an admin endpoint directly gets `403`.

| Feature | Admin | Cashier |
| --- | :---: | :---: |
| Login / logout | ✅ | ✅ |
| POS billing, KOT, receipts | ✅ | ✅ |
| Table view, assign / merge / split | ✅ | ✅ |
| Bill History + receipt reprint | ✅ (all bills) | ✅ (own bills) |
| Void an unpaid bill | ✅ | ❌ |
| Apply the active discount at billing | ✅ | ✅ (automatic) |
| Customer lookup + add during billing | ✅ | ✅ |
| Own shift log | ✅ | ✅ |
| Menu management | ✅ | ❌ |
| Inventory & yield setup | ✅ | ❌ |
| Low-stock alert banner | ✅ | ✅ (read-only) |
| Create / edit discount rules | ✅ | ❌ |
| Reports & export | ✅ | ❌ |
| Expenses | ✅ | ❌ |
| Settings | ✅ | ❌ |
| Backup | ✅ | ❌ |
| Full customer database | ✅ | ❌ |
| All shift logs | ✅ | ❌ |
| **Staff management** | **Does not exist** | **Does not exist** |

Security: bcrypt password hashing (cost 12), JWT with expiry, idle-session
auto-logout, role checked against the database rather than the token payload,
SQLAlchemy parameterised queries throughout, and no stack traces in production
responses.

---

## Project structure

```
annapurna-kitchen/
├── backend/
│   ├── app/
│   │   ├── __init__.py          app factory
│   │   ├── config.py            env-based config (dev/staging/prod/testing)
│   │   ├── extensions.py        db, jwt, migrate, cors
│   │   ├── models/              17 tables (user, menu, inventory, orders, bills…)
│   │   ├── routes/              one blueprint per module
│   │   ├── services/            business logic (yield, GST, discounts, billing…)
│   │   ├── middleware/          role_required guards + error handlers
│   │   └── utils/               Decimal money, validators, JSON envelope
│   ├── migrations/              Alembic
│   ├── tests/                   pytest suite
│   ├── seed.py                  the only place accounts are created
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── components/          common · billing · inventory · reports · layout
│   │   ├── pages/               Login, Dashboard, BillingScreen, TableView, …
│   │   ├── services/            api.js + one module per domain, offline queue, printing
│   │   ├── context/             AuthContext, ToastContext, AppDataContext
│   │   ├── routes/              ProtectedRoute
│   │   ├── hooks/ utils/ styles/
│   │   ├── App.jsx  main.jsx
│   ├── nginx.conf  Dockerfile  tailwind.config.js  vite.config.js
├── database/schema.sql          MySQL DDL reference
├── docs/                        API reference, workflows, deployment notes
├── tests/README.md              test map
├── docker-compose.yml
└── README.md
```

There is no `staff_routes.py`, `staff_service.py`, `staffService.js` or
`StaffManagement.jsx` — by design.

---

## API reference

All endpoints are under `/api`. Responses use one envelope:

```jsonc
// success
{ "success": true, "data": { }, "meta": { } }

// failure
{ "success": false, "error": { "code": "forbidden", "message": "…", "details": { } } }
```

| Module | Key endpoints | Access |
| --- | --- | --- |
| Auth | `POST /auth/login` · `/auth/logout` · `/auth/refresh` · `GET /auth/me` · `/auth/shifts` · `POST /auth/change-password` | mixed |
| Menu | `GET /menu/items/grid` · `/menu/items` · `/menu/categories` | read: both · write: admin |
| Tables | `GET /tables` · `POST /tables/:id/assign` · `/tables/merge` · `/tables/split` · `/tables/:id/release` | both |
| Orders | `POST /orders` · `/orders/:id/items` · `/orders/:id/kot` | both |
| Billing | `POST /billing/calculate` · `/billing/generate` · `/billing/bills/:id/complete` · `/billing/quick-sale` · `/billing/sync` | both |
| Payments | `GET /payments/modes` · `POST /payments/validate` · `/payments/bill/:id` | both |
| Inventory | `GET /inventory/dashboard` · `/inventory/alerts` · `POST /inventory/materials/:id/stock` · `/inventory/yields` | alerts: both · rest: admin |
| Discounts | `GET /discounts/active` · `PUT /discounts/global` · `POST /discounts` | active: both · rest: admin |
| Customers | `GET /customers/search` · `POST /customers` · `GET /customers` · `/customers/:id/history` | search/add: both · rest: admin |
| Expenses | `GET/POST/PUT/DELETE /expenses` | admin |
| Reports | `/reports/dashboard` · `/daily` · `/item-wise` · `/staff-wise` · `/expenses` · `/profit-loss` · `/export/:kind` | admin |
| Settings | `GET /settings/public` · `GET/PUT /settings` · `POST /settings/printer/test` | public: both · rest: admin |
| Backup | `GET /backup` · `POST /backup/run` · `GET /backup/download/:file` | admin |

Full detail, including request/response shapes, is in
[`docs/API.md`](docs/API.md).

---

## Troubleshooting

**`npm install` fails with `EPERM` / `ERR_INVALID_ARG_TYPE` on Windows**
Two causes. Set `ComSpec` if it is empty (`$env:ComSpec="C:\Windows\System32\cmd.exe"`),
and prefer a path outside OneDrive — OneDrive's file locking breaks symlinked
fixtures inside `node_modules`.

**`sqlalchemy.exc.OperationalError: unable to open database file`**
The SQLite directory does not exist. Use an absolute `SQLITE_PATH`, or
`DB_ENGINE=mysql`.

**`Access denied for user` on MySQL**
Check `MYSQL_USER` / `MYSQL_PASSWORD` in `backend/.env` and that the grant was
applied. `DATABASE_URL`, if set, overrides the individual parts.

**Frontend loads but every request 401s**
`VITE_API_BASE_URL` points somewhere the backend is not, or `CORS_ORIGINS` does
not include the frontend origin. In development, leave it as `/api`.

**Cashier sees "Your role does not have access"**
Working as intended — that route is admin-only. Sign in with an admin account.

**Backup fails with `mysqldump exited with code 127`, or `[WinError 2] The system cannot find the file specified`**
`mysqldump` is not on the backend's `PATH`. On Windows the MySQL `bin`
directory usually isn't, so the app now searches the standard install
locations automatically (`C:\Program Files\MySQL\MySQL Server 8.x\bin\`,
Workbench, `/usr/bin`, Homebrew). If it still cannot find it, set the full path
explicitly:

```
MYSQLDUMP_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe
```

Backup & Export shows the resolved tool path, so you can confirm it before the
nightly run rather than discovering the failure the next morning.

**Backup & Export says the schedule is not active in this process**
Another process holds the scheduler lock (default port 47615) — usually a
backend left running from an earlier session. Stop it, or set
`SCHEDULER_LOCK_PORT` to a free port. Manual backups still work either way.

**A page shows a list but will not scroll**
Fixed in the current build. It was caused by two stacked dialogs restoring the
body scroll-lock in the wrong order, which left `overflow: hidden` on the page.
If you are running an older bundle, rebuild the frontend (`npm run build`).

**Table columns are missing on a wide screen**
Also fixed. The responsive column classes were assembled at runtime, so
Tailwind never generated them and the columns stayed hidden at every width.
Rebuild the frontend to pick up the fix.

**`GET /api/discounts` returns "A database error prevented this operation"**
Fixed — the query used `NULLS LAST`, which MySQL rejects with error 1064.
`tests/test_mysql_portability.py` now compiles the app's queries against the
MySQL dialect so this class of bug fails the suite instead of production.

**Printing does nothing**
Check Settings → Printer. `browser` opens the OS dialog; `qz` needs QZ Tray
running locally with the printer name matching exactly. Use *Test receipt
printer* — it reports the real error rather than failing quietly.

**Offline badge stays on while the internet works**
The badge tracks `/api/health`, not the network adapter. If the API is
unreachable the badge is correct — check the backend and `VITE_API_BASE_URL`.

**Sales look missing from a report**
Reports count **paid** bills by `paid_at`. A generated but unsettled bill shows
under pending bills, not in sales.
