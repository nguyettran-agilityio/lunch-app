// @vitest-environment node
// The account rules of server/auth/accounts.ts on PGlite with a fake sign-in service
// (plan.md section 4): sign-up cases 1 to 4 of plan.md section 1.5, the 60-second wait per
// address, and the sign-in messages. The same flows run through the screens in e2e/.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authMailLog, profiles } from '@/server/db/schema'
import type { AuthProvider } from '@/server/auth/provider'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const { sendConfirmation, signIn, signUp } = await import('@/server/auth/accounts')

type FakeUser = { id: string; email: string; password: string; confirmed: boolean }

/** An in-memory sign-in service that records what it sends. */
function fakeAuth() {
  const users = new Map<string, FakeUser>()
  const sent: string[] = []
  let next = 1
  let limited = false
  const auth: AuthProvider = {
    getUser: async () => null,
    signOut: async () => {},
    async signUp(email, password) {
      if (limited) return { ok: false, error: 'rateLimited' }
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
      users.set(id, { id, email, password, confirmed: false })
      sent.push(email)
      return { ok: true, userId: id }
    },
    async resendConfirmation(email) {
      if (limited) return { ok: false, error: 'rateLimited' }
      sent.push(email)
      return { ok: true }
    },
    async signInWithPassword(email, password) {
      if (limited) return { ok: false, error: 'rateLimited' }
      const u = [...users.values()].find((x) => x.email === email)
      if (!u || u.password !== password) return { ok: false, error: 'invalidCredentials' }
      return u.confirmed ? { ok: true, userId: u.id } : { ok: false, error: 'notConfirmed' }
    },
    verifyLink: async () => ({ ok: false, error: 'invalidLink' }),
    exchangeCode: async () => ({ ok: false, error: 'invalidLink' }),
    isConfirmed: async (id) => users.get(id)?.confirmed ?? false,
    deleteUser: async (id) => void users.delete(id),
  }
  return { auth, users, sent, confirm: (id: string) => (users.get(id)!.confirmed = true), limit: () => (limited = true) }
}

let t: TestDb
let f: ReturnType<typeof fakeAuth>
const T0 = new Date('2026-11-26T03:00:00Z') // 10:00:00 in Vietnam
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const deps = (seconds = 0) => ({ db: t.db, auth: f.auth, at: at(seconds) })
const PW = 'abcdef12'

beforeEach(async () => {
  t = await createTestDb()
  f = fakeAuth()
})
afterEach(async () => {
  await t.close()
})

const profileOf = async (email: string) => (await t.db.select().from(profiles).where(eq(profiles.email, email)))[0]

async function confirmed(phone: string, email: string) {
  await signUp(deps(-3600), { phone, email, password: PW }, 'vi')
  f.confirm((await profileOf(email)).id)
}

async function google(phone: string, email: string) {
  await t.db.insert(profiles).values({ id: '00000000-0000-4000-8000-00000000aaaa', phone, email, method: 'google' })
}

