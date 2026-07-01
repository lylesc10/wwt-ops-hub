# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server at :5173
npm run build     # Vite production build → dist/
npm run preview   # Preview built dist/
npm run lint      # ESLint on src/
node server.js    # Express host after build — serves SPA + /api/*
./deploy-azure.sh # Build + deploy to Azure Container Apps
```

No test suite is configured.

## Environment Variables

Frontend (`VITE_*` are bundled into the browser build at build time):
```
VITE_DAB_BASE              # Data API Builder URL
VITE_FN_MOCK=true          # Enables mock FieldNation responses in dev
VITE_APP_ENV               # Shows DEV/SANDBOX badge in the UI
```

Server-side (`api/` handlers and `server.js` only):
```
DATABASE_URL               # postgresql://user:pass@host:5432/opshub?sslmode=require
JWT_SECRET                 # HS256 signing key for access tokens
JWT_REFRESH_SECRET         # HS256 signing key for refresh tokens
ANTHROPIC_API_KEY
SMARTSHEET_ACCESS_TOKEN
FN_CLIENT_ID, FN_CLIENT_SECRET, FN_BASE_URL, FN_USERNAME, FN_PASSWORD
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
ALLOWED_ORIGINS
SYNC_JOB=true              # Set by Container Apps Job to run sync and exit
```

## Architecture

### Stack

React 18 + Vite frontend with CSS Modules. Backend: Azure Database for PostgreSQL + Data API Builder (DAB) + custom HS256 JWT auth. Express container on Azure Container Apps.

**No Supabase.** The project previously used Supabase but was migrated off in June 2026. `src/lib/supabase.js` is a compatibility shim that routes calls to DAB (data) and `src/lib/auth.js` (auth) — all existing hooks continue to work unchanged.

### Why the Express proxy layer exists

All calls to FieldNation, Smartsheet, Twilio, and the Anthropic API go through `api/` handlers — never directly from the browser. This keeps credentials server-side and controls CORS.

### Authentication

**No login required.** The app is open-access. `src/hooks/useAuth.js` returns a static context with `isAdmin: true, isPM: true, loading: false` — no session check, no redirects.

API endpoints in `api/` still validate JWTs via `api/_lib/middleware.js` (`requireAuth`), but the frontend does not send tokens or show a login UI.

### Data fetching pattern

Each page calls one or more custom hooks in `src/hooks/`. Hooks use `src/lib/supabase.js` (which routes to DAB REST), cache in component `useState`, and use `supabase.channel().on().subscribe()` which the shim converts to 30-second polling intervals. No Redux or Zustand; auth and theme are the only global React contexts.

### DAB REST

`src/lib/dab.js` is a Supabase-shaped query builder over DAB OData REST. `dab.from(table).select(cols).eq(col, val).order(col).range(from, to)` etc. The shim in `src/lib/supabase.js` delegates `.from()` to `dab`.

### API handlers

`api/_lib/db.js` — pg Pool + `supa` query builder used by all `api/` handlers.
`api/_lib/middleware.js` — `withSecurity` (headers, CORS, rate limiting) + `requireAuth(handler, role)`.
`api/_lib/credentials.js` — shared helpers (`getFNCredentials()`, `getTwilioCreds()`, `getSSToken()`).

### Work Order generation pipeline

`src/cpwog/` is an embedded WO generation engine. `engine.js` expands sites × technicians × dates, `generateWO.js` formats rows for FieldNation CSV, `woTypes.js` defines the six WO types (LVL, LVT, DEL, BRK, INT, INL). LVL/LVT/INT/INL bundle by site ID prefix; DEL/BRK do not.

### Parser engine

`src/lib/parserEngine.js` runs client-side. It auto-detects CSV delimiters by counting candidates in the first five rows, then applies chainable field transforms (`phone → E.164`, `date → ISO`, `currency → float`). Parser configurations are persisted to the `parsers` table via DAB.

### DocGen page

`src/pages/DocGen.jsx` — three-view page: document list, 12-question AI generation flow (calls `POST /api/docgen/generate`), and section/subsection editor with DOCX export (`GET /api/docgen/download`). Documents stored in `documents` table.

### Mock mode

When FieldNation credentials are absent or `VITE_FN_MOCK=true`, API handlers return `{ results: [], mock: true }`. Full UI interaction is possible without live credentials.

### Deployment

Deployed to Azure Container Apps via `./deploy-azure.sh`. Schema lives in `azure/schema.sql`; DAB config in `azure/dab-config.json`.

### Styling

CSS Modules — each page/component has a matching `.module.css`. Global CSS variables (colors, typography, dark theme tokens) live in `src/index.css`. The `@` alias resolves to `src/`.
