// Tables of the test sign-in mode only (B43). They are created by `e2e/test-tables.sql`,
// which the e2e script runs after the migrations; this file is not in drizzle.config.ts,
// so `drizzle/` and Supabase never get them. Keep both files the same.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from '@/server/db/schema'

// One row per signed-in browser context; the cookie holds the token.
export const testSessions = pgTable('test_sessions', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// The auth users of the test mode, standing in for Supabase's auth.users (B25).
export const testAuthUsers = pgTable('test_auth_users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

// Failed sign-ins, for the low limit of the test mode (B60).
export const testSignInFailures = pgTable('test_sign_in_failures', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
})