describe('sign-up (plan.md section 1.5)', () => {
  it('P15 a new account: a waiting profile with phone, email and the language in use, its link sent at once', async () => {
    const r = await signUp(deps(), { phone: '0912 345 678', email: 'Lan@Gmail.com', password: PW }, 'en')
    expect(r).toEqual({ status: 'sent', sendAgain: { identifier: '0912345678', wait: 60 } })
    expect(await profileOf('lan@gmail.com')).toMatchObject({ phone: '0912345678', method: 'password', lang: 'en', name: null })
    expect(f.sent).toEqual(['lan@gmail.com'])
  })

  it('AC67 AC118 a repeated sign-up of one waiting account creates and sends nothing, and stores the language in use', async () => {
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    const r = await signUp(deps(20), { phone: '0905 111 222', email: 'huy@gmail.com', password: 'other123' }, 'en')
    expect(r).toEqual({ status: 'sent', sendAgain: { identifier: '0905111222', wait: 40 } })
    expect(f.sent).toHaveLength(1)
    expect(f.users.size).toBe(1)
    expect((await profileOf('huy@gmail.com')).lang).toBe('en')
  })

  it('AC114 the phone and the email of one confirmed account get both messages; nothing is created', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    const r = await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    expect(r).toEqual({ status: 'error', fields: { phone: 'phoneTaken', email: 'emailTakenPhone' } })
    expect(f.users.size).toBe(1)
  })

  it('AC115 a refused phone keeps the waiting account of the email, with nothing under the email', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    const r = await signUp(deps(), { phone: '0912345678', email: 'huy@gmail.com', password: PW }, 'vi')
    expect(r).toEqual({ status: 'error', fields: { phone: 'phoneTaken' } })
    expect(await profileOf('huy@gmail.com')).toBeDefined()
    expect(f.users.size).toBe(2)
  })

  it('AC50 AC83 a Google email, and a waiting phone with it: each field its message, "Send again" under the phone', async () => {
    await google('0938111222', 'minh@gmail.com')
    expect(await signUp(deps(), { phone: '0987654321', email: 'minh@gmail.com', password: PW }, 'vi')).toEqual({
      status: 'error',
      fields: { email: 'emailTakenGoogle' },
    })
    expect(await signUp(deps(), { phone: '0938111222', email: 'x@gmail.com', password: PW }, 'vi')).toEqual({
      status: 'error',
      fields: { phone: 'phoneTaken' },
    })
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    const r = await signUp(deps(30), { phone: '0905111222', email: 'minh@gmail.com', password: PW }, 'vi')
    expect(r).toEqual({
      status: 'error',
      fields: { phone: 'phoneWaiting', email: 'emailTakenGoogle' },
      sendAgain: { phone: { identifier: '0905111222', wait: 30 } },
    })
    expect(await profileOf('huy@gmail.com')).toBeDefined()
  })

  it('AC90 AC116 a waiting account matching one field is replaced, and the new link goes at once', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmial.com', password: PW }, 'vi')
    const old = (await profileOf('lan@gmial.com')).id
    const r = await signUp(deps(20), { phone: '0987654321', email: 'lan@gmial.com', password: PW }, 'vi')
    expect(r).toEqual({ status: 'sent', sendAgain: { identifier: '0987654321', wait: 60 } })
    expect(f.users.has(old)).toBe(false)
    expect((await profileOf('lan@gmial.com')).phone).toBe('0987654321')
    expect(f.sent).toEqual(['lan@gmial.com', 'lan@gmial.com'])
  })

  it('AC93 a phone of one waiting account and the email of another: both are replaced', async () => {
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmial.com', password: PW }, 'vi')
    await signUp(deps(), { phone: '0905111222', email: 'lan@gmial.com', password: PW }, 'vi')
    expect(await profileOf('huy@gmail.com')).toBeUndefined()
    expect((await profileOf('lan@gmial.com')).phone).toBe('0905111222')
    expect(f.users.size).toBe(1)
  })

  it("X13 an email waiting as another account's new email is refused at sign-up (sign-up part)", async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    await t.db.update(profiles).set({ pendingEmail: 'lan2@gmail.com' }).where(eq(profiles.email, 'lan@gmail.com'))
    expect(await signUp(deps(), { phone: '0987654321', email: 'lan2@gmail.com', password: PW }, 'vi')).toEqual({
      status: 'error',
      fields: { email: 'emailWaiting' },
    })
  })

  it('V5 a refusal by the service keeps the waiting account of the phone', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmial.com', password: PW }, 'vi')
    f.limit()
    expect(await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')).toMatchObject({
      notice: { code: 'tooMany' },
    })
    expect(await profileOf('lan@gmial.com')).toBeDefined()
    expect(f.users.size).toBe(1)
  })

  it('V5 the exception: a refusal after the waiting account of the email was deleted loses that account', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmial.com', password: PW }, 'vi')
    f.limit()
    expect(await signUp(deps(20), { phone: '0987654321', email: 'lan@gmial.com', password: PW }, 'vi')).toMatchObject({
      notice: { code: 'tooMany' },
    })
    expect(await profileOf('lan@gmial.com')).toBeUndefined()
    expect(f.users.size).toBe(0)
  })

  it('a failing delete of a waiting account changes nothing', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmial.com', password: PW }, 'vi')
    f.auth.deleteUser = async () => {
      throw new Error('service down')
    }
    await expect(signUp(deps(), { phone: '0987654321', email: 'lan@gmial.com', password: PW }, 'vi')).rejects.toThrow()
    expect(await profileOf('lan@gmial.com')).toBeDefined()
  })

  it('AC98 the service\'s limit gives "Too many attempts"', async () => {
    f.limit()
    expect(await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')).toEqual({
      status: 'error',
      fields: {},
      notice: { code: 'tooMany' },
    })
  })
})

