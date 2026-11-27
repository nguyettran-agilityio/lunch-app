// Drizzle tables of the real app (docs/plan.md section 2). Every table has Row Level
// Security on and no policy (B14): only the server's database connection reads and writes.
// Migrations only add while PRs share the preview project (B21).
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

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

// The groups of a build-your-own plate (BR-7, S-S2, PR M2-1). `name_key` is the name as compared
// (NFC, trimmed, lower case), computed by domain/dishes.ts; its unique constraint is
// DEFERRABLE INITIALLY DEFERRED in migration 0003, which Drizzle cannot express, so one Save can
// swap two names and the check does not depend on the database's locale (B71).
export const dishGroups = pgTable(
  'dish_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    min: integer('min').notNull(),
    max: integer('max').notNull(),
    included: integer('included').notNull(),
    extraFee: integer('extra_fee').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    unique('dish_groups_name_key_unique').on(t.nameKey),
    // The number rules of BR-7 (CN-60, CN-81), kept in the database too (B40).
    check('dish_groups_counts', sql`0 <= ${t.min} AND ${t.min} <= ${t.included} AND ${t.included} <= ${t.max} AND ${t.max} >= 1`),
    check('dish_groups_extra_fee', sql`${t.extraFee} >= 0`),
  ],
).enableRLS()

// The shop's one dish list (BR-1, S-S1, PR M2-1). `price` null = not a ready meal; `group_id` null
// = not a build-your-own dish; `photo_path` is the path in the `dish-photos` bucket (B15, B71);
// `drawing` a key of the drawing set of components/art.tsx. `name_key` as in dish_groups.
export const dishes = pgTable(
  'dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    description: text('description').notNull().default(''),
    nameEn: text('name_en'),
    descriptionEn: text('description_en'),
    photoPath: text('photo_path'),
    drawing: text('drawing'),
    price: integer('price'),
    groupId: uuid('group_id').references(() => dishGroups.id),
    surcharge: integer('surcharge').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    unique('dishes_name_key_unique').on(t.nameKey),
    check('dishes_money', sql`(${t.price} IS NULL OR ${t.price} >= 0) AND ${t.surcharge} >= 0`),
    // At least one kind (CN-80).
    check('dishes_kind', sql`${t.price} IS NOT NULL OR ${t.groupId} IS NOT NULL`),
  ],
).enableRLS()

// A day of the shop's calendar (BR-3, BR-4, plan.md section 2, PR M2-2, B73): created by the first
// Save of that day on the Days screen, or by a change of the default cutoff while that day is past
// it. `cutoff` is the day's own cutoff (null = the default); `locked_cutoff` the default that applied
// when the day passed its cutoff and the default then changed (CN-61). Minutes after midnight.
export const serviceDays = pgTable('service_days', {
  date: date('date', { mode: 'string' }).primaryKey(),
  cutoff: integer('cutoff'),
  lockedCutoff: integer('locked_cutoff'),
  closed: boolean('closed').notNull().default(false),
}).enableRLS()

export const menuKindEnum = pgEnum('menu_kind', ['fixed', 'component'])

// A day's menu (BR-2, CN-83): which dishes are on sale that day as a ready meal (`fixed`) or as a
// build-your-own dish (`component`). A day has a menu when it has a row (BR-3); a row stays when its
// dish changes on S-S1, and customers see the dish only in the kinds still true (CN-83).
export const dayMenu = pgTable(
  'day_menu',
  {
    date: date('date', { mode: 'string' })
      .notNull()
      .references(() => serviceDays.date),
    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id),
    kind: menuKindEnum('kind').notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.dishId, t.kind] })],
).enableRLS()

// The one row of shop settings (plan.md section 2), created by the first Save of the
// Build-your-own rules screen (B71) or of the Settings screen (B73). The columns of later PRs stay null until then.
export const shopSettings = pgTable(
  'shop_settings',
  {
    id: boolean('id').primaryKey().default(true),
    basePrice: integer('base_price'),
    defaultCutoff: integer('default_cutoff'),
    bankBin: text('bank_bin'),
    bankAccount: text('bank_account'),
    bankHolder: text('bank_holder'),
    reminderSeenAt: timestamp('reminder_seen_at', { withTimezone: true }),
  },
  (t) => [
    check('shop_settings_one_row', sql`${t.id}`),
    check('shop_settings_base_price', sql`${t.basePrice} IS NULL OR ${t.basePrice} >= 0`),
  ],
).enableRLS()
