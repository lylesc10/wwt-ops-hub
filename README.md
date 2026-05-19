# WWT OPS Hub

> WWT Field Services Operations Platform

Replaces Smartsheet + Excel Gantt + FieldNation context-switching with a single live operations hub.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Supabase (Postgres + Auth + Edge Functions + Realtime) |
| Serverless Proxy | Vercel Functions |
| Deployment | Vercel |
| WO Engine | CPWOG core |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/wwt/wwt-ops-hub
cd wwt-ops-hub

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

# 4. Run migrations
supabase link --project-ref YOUR_REF
supabase db push

# 5. Dev
npm run dev
```

---

## Build Phases

| Phase | Status | What ships |
|---|---|---|
| **1** | ✅ **Done** | Scaffold · Supabase schema · Auth · Shell UI · Dashboard · Site Board |
| **2** | 🔜 | Smartsheet API sync · Site Board live data |
| **3** | 🔜 | Tech Gantt view |
| **4** | 🔜 | CPWOG engine integration · WO generation |
| **5** | 🔜 | Pre-Push Review screen · FN dupe check |
| **6** | 🔜 | FN push + status monitoring |
| **7** | 🔜 | Full alerts pipeline |
| **8** | 🔜 | SSO swap-in |

---

## Environment Variables

| Variable | Required For | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | All | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | All | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions / Vercel sync API | Never expose to frontend |
| `SMARTSHEET_ACCESS_TOKEN` | Phase 2 | Smartsheet API personal token |
| `FN_CLIENT_ID` | Phase 5–6 | FieldNation OAuth2 client ID |
| `FN_CLIENT_SECRET` | Phase 5–6 | FieldNation OAuth2 client secret |
| `FN_BASE_URL` | Phase 5–6 | Defaults to `https://api.fieldnation.com` |
| `VITE_FN_MOCK` | Dev | Set to `true` to use mocked FN responses |

---

## Mock Mode

Everything runs in mock mode until real credentials are added:

- **Smartsheet**: returns 8 mock PNC branch sites with realistic data
- **FieldNation**: push returns mock WO IDs; dupe check returns empty

Switch to real data by setting credentials in `.env` — no code changes needed.

---

## User Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — user management, API config, all writes |
| `pm` | Read all + edit sites + push WOs + acknowledge alerts |
| `viewer` | Read-only |

Assign roles via the Supabase dashboard (users table) or Settings page (Phase 2).

---

## Supabase Edge Functions

```bash
# Deploy all
supabase functions deploy smartsheet-sync
supabase functions deploy fn-check-dupes
supabase functions deploy fn-push-wo
supabase functions deploy fn-fetch-status

# Manual sync trigger
supabase functions invoke smartsheet-sync --body '{"project_id":"YOUR_UUID"}'
```

---

## Repo Structure

```
src/
  pages/        Dashboard, SiteBoard, TechGantt, WorkOrders, Alerts, Settings
  components/   Shell, StatusBadge, SiteEditModal, AlertBanner, PageHeader
  hooks/        useAuth, useSites, useWorkOrders, useAlerts
  lib/          supabase.js, fieldnation.js, smartsheet.js
  cpwog/        generateWO.js, bundleWOs.js, woTypes.js

api/
  fn/           FieldNation proxy (Vercel serverless)
  smartsheet/   Smartsheet proxy
  sync/         Manual sync trigger

supabase/
  functions/    Edge functions (Deno)
  migrations/   001_init.sql
```

---


