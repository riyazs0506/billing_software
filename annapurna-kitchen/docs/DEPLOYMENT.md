# Deployment & Operations

Target: one outlet, a cashier tablet and an admin desktop, thermal printers on
the counter and in the kitchen.

---

## Option A — Docker (recommended)

```bash
cd annapurna-kitchen
cp .env.docker.example .env
```

Generate real secrets and put them in `.env`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_SECRET_KEY
```

```bash
docker compose up --build -d
docker compose exec backend flask --app run:app db upgrade
docker compose exec backend flask --app run:app seed
docker compose ps          # all three healthy?
```

- Frontend → `http://<host>:8080`
- API → `http://<host>:5000/api`

nginx inside the frontend container proxies `/api` to the backend, so the
browser talks to a single origin and never needs CORS.

---

## Option B — Manual (VPS or on-premise box)

### 1. System packages

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv mysql-server mysql-client nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

`mysql-client` matters — `backup_service` shells out to `mysqldump`.

### 2. Database

```sql
CREATE DATABASE annapurna_kitchen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'annapurna'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON annapurna_kitchen.* TO 'annapurna'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Backend

```bash
cd /opt/annapurna/backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in secrets + MySQL credentials, FLASK_ENV=production

flask --app run:app db upgrade
flask --app run:app seed
```

`systemd` unit — `/etc/systemd/system/annapurna-api.service`:

```ini
[Unit]
Description=Annapurna Kitchen API
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=annapurna
WorkingDirectory=/opt/annapurna/backend
EnvironmentFile=/opt/annapurna/backend/.env
ExecStart=/opt/annapurna/backend/.venv/bin/gunicorn \
  --bind 127.0.0.1:5000 --workers 2 --threads 4 --timeout 60 \
  --access-logfile /var/log/annapurna/access.log \
  --error-logfile /var/log/annapurna/error.log \
  run:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/annapurna && sudo chown annapurna /var/log/annapurna
sudo systemctl enable --now annapurna-api
```

> With more than one worker, only one process owns the backup schedule — it is
> elected by binding `SCHEDULER_LOCK_PORT` (default 47615) on loopback.

### 4. Frontend

```bash
cd /opt/annapurna/frontend
npm ci
echo "VITE_API_BASE_URL=/api" > .env
npm run build
sudo cp -r dist/* /var/www/annapurna/
```

nginx site:

```nginx
server {
    listen 80;
    server_name billing.annapurnakitchen.in;
    root /var/www/annapurna;
    index index.html;

    location /api/ {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /        { try_files $uri $uri/ /index.html; }
}
```

### 5. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d billing.annapurnakitchen.in
```

Then set `CORS_ORIGINS=https://billing.annapurnakitchen.in` and restart the API.

---

## Client-site setup

1. **Business info** — Settings → Business: name, address, phone, GSTIN,
   FSSAI, invoice prefix, receipt footer.
2. **Tax** — Settings → Tax: GST rate and inclusive/exclusive. The worked
   example on that screen shows exactly what a ₹400 order will print.
3. **Tables** — Settings → Tables: match the real floor.
4. **Menu** — Menu: categories, dishes, prices.
5. **Inventory** — Inventory: raw materials, opening stock, then a yield link
   per dish (min/max per unit and average consumption per serving).
6. **Discounts** — leave the global switch off unless a standing discount runs.
7. **Printer** — Settings → Printer, **on each billing device**. Run the test
   print before training.
8. **Rotate the seeded passwords.**

---

## Daily operation

**Morning** — admin signs in, enters the day's stock (Inventory → Update
stock). The dashboard shows possible production per dish.

**Service** — cashier signs in; the shift is recorded automatically.
Dine-in: pick a table → tap dishes → KOT → Generate Bill → payment. Takeaway
skips the table. Low-stock banners appear on the billing screen as materials
run down.

**Close** — cashier logs out (logout time recorded). Admin reviews the
dashboard and reports. The automated backup runs at 23:45 by default.

---

## Monitoring

| Check | How |
| --- | --- |
| API alive | `curl -s localhost:5000/api/health` → `"status": "ok"` |
| Backups | Backup & Export screen — every attempt is listed, failures in red |
| API logs | `journalctl -u annapurna-api -f`, or `backend/logs/annapurna.log` |
| Slow bills | Bill generation should stay under 2 s; check MySQL first |

---

## Restore from backup

```bash
# MySQL
mysql -u annapurna -p annapurna_kitchen < /var/backups/annapurna/annapurna-<stamp>.sql

# SQLite (demo installs)
cp /path/to/annapurna-<stamp>.sqlite backend/instance/annapurna.db
```

Then restart the API. Verify with a quick sign-in and the previous day's
report.

---

## Upgrading

```bash
git pull
cd backend && source .venv/bin/activate
pip install -r requirements.txt
flask --app run:app db upgrade
sudo systemctl restart annapurna-api

cd ../frontend && npm ci && npm run build
sudo cp -r dist/* /var/www/annapurna/
```

Take a backup first (`flask --app run:app backup`). Migrations are additive;
`db downgrade -1` reverses the last revision if needed.

---

## Adding or changing an account

There is no staff-management screen — that is deliberate. Options:

1. **Self-service** — a signed-in user changes their own password under
   Settings → My account.
2. **Re-seed** — set `SEED_ADMIN_PASSWORD` / `SEED_CASHIER_PASSWORD` and run
   `flask --app run:app seed` (it will not duplicate existing usernames, so
   delete the row first if you are replacing an account).
3. **Direct** — from a Python shell on the server:

```python
from app import create_app
from app.extensions import db
from app.models import User

app = create_app("production")
with app.app_context():
    user = User(name="Evening Cashier", username="cashier2", role="cashier")
    user.set_password("<strong-password>")
    db.session.add(user)
    db.session.commit()
```

Passwords are bcrypt-hashed by `set_password`; never write `password_hash`
by hand.
