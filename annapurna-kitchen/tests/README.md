# Tests

The automated suite lives with the code it exercises:

| Suite | Location | Run with |
| --- | --- | --- |
| Backend (unit + API integration) | `backend/tests/` | `cd backend && pytest` |
| Frontend lint / type sanity | `frontend/src/` | `cd frontend && npm run lint` |
| Production build check | `frontend/` | `cd frontend && npm run build` |

## Backend suite layout

| File | Covers |
| --- | --- |
| `conftest.py` | App/DB fixtures, seeded mini-restaurant, authenticated API clients |
| `test_auth.py` | Login, bad credentials, bcrypt hashing, JWT expiry, idle timeout, shift log |
| `test_gst_and_billing.py` | GST arithmetic (inclusive/exclusive), bill generation, full acceptance scenario, rollback |
| `test_discounts.py` | Global toggle, special-date override, inactive rules, no retroactive recalculation |
| `test_inventory.py` | Yield engine, daily stock entry, recipe-linked deduction, low-stock alerts |
| `test_tables_and_payments.py` | Table lifecycle, merge, split, release, cash/card/UPI/split tenders |
| `test_reports.py` | Daily, item-wise, staff-wise, expense, P&L, CSV and XLSX export |
| `test_security_and_roles.py` | Role enforcement per endpoint, forged role claims, **absence of staff management** |
| `test_offline_kot_and_modules.py` | Offline queue idempotency, KOT payloads, customers, expenses, settings, backup |
| `test_bill_history_and_backup.py` | Bill History feed + role scoping, receipt reprint, voiding, mysqldump resolution, path-traversal guard |
| `test_mysql_portability.py` | Compiles the app's queries against the **MySQL** dialect — catches SQL that only works on SQLite |

The suite runs on SQLite so it needs no MySQL server, and
`test_mysql_portability.py` compiles the real queries against the MySQL
dialect so engine-specific SQL still fails the suite. The application code under
test is identical on either engine — every column type and ENUM is declared
portably through SQLAlchemy.

```bash
cd backend
pytest                 # all tests
pytest -q --cov=app    # with coverage
pytest tests/test_gst_and_billing.py -k acceptance -v
```
