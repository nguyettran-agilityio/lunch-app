// @vitest-environment node
// The first migration (PR M1-1b of docs/plan.md): profiles, auth_mail_log and buildings on
// PGlite, with the constraints of plan.md section 2 and decisions B14, B37–B40.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { authMailLog, buildings, profiles } from '@/server/db/schema'
import { createTestDb, type TestDb } from './helpers/db'

const LAN = '00000000-0000-4000-8000-000000000001'
const HUY = '00000000-0000-4000-8000-000000000002'

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
})
afterEach(async () => {
  await t.close()
})

// The constraint name of the error a write fails with (drizzle wraps the driver error).
async function failure(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (e) {
    const err = e as { constraint?: string; cause?: { constraint?: string; message?: string }; message?: string }
    return err.cause?.constraint ?? err.constraint ?? err.cause?.message ?? err.message ?? 'unknown'
  }
  return 'no error'
}

function lan(fields: Partial<typeof profiles.$inferInsert> = {}) {
  return t.db.insert(profiles).values({ id: LAN, email: 'lan@gmail.com', method: 'password', ...fields })
}
function huy(fields: Partial<typeof profiles.$inferInsert> = {}) {
  return t.db.insert(profiles).values({ id: HUY, email: 'huy@gmail.com', method: 'password', ...fields })
}

