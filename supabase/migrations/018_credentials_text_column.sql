-- ============================================================
-- Migration 018 — credentials.encrypted_data (idempotent no-op)
-- ============================================================
-- Migration 017 handles the bytea → text conversion correctly.
-- This migration is retained for deployment sequencing only.
-- The actual fix is in migration 020 which runs the same
-- idempotent do-block and handles both fresh and upgraded DBs.

select 'Migration 018 — no-op, handled by 017 and 020' as note;
