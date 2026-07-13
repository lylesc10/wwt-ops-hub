-- Migration: Remove Supabase Auth dependency
-- The `users` table previously relied on auth.users (Supabase) for identity.
-- We now self-manage passwords in the same table.

-- Add password_hash column (bcrypt)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

-- Add email column if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;

-- Unique constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_key' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;

-- Drop Supabase RLS policies that reference auth.uid() — replace with JWT-based checks
-- (Your Express middleware now handles auth; DAB uses its own policy config)
-- If you have RLS enabled, either disable it or update policies to use the JWT sub claim.
-- Example to disable RLS on tables managed by the Express API:
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE sites DISABLE ROW LEVEL SECURITY;
-- etc.

-- To set an initial password for an existing user (run from psql):
--   UPDATE users SET password_hash = crypt('YourPassword', gen_salt('bf')) WHERE email = 'you@example.com';
-- Or use the POST /api/auth/users endpoint to create users with hashed passwords.