describe('first migration', () => {
  it('creates the three tables with the columns of plan.md section 2', async () => {
    const { rows } = await t.pg.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`,
    )
    const cols = (table: string) => rows.filter((r) => r.table_name === table).map((r) => r.column_name)
    expect(cols('profiles')).toEqual([
      'id',
      'name',
      'phone',
      'email',
      'building_id',
      'lang',
      'method',
      'needs_password',
      'pending_email',
      'created_at',
    ])
    expect(cols('auth_mail_log')).toEqual(['id', 'email', 'kind', 'sent_at'])
    expect(cols('buildings')).toEqual(['id', 'name', 'address', 'delivery_time', 'state', 'proposed_by'])
  })

  it('B14: every table has Row Level Security on and no policy', async () => {
    const { rows } = await t.pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    )
    expect(rows).toEqual([
      { relname: 'auth_mail_log', relrowsecurity: true },
      { relname: 'buildings', relrowsecurity: true },
      // PR M2-1 (B71).
      { relname: 'dish_groups', relrowsecurity: true },
      { relname: 'dishes', relrowsecurity: true },
      { relname: 'profiles', relrowsecurity: true },
      { relname: 'shop_settings', relrowsecurity: true },
      // PR M1-4 (CN-74, B67).
      { relname: 'used_reset_links', relrowsecurity: true },
    ])
    const policies = await t.pg.query(`select 1 from pg_policies where schemaname = 'public'`)
    expect(policies.rows).toHaveLength(0)
  })

  it('fills the defaults of a new profile: Vietnamese (BR-30), no password needed, created now', async () => {
    await lan()
    const [row] = await t.db.select().from(profiles).where(eq(profiles.id, LAN))
    expect(row).toMatchObject({ lang: 'vi', needsPassword: false, phone: null, name: null, pendingEmail: null, buildingId: null })
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it('B38: a profile id needs no auth user', async () => {
    await lan()
    expect(await t.db.$count(profiles)).toBe(1)
  })
})

describe('profiles: phone', () => {
  it('a phone number is unique', async () => {
    await lan({ phone: '0912345678' })
    expect(await failure(huy({ phone: '0912345678' }))).toBe('profiles_phone_unique')
  })

  it('B40: the phone is 10 digits starting with 03, 05, 07, 08 or 09, as normalized', async () => {
    for (const phone of ['0281234567', '091234567', '09123456789', '+84912345678', '0912 345 678']) {
      expect(await failure(lan({ phone }))).toBe('profiles_phone_format')
    }
    for (const [i, phone] of ['0312345678', '0512345678', '0712345678', '0812345678', '0912345678'].entries()) {
      await t.db
        .insert(profiles)
        .values({ id: `00000000-0000-4000-8000-00000000010${i}`, email: `c${i}@gmail.com`, method: 'google', phone })
    }
    expect(await t.db.$count(profiles)).toBe(5)
  })
})

describe('profiles: email and pending_email', () => {
  it('B40: emails are stored in lower case', async () => {
    expect(await failure(lan({ email: 'Lan@gmail.com' }))).toBe('profiles_email_lower')
    expect(await failure(lan({ pendingEmail: 'Lan2@gmail.com' }))).toBe('profiles_pending_email_lower')
    expect(await failure(t.db.insert(authMailLog).values({ email: 'Lan@gmail.com', kind: 'confirm' }))).toBe('auth_mail_log_email_lower')
  })

  it('an email and a waiting email are each unique in their column', async () => {
    await lan({ pendingEmail: 'new@gmail.com' })
    expect(await failure(huy({ email: 'lan@gmail.com' }))).toBe('profiles_email_unique')
    expect(await failure(huy({ pendingEmail: 'new@gmail.com' }))).toBe('profiles_pending_email_unique')
  })

  // A waiting email counts as taken (CN-65).
  it('B37: an email waiting for Lan cannot be the email of another profile', async () => {
    await lan({ pendingEmail: 'lan2@gmail.com' })
    expect(await failure(huy({ email: 'lan2@gmail.com' }))).toBe('profiles_email_cross_unique')
    await huy()
    expect(await failure(t.db.update(profiles).set({ email: 'lan2@gmail.com' }).where(eq(profiles.id, HUY)))).toBe(
      'profiles_email_cross_unique',
    )
  })

  it('B37: the email of another profile cannot wait for Lan', async () => {
    await huy()
    await lan()
    expect(await failure(t.db.update(profiles).set({ pendingEmail: 'huy@gmail.com' }).where(eq(profiles.id, LAN)))).toBe(
      'profiles_email_cross_unique',
    )
  })

  // One waiting email per profile: a new change overwrites it, which frees the old address.
  it('B37: a new change frees the old waiting email; confirming moves it to email', async () => {
    await lan({ pendingEmail: 'lan2@gmail.com' })
    await t.db.update(profiles).set({ pendingEmail: 'lan3@gmail.com' }).where(eq(profiles.id, LAN))
    await huy({ email: 'lan2@gmail.com' })
    expect(await failure(t.db.update(profiles).set({ email: 'lan3@gmail.com' }).where(eq(profiles.id, HUY)))).toBe(
      'profiles_email_cross_unique',
    )
    // Lan confirms lan3@gmail.com: her own row may move the address from one column to the other.
    await t.db.update(profiles).set({ email: 'lan3@gmail.com', pendingEmail: null }).where(eq(profiles.id, LAN))
    const [row] = await t.db.select().from(profiles).where(eq(profiles.id, LAN))
    expect(row).toMatchObject({ email: 'lan3@gmail.com', pendingEmail: null })
  })

  it('B37: other updates of a profile are not refused by the check', async () => {
    await lan({ pendingEmail: 'lan2@gmail.com' })
    await t.db.update(profiles).set({ name: 'Trần Thị Lan', lang: 'en' }).where(eq(profiles.id, LAN))
    const [row] = await t.db.select().from(profiles).where(eq(profiles.id, LAN))
    expect(row).toMatchObject({ name: 'Trần Thị Lan', lang: 'en', pendingEmail: 'lan2@gmail.com' })
  })
})

describe('value lists (B39)', () => {
  it('refuses a value that is not in the list', async () => {
    expect(await failure(t.pg.query(`insert into profiles (id, email, method) values ('${LAN}', 'lan@gmail.com', 'facebook')`))).toMatch(
      /invalid input value for enum auth_method/,
    )
    expect(
      await failure(t.pg.query(`insert into profiles (id, email, method, lang) values ('${LAN}', 'lan@gmail.com', 'google', 'fr')`)),
    ).toMatch(/invalid input value for enum lang/)
    expect(await failure(t.pg.query(`insert into buildings (name, state) values ('Tòa ABC', 'closed')`))).toMatch(
      /invalid input value for enum building_state/,
    )
    expect(await failure(t.pg.query(`insert into auth_mail_log (email, kind) values ('lan@gmail.com', 'welcome')`))).toMatch(
      /invalid input value for enum mail_kind/,
    )
  })
})

describe('buildings', () => {
  // A proposed building is pending (BR-16) and its address is optional (CN-64).
  it('a proposed building needs only a name; it is pending and has no delivery time yet', async () => {
    await lan()
    const [b] = await t.db.insert(buildings).values({ name: 'Tòa ABC', state: 'pending', proposedBy: LAN }).returning()
    expect(b).toMatchObject({ name: 'Tòa ABC', address: '', deliveryTime: null, state: 'pending', proposedBy: LAN })
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/)
    await t.db.update(profiles).set({ buildingId: b.id }).where(eq(profiles.id, LAN))
  })

  it('a building is proposed by an existing profile, and a profile points at an existing building', async () => {
    expect(await failure(t.db.insert(buildings).values({ name: 'Tòa ABC', state: 'pending', proposedBy: HUY }))).toBe(
      'buildings_proposed_by_profiles_id_fk',
    )
    expect(await failure(lan({ buildingId: '00000000-0000-4000-8000-0000000000ff' }))).toBe('profiles_building_id_buildings_id_fk')
  })
})

describe('auth_mail_log', () => {
  it('keeps the time each account email was sent', async () => {
    await t.db.insert(authMailLog).values({ email: 'lan@gmail.com', kind: 'confirm' })
    const [row] = await t.db.select().from(authMailLog)
    expect(row).toMatchObject({ email: 'lan@gmail.com', kind: 'confirm' })
    expect(row.sentAt).toBeInstanceOf(Date)
  })
})