describe('sending the confirmation link again (BR-29a)', () => {
  it('AC51 AC117 waits 60 seconds per address, then sends', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    expect(await sendConfirmation(deps(15), '0912 345 678')).toEqual({ status: 'wait', sendAgain: { identifier: '0912345678', wait: 45 } })
    expect(await sendConfirmation(deps(60), 'lan@gmail.com')).toEqual({
      status: 'sent',
      sendAgain: { identifier: 'lan@gmail.com', wait: 60 },
    })
    expect(f.sent).toHaveLength(2)
  })

  it('Y2 the wait counts per address, whatever kind of email went last', async () => {
    await t.db.insert(authMailLog).values({ email: 'lan@gmail.com', kind: 'reset', sentAt: at(0) })
    await t.db
      .insert(profiles)
      .values({ id: '00000000-0000-4000-8000-00000000bbbb', phone: '0912345678', email: 'lan@gmail.com', method: 'password' })
    expect(await sendConfirmation(deps(20), 'lan@gmail.com')).toMatchObject({ status: 'wait', sendAgain: { wait: 40 } })
  })

  it('AC99 a confirmed account, and no account', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    expect(await sendConfirmation(deps(), '0912345678')).toMatchObject({ notice: { code: 'alreadyConfirmed' } })
    expect(await sendConfirmation(deps(), 'old@gmail.com')).toMatchObject({ notice: { code: 'noAccount' } })
    expect(await sendConfirmation(deps(), '0281234567')).toEqual({ status: 'error', fields: { identifier: 'phoneInvalid' } })
  })
})

describe('sign-in (BR-29a)', () => {
  it('AC68 says which case it is', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    await google('0938111222', 'minh@gmail.com')
    expect(await signIn(deps(), { identifier: 'lan@gmail.com', password: 'wrong123' })).toMatchObject({ notice: { code: 'wrongPassword' } })
    expect(await signIn(deps(), { identifier: '0987654321', password: PW })).toMatchObject({ notice: { code: 'noAccount' } })
    expect(await signIn(deps(), { identifier: 'minh@gmail.com', password: PW })).toMatchObject({ notice: { code: 'googleAccount' } })
  })

  it('AC52 signs in with +84 and with the email', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    expect(await signIn(deps(), { identifier: '+84912345678', password: PW })).toMatchObject({ status: 'signedIn' })
    expect(await signIn(deps(), { identifier: 'LAN@gmail.com', password: PW })).toMatchObject({ status: 'signedIn' })
  })

  it('P8 an unconfirmed account with the right password: "not confirmed" with the seconds left (sign-in part)', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    expect(await signIn(deps(15), { identifier: '0912345678', password: PW })).toEqual({
      status: 'error',
      fields: {},
      notice: { code: 'notConfirmed', identifier: '0912345678', wait: 45 },
    })
    expect(await signIn(deps(15), { identifier: '0912345678', password: 'wrong123' })).toMatchObject({ notice: { code: 'wrongPassword' } })
  })
})
