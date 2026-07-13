# WWT OPS Hub

> WWT Field Services Operations Platform

Replaces Smartsheet + Excel Gantt + FieldNation context-switching with a single live operations hub.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + CSS Modules |
| Data layer | Azure Data API Builder (DAB) — REST over Azure PostgreSQL |
| Database | Azure Database for PostgreSQL – Flexible Server |
| Auth | Custom JWT (Express — bcrypt + jsonwebtoken) |
| API proxy | Express `api/` handlers in the same container |
| Container | Azure Container Apps (`server.js`) |
| Scheduled sync | Azure Container Apps Job (smartsheet-sync, `*/30 * * * *`) |
| WO Engine | CPWOG core (`src/cpwog/`) |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/wwt/wwt-ops-hub
cd wwt-ops-hub
npm install

# 2. Configure
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, VITE_API_BASE, VITE_DAB_BASE

# 3. Load schema into Azure PostgreSQL
psql "$DATABASE_URL" -f azure/schema.sql

# 4. Dev (frontend only — uses VITE_FN_MOCK=true by default)
npm run dev

# 5. Full stack locally (requires built dist/)
npm run build && node server.js
```

---

## Environment Variables

### Frontend (bundled at build time)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Express host URL — e.g. `http://localhost:8080` or the Azure FQDN |
| `VITE_DAB_BASE` | Data API Builder URL — e.g. `http://localhost:5000` |
| `VITE_FN_MOCK` | Set `true` to use mock FieldNation responses in dev |
| `VITE_APP_ENV` | Shows DEV/SANDBOX badge in the UI header |

### Server-side (never in the browser bundle)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/opshub?sslmode=require` |
| `JWT_SECRET` | HS256 signing key for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | HS256 signing key for refresh tokens |
| `SMARTSHEET_ACCESS_TOKEN` | Smartsheet personal access token (fallback; stored in DB via Settings) |
| `FN_CLIENT_ID` / `FN_CLIENT_SECRET` | FieldNation OAuth2 app credentials |
| `FN_USERNAME` / `FN_PASSWORD` | FieldNation user credentials (resource-owner flow) |
| `FN_BASE_URL` | Defaults to `https://api.fieldnation.com`; use `sandbox` for sandbox |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio SMS credentials |
| `TWILIO_FROM_NUMBER` | E.164 sender number, e.g. `+18135550100` |
| `ANTHROPIC_API_KEY` | Claude API for FN export analysis and column mapping |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |
| `SYNC_JOB` | Set `true` by the Container Apps Job to run Smartsheet sync and exit |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Azure Application Insights — omit to run without telemetry (local dev, CI) |
| `LOG_LEVEL` | Structured log verbosity: `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal` (default `info`) |

---

## Deployment

```bash
# Deploy to Azure Container Apps
./deploy-azure.sh

# The script:
#   1. Builds the Docker image in Azure Container Registry
#   2. Creates/updates the Container App (web server + API proxy)
#   3. Creates/updates the Container Apps Job (smartsheet-sync cron, */30 * * * *)
```

Secrets (DATABASE_URL, JWT_SECRET, API keys) are stored as Container App secrets and injected as env vars at runtime — never in the image.

---

## Authentication

Users are stored in the `users` table with a `password_hash` column (bcrypt). Supabase auth is no longer used.

**Endpoints:**
- `POST /api/auth/login` — email + password → `{ access_token, refresh_token, user }`
- `POST /api/auth/refresh` — exchange refresh token for new access token
- `GET  /api/auth/me` — return the current user profile
- `POST /api/auth/users` — admin: create a new user with a temp password

**Password bootstrap** for existing users: use `POST /api/auth/users` (admin) or the Settings → Users page to set initial passwords.

---

## User Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — user management, API config, all writes |
| `pm` | Read all + edit sites + push WOs + acknowledge alerts |
| `viewer` | Read-only |

Roles are set in the `users` table (`role` column). All writes are enforced server-side by `api/_lib/middleware.js`.

---

## Data API Builder

DAB provides a REST layer over Azure PostgreSQL with per-entity role permissions, validated by the same JWT the Express container issues. The frontend client in `src/lib/dab.js` mirrors the Supabase query surface:

```javascript
const { data } = await dab.from('sites').select('*').eq('project_id', id).order('code')
```

**DAB does not support PostgREST-style embedding.** Joined data (e.g., sites + work_orders) is fetched with separate parallel queries and merged in JS.

---

## Mock Mode

When FieldNation credentials are absent or `VITE_FN_MOCK=true`, API handlers return `{ results: [], mock: true }` instead of throwing. Full UI interaction is possible without live credentials.

---

## Smartsheet Sync

**Manual:** Settings → Sync button → calls `POST /api/sync/smartsheet`

**Automatic:** Container Apps Job fires every 30 minutes with `SYNC_JOB=true`, which triggers `server.js` to query all active projects and call `POST /api/sync/smartsheet` for each, then exit.

Credentials (Smartsheet token, FN keys, Twilio) are stored encrypted (base64 JSON) in the `credentials` table and managed through Settings → API & Webhooks.

---

## Repo Structure

```
src/
  pages/        Dashboard, SiteBoard, TechGantt, WorkOrders, Alerts, Settings, …
  components/   Shell, StatusBadge, SiteEditModal, AlertBanner, PageHeader
  hooks/        useAuth, useSites, useWorkOrders, useAlerts, useComms, …
  lib/          dab.js (data client), fieldnation.js, parserEngine.js
  cpwog/        generateWO.js, bundleWOs.js, woTypes.js, engine.js

api/
  auth/         login.js, refresh.js, me.js, users.js
  fn/           FieldNation proxy handlers
  sync/         smartsheet.js, upload.js, upload-routes.js
  comms/        send-sms.js, blast-confirmations.js, sms-inbound.js
  credentials/  index.js, save.js, test.js
  notify/       send.js
  ai/           analyze-fn-export.js, load-fn-history.js, map-columns.js
  _lib/         db.js (pg Pool), credentials.js, middleware.js

azure/
  schema.sql    Postgres schema (RLS-stripped, with users.password_hash)
  dab-config.json  Data API Builder entity + permission configuration

server.js       Express host — serves SPA + routes /api/* + SYNC_JOB mode
Dockerfile      Multi-stage build (node:20-alpine)
deploy-azure.sh Azure Container Apps deploy + Container Apps Job setup
```

---

## Schema

Load the schema into a fresh Azure PostgreSQL database:

```bash
psql "$DATABASE_URL" -f azure/schema.sql
```

Migrations from the original Supabase project are consolidated into `azure/schema.sql`. All `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` blocks are removed — role enforcement is handled by DAB entity permissions and Express middleware.
