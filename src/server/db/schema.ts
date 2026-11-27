// Drizzle tables of the real app (docs/plan.md section 2). Every table has Row Level
// Security on and no policy (B14): only the server's database connection reads and writes.
// Migrations only add while PRs share the preview project (B21).
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'

// Value lists are Postgres enums, so a later value is added with ALTER TYPE ... ADD VALUE (B39).
export const langEnum = pgEnum('lang', ['vi', 'en'])
export const authMethodEnum = pgEnum('auth_method', ['password', 'google'])
export const buildingStateEnum = pgEnum('building_state', ['approved', 'pending', 'declined'])
export const mailKindEnum = pgEnum('mail_kind', ['confirm', 'reset', 'change'])

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // The address is optional when a customer proposes a building (CN-64); the domain uses ''.
  address: text('address').notNull().default(''),
  // Minutes after midnight, Vietnam time (BR-18); null until the shop sets it.
  deliveryTime: integer('delivery_time'),
  state: buildingStateEnum('state').notNull(),
  proposedBy: uuid('proposed_by').references((): AnyPgColumn => profiles.id),
}).enableRLS()

// One row for every account, shop and Google accounts included. `id` is the Supabase
// auth user id, with no foreign key to auth.users (B38). `email` and `pending_email` are
// unique across both columns: each column has its own unique constraint, and a trigger
// in the migration refuses an address held in the other column of another row (B37).
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    name: text('name'),
    phone: text('phone').unique('profiles_phone_unique'),
    email: text('email').notNull().unique('profiles_email_unique'),
    buildingId: uuid('building_id').references(() => buildings.id),
    lang: langEnum('lang').notNull().default('vi'),
    method: authMethodEnum('method').notNull(),
    needsPassword: boolean('needs_password').notNull().default(false),
    pendingEmail: text('pending_email').unique('profiles_pending_email_unique'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Checks kept in the database (B40): the phone as normalized by domain/phone.ts
    // (BR-29a), and emails in lower case. The 80-character name rule stays in code.
    check('profiles_phone_format', sql`${t.phone} ~ '^0[35789][0-9]{8}$'`),
    check('profiles_email_lower', sql`${t.email} = lower(${t.email})`),
    check('profiles_pending_email_lower', sql`${t.pendingEmail} = lower(${t.pendingEmail})`),
  ],
).enableRLS()

// Last-sent times of account emails, for the 60-second "Send again" wait (plan.md section 1.5).
export const authMailLog = pgTable(
  'auth_mail_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    kind: mailKindEnum('kind').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_mail_log_email_sent_at_idx').on(t.email, t.sentAt),
    check('auth_mail_log_email_lower', sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS()

// The reset links whose new password was saved (CN-74, B67): the SHA-256 digest of the link's
// token hash, so a saved link opens "The link has expired" as soon as it is tapped, in any
// browser; Supabase refuses a used link only when the app uses it. Rows older than 1 hour are
// deleted when a new one is written, since an older link has expired anyway.
export const usedResetLinks = pgTable('used_reset_links', {
  digest: text('digest').primaryKey(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull(),
}).enableRLS()
