// Tables of the test sign-in mode only (B43). They are created by `e2e/test-tables.sql`,
// which the e2e script runs after the migrations; this file is not in drizzle.config.ts,
// so `drizzle/` and Supabase never get them. Keep both files the same.
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// The auth users of the test mode, standing in for Supabase's auth.users (B25), with their
// identities ('email', 'google'). The email is not unique (a Google outcome "new").
export const testAuthUsers = pgTable('test_auth_users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  identities: text('identities').array().notNull().default(['email']),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per signed-in browser context; the cookie holds the token. A session belongs to an
// auth user, which may have no profile yet (a first Google sign-in).
export const testSessions = pgTable('test_sessions', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => testAuthUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// The codes of the stand-in for Google (/test/google), used once by /auth/callback.
export const testOAuthCodes = pgTable('test_oauth_codes', {
  code: text('code').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  outcome: text('outcome').notNull().default('linked'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

// The test mailbox (B43): every account email the test mode sends, with its link token.
export const testMailbox = pgTable('test_mailbox', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  kind: text('kind').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id').references(() => testAuthUsers.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

// The addresses the test mode refuses to send to, as Resend with no domain does (CN-74, B65),
// set by /test/mail-refuse.
export const testMailRefuse = pgTable('test_mail_refuse', {
  email: text('email').primaryKey(),
})

// The files of the test version of StorageProvider (B71): the stand-in for the `dish-photos`
// bucket, uploaded and read through /test/files.
export const testFiles = pgTable('test_files', {
  path: text('path').primaryKey(),
  contentType: text('content_type').notNull(),
  // Base64 of the bytes: text keeps the test tables simple.
  data: text('data').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Failed sign-ins, for the low limit of the test mode (B60).
export const testSignInFailures = pgTable('test_sign_in_failures', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
})
