# Database schema history

**`azure/schema.sql` is the single source of truth for provisioning a fresh
database.** Load it with:

```bash
psql "$DATABASE_URL" -f azure/schema.sql
```

## What's in this directory

`db/migrations/*.sql` is the historical record of schema changes as they were
originally written and applied, kept for reference. They are **not** meant to
be re-applied to a fresh database — everything in them has already been
folded into `azure/schema.sql`:

| Migration | Consolidated into |
|---|---|
| `20260629_documents.sql` | `documents` table (reconciled with `021_docgen.sql`'s later version — see note in `schema.sql`) |
| `20260701_remove_supabase_auth.sql` | Already reflected — `users.email` is `UNIQUE` and `password_hash` exists in the base `users` table definition |
| `20260707_route_planning.sql` | `route_plans`, `route_plan_projects`, `route_plan_teams`, `route_plan_team_members`, `route_plan_stops`, `tech_time_off`, `geocode_cache` |
| `20260708_wo_generator.sql` | `job_history` columns (`include_wrk`, `wrk_config`, `sdt_config`, `fn_results`) + `wo_templates`, `site_library` |
| `021_docgen.sql` | `docgen_projects`, `docgen_uploads`, `docgen_question_templates` (+ seed data), `docgen_question_responses`, `documents` |

This directory was previously named `supabase/migrations/` — a holdover from
before the June 2026 migration off Supabase to Azure PostgreSQL (see the root
`CLAUDE.md`). It's renamed here since the project no longer uses Supabase.

## Adding a new schema change

There's no migration runner in this project — add your `CREATE TABLE` /
`ALTER TABLE` statements directly to `azure/schema.sql` (in dependency order),
and optionally drop a dated `.sql` file in here documenting what changed, in
the same style as the existing files.
