-- Tables of the test sign-in mode only (B43), run by scripts/e2e-server.mts after the
-- migrations of drizzle/. Never applied to Supabase. Keep in step with
-- src/server/auth/test-tables.ts.
-- The auth users of the test mode, standing in for Supabase's auth.users (B25): the password
-- hash, when the email was confirmed, and the identities ('email', 'google'). No foreign key
-- to profiles, as in Supabase (B38). The email is not unique: a Google sign-in can make
-- another user with the email of a waiting one (plan.md section 1.5, outcome "new").
CREATE TABLE test_auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text,
  confirmed_at timestamptz,
  identities text[] NOT NULL DEFAULT '{email}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A session belongs to an auth user, which may have no profile yet (a first Google sign-in).
CREATE TABLE test_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES test_auth_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The codes of the test mode's stand-in for Google (/test/google), used once by
-- /auth/callback: the Google email and name, and what the sign-in service does when the email
-- is already a user's ('linked', 'dropped' or 'new', plan.md section 1.5).
CREATE TABLE test_oauth_codes (
  code text PRIMARY KEY,
  email text NOT NULL,
  name text,
  outcome text NOT NULL DEFAULT 'linked',
  created_at timestamptz NOT NULL,
  used_at timestamptz
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

-- The addresses the test mode refuses to send to, as Resend with no domain does (CN-74,
-- B65), set by /test/mail-refuse.
CREATE TABLE test_mail_refuse (
  email text PRIMARY KEY
);

-- The files of the test version of StorageProvider (B71), standing in for the `dish-photos`
-- bucket: uploaded and read through /test/files; the bytes as base64.
CREATE TABLE test_files (
  path text PRIMARY KEY,
  content_type text NOT NULL,
  data text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Failed sign-ins, for the low limit of the test mode (B60).
CREATE TABLE test_sign_in_failures (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  at timestamptz NOT NULL
);
