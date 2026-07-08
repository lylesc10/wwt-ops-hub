#!/usr/bin/env bash
# ============================================================
# One-push test data: seeds sites + routes, then shifts the
# schedule onto the current week, fills tech assignments, and
# seeds alerts — so Dashboard, Site Board, Tech Gantt, and
# Route Gantt all render populated in one run.
#
# Usage:
#   ./scripts/seed_demo.sh                 # uses DATABASE_URL from .env
#   DATABASE_URL=... ./scripts/seed_demo.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2-)
fi
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is not set (env or .env)"; exit 1; }

run_sql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"
  elif docker ps --format '{{.Names}}' | grep -q '^wwt-ops-hub-db$'; then
    docker exec -i wwt-ops-hub-db psql -U postgres -d opshub -v ON_ERROR_STOP=1 -q < "$1"
  else
    echo "Need psql on PATH or the wwt-ops-hub-db docker container running"; exit 1
  fi
}

echo "→ ensuring an active project exists"
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -qc "insert into projects (name, client, color, is_active)
    select 'PNC LVV Refresh','PNC Bank','#3b82f6',true
    where not exists (select 1 from projects where is_active)"
else
  docker exec wwt-ops-hub-db psql -U postgres -d opshub -qc "insert into projects (name, client, color, is_active)
    select 'PNC LVV Refresh','PNC Bank','#3b82f6',true
    where not exists (select 1 from projects where is_active)"
fi

echo "→ clearing demo alerts (they reference sites that get re-seeded)"
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -qc "delete from alert_log"
else
  docker exec wwt-ops-hub-db psql -U postgres -d opshub -qc "delete from alert_log"
fi

echo "→ seeding sites"
run_sql scripts/seed_sites.sql
echo "→ seeding routes"
run_sql scripts/seed_routes.sql
echo "→ demo pass (date shift, statuses, techs, alerts)"
run_sql scripts/seed_demo.sql
echo "✓ done — Dashboard, Site Board, Tech Gantt, and Route Gantt are populated"
