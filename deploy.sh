#!/usr/bin/env bash
# ============================================================
# WWT OPS Hub — Setup & Deploy Script
# ============================================================
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

log()  { echo -e "${GREEN}▶ $1${RESET}"; }
warn() { echo -e "${AMBER}⚠ $1${RESET}"; }
err()  { echo -e "${RED}✗ $1${RESET}"; exit 1; }
head() { echo -e "\n${BOLD}── $1 ──────────────────────────────────────────${RESET}"; }

head "WWT OPS Hub Deploy"

# ── Preflight checks ─────────────────────────────────────────
head "Preflight"

command -v node    >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org"
command -v npm     >/dev/null 2>&1 || err "npm not found."
command -v git     >/dev/null 2>&1 || err "git not found."

log "Node $(node -v)"
log "npm $(npm -v)"

# Check for .env
if [ ! -f .env ]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  warn "⚠  Fill in .env before running sync or push features"
fi

# ── Install deps ─────────────────────────────────────────────
head "Dependencies"
log "Installing npm packages…"
npm install

# ── Supabase CLI setup ───────────────────────────────────────
head "Supabase"

if command -v supabase >/dev/null 2>&1; then
  log "Supabase CLI found: $(supabase --version)"

  if [ -z "$SUPABASE_PROJECT_REF" ]; then
    warn "SUPABASE_PROJECT_REF not set — skipping remote migration"
    warn "Run: export SUPABASE_PROJECT_REF=your-ref && ./deploy.sh"
  else
    log "Linking to project $SUPABASE_PROJECT_REF"
    supabase link --project-ref "$SUPABASE_PROJECT_REF"

    log "Running migrations…"
    supabase db push

    log "Deploying edge functions…"
    supabase functions deploy smartsheet-sync
    supabase functions deploy fn-check-dupes
    supabase functions deploy fn-push-wo
    supabase functions deploy fn-fetch-status

    log "Edge functions deployed ✓"
  fi
else
  warn "Supabase CLI not found — skipping remote migration"
  warn "Install: https://supabase.com/docs/guides/cli"
  warn "Then run migrations manually:"
  warn "  supabase link --project-ref YOUR_REF"
  warn "  supabase db push"
fi

# ── Vercel deploy ────────────────────────────────────────────
head "Vercel"

if command -v vercel >/dev/null 2>&1; then
  log "Vercel CLI found: $(vercel --version)"

  if [ "${1}" == "--prod" ]; then
    log "Deploying to production…"
    vercel --prod
  else
    log "Deploying to preview…"
    vercel
    warn "Pass --prod flag to deploy to production: ./deploy.sh --prod"
  fi
else
  warn "Vercel CLI not found — skipping deploy"
  warn "Install: npm i -g vercel"
  warn "Then: vercel (preview) or vercel --prod (production)"
fi

# ── Local dev ────────────────────────────────────────────────
head "Local Dev"
log "To start dev server: npm run dev"
log "App will be available at http://localhost:5173"

echo ""
log "Phase 1 complete ✓"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Fill in .env with Supabase URL + anon key"
echo "  2. Run migrations: supabase db push"
echo "  3. Start dev: npm run dev"
echo "  4. Phase 2: Add Smartsheet token + sheet ID in Settings"
echo ""
