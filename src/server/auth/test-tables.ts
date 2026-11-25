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
