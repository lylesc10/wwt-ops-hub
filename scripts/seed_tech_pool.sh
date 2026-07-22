#!/usr/bin/env bash
# ============================================================
# Seed the Tech Pool with 100 random technicians and build
# route-plan teams from them — see seed_tech_pool.sql.
#
# Usage:
#   ./scripts/seed_tech_pool.sh              # uses DATABASE_URL from .env
#   DATABASE_URL=... ./scripts/seed_tech_pool.sh
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

echo "→ seeding tech pool + route-plan teams"
run_sql scripts/seed_tech_pool.sql
echo "✓ done — check Tech Pool and Route Planning → plan → Teams"
