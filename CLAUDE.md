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
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FN_MOCK=true          # Enables mock FieldNation responses in dev
VITE_APP_ENV               # Shows DEV/SANDBOX badge in the UI
```

Server-side (Vercel functions and Supabase edge functions only):
```
SUPABASE_SERVICE_ROLE_KEY
SMARTSHEET_ACCESS_TOKEN
FN_CLIENT_ID, FN_CLIENT_SECRET, FN_BASE_URL, FN_USERNAME, FN_PASSWORD
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
ALLOWED_ORIGINS
```

## Architecture

### Stack

React 18 + Vite frontend with CSS Modules, Supabase (Postgres + Auth + Realtime + Edge Functions), and Vercel serverless functions that proxy all third-party API calls.

### Why the Vercel proxy layer exists

All calls to FieldNation, Smartsheet, and Twilio go through `api/` serverless functions — never directly from the browser. This keeps credentials server-side, centralizes rate limiting (in-memory `Map`, not persistent — documented to swap with Upstash Redis in prod), and controls CORS.

### Authentication

`src/hooks/useAuth.js` is the AuthProvider. It wraps Supabase email/password auth and fetches a profile from `public.users` to determine role. `App.jsx` wraps protected routes with a `RequireAuth` component that redirects to `/login` on no session.

Roles are `viewer` (read-only), `pm` (edit sites + push WOs), `admin` (full access). Enforcement is dual-layer: `useAuth().isPM` / `.isAdmin` gate UI elements, and the Vercel middleware (`api/_lib/middleware.js`) validates the Supabase JWT and checks `minRole` on every API call.

### Data fetching pattern

Each page calls one or more custom hooks in `src/hooks/`. Hooks fetch from Supabase directly, cache in component `useState`, and open a Realtime channel to receive `postgres_changes` events — so live data flows in without polling. No Redux or Zustand; auth and theme are the only global React contexts.

Supabase queries on large tables paginate in 1000-row chunks to avoid timeouts.

### Vercel API middleware composition

```javascript
export default compose(
  withSecurity,            // Headers, CORS, rate limiting
  requireAuth('pm'),       // JWT validation + role check
  validateBody(schema),    // Zod or manual validation
)(handler)
```

`withSecurity` adds security headers and handles OPTIONS. `requireAuth` attaches `req.user` and `req.userRole`.

### Work Order generation pipeline

`src/cpwog/` is an embedded WO generation engine. `engine.js` expands sites × technicians × dates, `generateWO.js` formats rows for FieldNation CSV, `woTypes.js` defines the six WO types (LVL, LVT, DEL, BRK, INT, INL). LVL/LVT/INT/INL bundle by site ID prefix; DEL/BRK do not.

Site IDs follow the pattern `{code}-{typePrefix}({techNum})` (e.g., `FB1A-LVT(2)`), which FieldNation uses to group bundled WOs.

### Parser engine

`src/lib/parserEngine.js` runs client-side. It auto-detects CSV delimiters by counting candidates in the first five rows, then applies chainable field transforms (`phone → E.164`, `date → ISO`, `currency → float`). Parser configurations are persisted to the `parsers` Supabase table.

### Mock mode

When FieldNation credentials are absent or `VITE_FN_MOCK=true`, API functions return `{ results: [], mock: true }` instead of throwing. This allows full UI interaction without live credentials.

### Three deployment environments

| Branch | Vercel URL | Supabase project |
|--------|-----------|-----------------|
| `main` | wwt-ops-hub.vercel.app | prod (601 live PNC sites) |
| `dev` | wwt-ops-hub-dev.vercel.app | dev |
| `sandbox` | wwt-ops-hub-sandbox.vercel.app | sandbox |

### Supabase Edge Functions (Deno)

Deployed separately from Vercel:
```bash
supabase functions deploy smartsheet-sync
supabase functions invoke smartsheet-sync --body '{"project_id":"UUID"}'
```

Functions in `supabase/functions/`: `smartsheet-sync`, `fn-push-wo`, `fn-check-dupes`, `fn-fetch-status`.

### Styling

CSS Modules — each page/component has a matching `.module.css`. Global CSS variables (colors, typography, dark theme tokens) live in `src/index.css`. The `@` alias resolves to `src/`.

### Known cleanup item

Two auth hook files exist: `src/hooks/useAuth.js` (the real provider) and `src/hooks/useAuth.jsx` (an older duplicate). Use `useAuth.js`.
