-- Tables of the test sign-in mode only (B43), run by scripts/e2e-server.mts after the
-- migrations of drizzle/. Never applied to Supabase. Keep in step with
-- src/server/auth/test-tables.ts.
CREATE TABLE test_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
