-- Tables of the test sign-in mode only (B43), run by scripts/e2e-server.mts after the
-- migrations of drizzle/. Never applied to Supabase. Keep in step with
-- src/server/auth/test-tables.ts.
CREATE TABLE test_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The auth users of the test mode, standing in for Supabase's auth.users (B25): the password
-- hash and when the email was confirmed. No foreign key to profiles, as in Supabase (B38).
CREATE TABLE test_auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The test mailbox (B43): every account email the test mode "sends", with its link token.
-- A link works once and for 1 hour; a newer link of the same kind replaces the older one.
-- Rows stay when their user is deleted, so the email limit still counts them (B60).
CREATE TABLE test_mailbox (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  kind text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES test_auth_users (id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Failed sign-ins, for the low limit of the test mode (B60).
CREATE TABLE test_sign_in_failures (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  at timestamptz NOT NULL
);
