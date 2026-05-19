# ── Ops Manager — Environment Configuration ──────────────────
#
# THREE ENVIRONMENTS:
#
# PROD    → wwt-ops-hub.vercel.app          (main branch)
#           Supabase: prod project
#           Real Twilio, real FN credentials
#           601 live PNC sites
#
# DEV     → wwt-ops-hub-dev.vercel.app      (dev branch)
#           Supabase: dev project (clone of prod schema, subset of data)
#           Real credentials optional
#           Where new features get built and tested
#
# SANDBOX → wwt-ops-hub-sandbox.vercel.app  (sandbox branch)
#           Supabase: sandbox project (seed data only, fake sites)
#           Mock credentials
#           Safe to break, demo to stakeholders
#
# ─────────────────────────────────────────────────────────────
# HOW TO SET UP
# ─────────────────────────────────────────────────────────────
#
# 1. Create 3 Supabase projects:
#    - ops-manager-prod    (your current project)
#    - ops-manager-dev     (clone schema, small data set)
#    - ops-manager-sandbox (schema only, seed data)
#
# 2. Create 3 branches in GitHub:
#    git checkout -b dev && git push origin dev
#    git checkout -b sandbox && git push origin sandbox
#
# 3. In Vercel → Settings → Git:
#    - main     → prod environment variables
#    - dev      → dev environment variables
#    - sandbox  → sandbox environment variables
#
# 4. Set environment variables per branch in Vercel
#    (see .env.example files below)
#
# ─────────────────────────────────────────────────────────────
# WORKFLOW
# ─────────────────────────────────────────────────────────────
#
# New feature:
#   dev branch → build + test → PR to main → prod deploy
#
# Demo / stakeholder review:
#   sandbox branch → safe to reset anytime
#
# Hotfix:
#   fix on main directly OR fix on dev → cherry-pick to main
#
# ─────────────────────────────────────────────────────────────
# VITE_APP_ENV is injected at build time to show environment
# indicator in the UI (DEV badge, SANDBOX badge)
# ─────────────────────────────────────────────────────────────
