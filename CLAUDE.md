# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server at :5173
npm run build     # Vite production build → dist/
npm run preview   # Preview built dist/
npm run lint      # ESLint on src/
```

No test suite is configured.

## Environment Variables

Frontend (VITE_* are bundled into the browser build):
```
VITE_API_BASE          # Express host URL (e.g. http://localhost:8080 or https://your-app.azurecontainerapps.io)
VITE_DAB_BASE          # Data API Builder URL (e.g. http://localhost:5000)
VITE_FN_MOCK=true      # Enables mock FieldNation responses in dev
VITE_APP_ENV           # Shows DEV/SANDBOX badge in the UI
```

Server-side (Express container and api/ handlers only — never in the browser bundle):
```
DATABASE_URL           # postgresql://user:pass@host:5432/opshub?sslmode=require
JWT_SECRET             # HS256 signing key for access tokens
JWT_REFRESH_SECRET     # HS256 signing key for refresh tokens
SMARTSHEET_ACCESS_TOKEN
FN_CLIENT_ID, FN_CLIENT_SECRET, FN_BASE_URL, FN_USERNAME, FN_PASSWORD
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
ANTHROPIC_API_KEY
ALLOWED_ORIGINS        # comma-separated list for CORS
SYNC_JOB=true          # set by the Container Apps Job to run smartsheet sync and exit
```

## Architecture

### Stack

React 18 + Vite frontend with CSS Modules, **Azure Database for PostgreSQL** (Flexible Server) as the data store, **Data API Builder (DAB)** as a config-driven REST layer over the DB, and a custom JWT auth system. The entire backend runs in a single **Express container** (`server.js`) deployed to Azure Container Apps. A scheduled **Container Apps Job** fires `SYNC_JOB=true` every 30 minutes to run the Smartsheet sync.

### Why the Express proxy layer exists

All calls to FieldNation, Smartsheet, Twilio, and Anthropic go through `api/` handlers — never directly from the browser. This keeps credentials server-side, centralizes rate limiting (in-memory `Map`), and controls CORS. The handlers use a shared `pg` Pool from `api/_lib/db.js` instead of a Supabase client.

### Authentication

`src/hooks/useAuth.js` is the AuthProvider. It calls `/api/auth/login` (bcrypt verify against `users.password_hash`), stores the JWT in localStorage (`ops_access_token`), and exposes the same `isPM` / `isAdmin` shape to consumers. `App.jsx` wraps protected routes with `RequireAuth`.

Roles: `viewer` (read-only) · `pm` (edit sites + push WOs) · `admin` (full access).

Enforcement is dual-layer:
- UI: `useAuth().isPM` / `.isAdmin` gate elements
- API: `api/_lib/middleware.js` runs `jwt.verify(token, JWT_SECRET)` and checks `minRole` on every handler

`src/hooks/useAuth.jsx` is an older duplicate — always use `useAuth.js`.

### Data fetching pattern

Each page uses custom hooks in `src/hooks/`. Hooks call `src/lib/dab.js` — a thin Supabase-shaped client (`dab.from(table).select().eq().order().range()`) that translates to OData query params for DAB REST endpoints (`VITE_DAB_BASE/api/data/<entity>`). Auth JWT is injected as `Authorization: Bearer <token>`. No Redux or Zustand.

**DAB does not support PostgREST-style embedding.** Joins (e.g., sites + projects, work_orders + assignments) are resolved with separate parallel queries merged in JS using maps (`projectMap`, `wosBySite`, `siteMap`, etc.).

Pagination on large tables uses `.range(from, from + 999)` in a loop (1000-row chunks).

### Realtime → polling

Supabase `postgres_changes` realtime is replaced with `setInterval` + `document.addEventListener('visibilitychange')`:
- Alerts, Comms: 30-second poll
- Sites, WorkOrders, SiteWorkOrders: 60-second poll

### API middleware composition

```javascript
export default compose(
  withSecurity,            // security headers, CORS, rate limiting
  requireAuth('pm'),       // jwt.verify + role check → attaches req.user, req.userRole
)(handler)
```

### Shared API utilities

- `api/_lib/db.js` — `query(text, params)`, `getClient()`, `insertRows(table, records)`, `upsertRows(table, records, conflictCols)`
- `api/_lib/credentials.js` — `getFNCredentials()`, `getSSToken()`, `getTwilioCreds()`, `getCredsByService(service)`, `parseCreds(encrypted_data)`
- `api/_lib/middleware.js` — `withSecurity`, `requireAuth(minRole)`, `compose(...)`

### Work Order generation pipeline

`src/cpwog/` is an embedded WO generation engine. `engine.js` expands sites × technicians × dates, `generateWO.js` formats rows for FieldNation CSV, `woTypes.js` defines the six WO types (LVL, LVT, DEL, BRK, INT, INL). LVL/LVT/INT/INL bundle by site ID prefix; DEL/BRK do not.

Site IDs follow the pattern `{code}-{typePrefix}({techNum})` (e.g., `FB1A-LVT(2)`).

### Parser engine

`src/lib/parserEngine.js` runs client-side. It auto-detects CSV delimiters by counting candidates in the first five rows, then applies chainable field transforms (`phone → E.164`, `date → ISO`, `currency → float`). Parser configurations are persisted to the `parsers` table via DAB.

### Mock mode

When FieldNation credentials are absent or `VITE_FN_MOCK=true`, API handlers return `{ results: [], mock: true }` instead of throwing. Full UI interaction is possible without live credentials.

### Deployment

```bash
# Build and push to Azure Container Apps
./deploy-azure.sh

# Run dev server locally (requires built dist/)
npm run build && node server.js
```

The Container Apps Job (`${APP_NAME}-sync-job`) runs on `*/30 * * * *`. When `SYNC_JOB=true`, `server.js` queries all active projects from the DB and fires `POST /api/sync/smartsheet` for each, then exits.

### Schema

`azure/schema.sql` — RLS-stripped Postgres schema derived from the original Supabase migrations. Load with:
```bash
psql "$DATABASE_URL" -f azure/schema.sql
```

### Styling

CSS Modules — each page/component has a matching `.module.css`. Global CSS variables (colors, typography, dark theme tokens) live in `src/index.css`. The `@` alias resolves to `src/`.

### Pending cleanup (Phase 7)

- `src/lib/supabase.js` — orphaned; pending deletion
- `supabase/` directory — Deno edge functions superseded by `api/` handlers; pending deletion
- Remove `@supabase/supabase-js` from `package.json`
