// @vitest-environment node
// The account rules of server/auth/accounts.ts on PGlite with a fake sign-in service
// (plan.md section 4): sign-up cases 1 to 4 of plan.md section 1.5, the 60-second wait per
// address, and the sign-in messages. The same flows run through the screens in e2e/.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authMailLog, profiles } from '@/server/db/schema'
import type { AuthProvider, GoogleUser } from '@/server/auth/provider'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const { googleSignIn, sendConfirmation, sendGoogleConfirmation, signIn, signUp } = await import('@/server/auth/accounts')

type FakeUser = { id: string; email: string; password: string; confirmed: boolean }

/** An in-memory sign-in service that records what it sends. */
function fakeAuth() {
  const users = new Map<string, FakeUser>()
  const sent: string[] = []
  const removed: { userId: string; unconfirm: boolean }[] = []
  const recovered: string[] = []
  let signOuts = 0
  let googleAnswer: Awaited<ReturnType<AuthProvider['exchangeGoogleCode']>> = { ok: false, error: 'failed' }
  let next = 1
  let limited = false
  const auth: AuthProvider = {
    getUser: async () => null,
    signOut: async () => void signOuts++,
    googleSignInUrl: async () => '/test/google',
    async sendRecovery(email) {
      if (limited) return { ok: false, error: 'rateLimited' }
      recovered.push(email)
      return { ok: true }
    },
    exchangeGoogleCode: async () => googleAnswer,
    removeGoogleIdentity: async (userId, { unconfirm }) => {
      removed.push({ userId, unconfirm })
      const u = users.get(userId)
      if (u && unconfirm) u.confirmed = false
    },
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
  return {
    auth,
    users,
    sent,
    removed,
    recovered,
    signOuts: () => signOuts,
    confirm: (id: string) => (users.get(id)!.confirmed = true),
    limit: () => (limited = true),
    /** What the next Google code signs in as. */
    google: (user: GoogleUser | null) => (googleAnswer = user ? { ok: true, user } : { ok: false, error: 'failed' }),
  }
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

// The test names give AC ids, not CN-72: CN-72 is cited by many criteria (X7).
describe('sign-in with the phone or email of a Google account', () => {
  it('AC127 the phone number on a Google account profile gets "This account signs in with Google"', async () => {
    await google('0938111222', 'minh@gmail.com')
    expect(await signIn(deps(), { identifier: '0938111222', password: PW })).toMatchObject({ notice: { code: 'googleAccount' } })
  })

  it('AC126 a Google account email on the expired sign-up link page gets the same message, nothing sent', async () => {
    await google('0938111222', 'minh@gmail.com')
    expect(await sendConfirmation(deps(), 'minh@gmail.com')).toMatchObject({ notice: { code: 'googleAccount' } })
    expect(f.sent).toEqual([])
  })
})

const gUser = (id: string, email: string, identities: GoogleUser['identities'], name: string | null = 'Minh Trần'): GoogleUser => ({
  id,
  email,
  name,
  identities,
})
const GOOGLE = { provider: 'google', verified: true } as const
const uid = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`

describe('the Google callback: the linking guard and a first Google sign-in (plan.md section 1.5)', () => {
  it('AC49 A1 a confirmed phone account joined by automatic linking: the Google identity is taken off, signed out, nothing joined', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    const p = await profileOf('lan@gmail.com')
    f.google(gUser(p.id, 'lan@gmail.com', [{ provider: 'email', verified: true }, GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleTakenPhone' })
    expect(f.removed).toEqual([{ userId: p.id, unconfirm: false }])
    expect(f.signOuts()).toBe(1)
    expect(await profileOf('lan@gmail.com')).toMatchObject({ method: 'password', needsPassword: false })
  })

  it('AC91 V6 B63 a waiting phone account joined by linking: "not confirmed", its confirmation time cleared, its password kept', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const p = await profileOf('lan@gmail.com')
    f.confirm(p.id) // the Google sign-in set the confirmation time
    f.google(gUser(p.id, 'lan@gmail.com', [{ provider: 'email', verified: false }, GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleNotConfirmed', email: 'lan@gmail.com' })
    expect(f.removed).toEqual([{ userId: p.id, unconfirm: true }])
    expect(f.users.get(p.id)!.confirmed).toBe(false)
    expect(await profileOf('lan@gmail.com')).toMatchObject({ needsPassword: false })
  })

  it('a waiting account left with only the Google identity (password dropped): kept, signed out, its profile needs a password', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const p = await profileOf('lan@gmail.com')
    f.google(gUser(p.id, 'lan@gmail.com', [GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toMatchObject({ status: 'refused', code: 'googleNotConfirmed' })
    expect(f.users.has(p.id)).toBe(true)
    expect(f.signOuts()).toBe(1)
    expect(await profileOf('lan@gmail.com')).toMatchObject({ needsPassword: true, phone: '0912345678' })
  })

  it('another auth user made for the email of a waiting account: that user is deleted, the waiting account stays', async () => {
    await signUp(deps(), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const p = await profileOf('lan@gmail.com')
    f.users.set(uid(1), { id: uid(1), email: 'lan@gmail.com', password: '', confirmed: true })
    f.google(gUser(uid(1), 'lan@gmail.com', [GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toMatchObject({ status: 'refused', code: 'googleNotConfirmed' })
    expect(f.users.has(uid(1))).toBe(false)
    expect(f.users.has(p.id)).toBe(true)
  })

  it('X17 Z5 an email waiting as another account new email: no account, the new user deleted, for Huy and Lan alike', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    await t.db.update(profiles).set({ pendingEmail: 'lan2@gmail.com' }).where(eq(profiles.email, 'lan@gmail.com'))
    for (const id of [uid(2), uid(3)]) {
      f.users.set(id, { id, email: 'lan2@gmail.com', password: '', confirmed: true })
      f.google(gUser(id, 'lan2@gmail.com', [GOOGLE]))
      expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleWaiting' })
      expect(f.users.has(id)).toBe(false)
    }
    expect(await profileOf('lan2@gmail.com')).toBeUndefined()
    expect(await profileOf('lan@gmail.com')).toMatchObject({ pendingEmail: 'lan2@gmail.com' })
  })

  it('AC131 a first Google sign-in: a Google profile with the Google name and the language in use; the next one signs in to it', async () => {
    f.google(gUser(uid(4), 'Minh@Gmail.com', [GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'en')).toMatchObject({
      status: 'signedIn',
      profile: { email: 'minh@gmail.com', method: 'google', name: 'Minh Trần', lang: 'en', phone: null },
    })
    expect(await googleSignIn(deps(), 'c2', 'vi')).toMatchObject({ status: 'signedIn', profile: { lang: 'en' } })
  })

  it('AC135 Z12 an empty or blank Google name is not stored; spaces are trimmed, then the name is cut to 80 characters', async () => {
    const long = 'Nguyễn'.repeat(15) // 90 characters
    const cases: [string, string | null, string | null][] = [
      ['an@gmail.com', null, null],
      ['binh@gmail.com', '   ', null],
      ['minh@gmail.com', `  ${long}`, Array.from(long).slice(0, 80).join('')],
    ]
    for (const [i, [email, name, stored]] of cases.entries()) {
      f.google(gUser(uid(10 + i), email, [GOOGLE], name))
      await googleSignIn(deps(), 'c', 'vi')
      expect((await profileOf(email)).name).toBe(stored)
    }
  })

  it('AC133 no code, or a code that does not sign in: "Could not sign in with Google"', async () => {
    expect(await googleSignIn(deps(), null, 'vi')).toEqual({ status: 'refused', code: 'googleFailed' })
    f.google(null)
    expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleFailed' })
  })

  it('AC134 Z11 "Send the confirmation link again" after an AC91 refusal: within 1 hour it sends, later or without the kept email not', async () => {
    await signUp(deps(-120), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const kept = { email: 'lan@gmail.com', at: at(0).getTime() }
    expect(await sendGoogleConfirmation(deps(10), kept)).toMatchObject({ status: 'sent' })
    expect(f.sent).toEqual(['lan@gmail.com', 'lan@gmail.com'])
    expect(await sendGoogleConfirmation(deps(3661), kept)).toMatchObject({ notice: { code: 'googleFailed' } })
    expect(await sendGoogleConfirmation(deps(10), null)).toMatchObject({ notice: { code: 'googleFailed' } })
    expect(f.sent).toHaveLength(2)
  })

  it('AC136 Z13 a waiting account whose password was removed: "not confirmed" for any password, the button sends the recovery link', async () => {
    await signUp(deps(-120), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    await t.db.update(profiles).set({ needsPassword: true }).where(eq(profiles.email, 'lan@gmail.com'))
    for (const password of [PW, 'abc12345'])
      expect(await signIn(deps(), { identifier: '0912345678', password })).toEqual({
        status: 'error',
        fields: {},
        notice: { code: 'notConfirmed', identifier: '0912345678', wait: 0 },
      })
    expect(await signIn(deps(), { identifier: 'lan@gmail.com', password: 'abc12345' })).toMatchObject({ notice: { code: 'notConfirmed' } })
    expect(await sendConfirmation(deps(), '0912345678')).toMatchObject({ status: 'sent' })
    expect(f.recovered).toEqual(['lan@gmail.com'])
    expect(f.sent).toEqual(['lan@gmail.com']) // only the sign-up's own link
    const [log] = await t.db.select().from(authMailLog).where(eq(authMailLog.kind, 'reset'))
    expect(log).toMatchObject({ email: 'lan@gmail.com' })
  })

  it('AC137 Z14 the AC91 button after the account was confirmed: "already confirmed", nothing sent', async () => {
    await signUp(deps(-120), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    f.confirm((await profileOf('lan@gmail.com')).id)
    expect(await sendGoogleConfirmation(deps(), { email: 'lan@gmail.com', at: at(-10).getTime() })).toMatchObject({
      notice: { code: 'alreadyConfirmed' },
    })
    expect(f.sent).toEqual(['lan@gmail.com']) // only the sign-up's own link
  })

  it('AC139 Z16 the AC91 button after the email became a Google account: "This account signs in with Google", nothing sent', async () => {
    await google('0938111222', 'lan@gmail.com')
    expect(await sendGoogleConfirmation(deps(), { email: 'lan@gmail.com', at: at(-10).getTime() })).toMatchObject({
      notice: { code: 'googleAccount' },
    })
    expect(f.sent).toEqual([])
  })

  it('AC140 Z17 Google with the email of an email + password shop account: the AC49 sentence, nothing joined', async () => {
    await t.db.insert(profiles).values({ id: uid(20), email: 'shop@comla.vn', method: 'password' })
    f.users.set(uid(20), { id: uid(20), email: 'shop@comla.vn', password: PW, confirmed: true })
    f.google(gUser(uid(20), 'shop@comla.vn', [{ provider: 'email', verified: true }, GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleTakenPhone' })
    expect(f.removed).toEqual([{ userId: uid(20), unconfirm: false }])
  })

  it('AC138 Z15 the AC91 button after a new sign-up replaced the waiting account: the link goes to the account waiting now', async () => {
    await signUp(deps(-300), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const old = await profileOf('lan@gmail.com')
    await signUp(deps(-120), { phone: '0987654321', email: 'lan@gmail.com', password: PW }, 'vi')
    const now = await profileOf('lan@gmail.com')
    expect(now.id).not.toBe(old.id)
    expect(await sendGoogleConfirmation(deps(), { email: 'lan@gmail.com', at: at(-200).getTime() })).toMatchObject({ status: 'sent' })
    expect(f.sent).toEqual(['lan@gmail.com', 'lan@gmail.com', 'lan@gmail.com'])
    expect(now.phone).toBe('0987654321')
  })
})
