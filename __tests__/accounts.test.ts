// @vitest-environment node
// The account rules of server/auth/accounts.ts on PGlite with a fake sign-in service
// (plan.md section 4): sign-up cases 1 to 4 of plan.md section 1.5, the 60-second wait per
// address, and the sign-in messages. The same flows run through the screens in e2e/.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authMailLog, buildings, profiles } from '@/server/db/schema'
import type { AuthProvider, GoogleUser } from '@/server/auth/provider'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const {
  confirmEmailChange,
  forgotPassword,
  googleSignIn,
  resetLinkRefusal,
  resetPassword,
  saveProfile,
  sendConfirmation,
  sendEmailChange,
  sendGoogleConfirmation,
  signIn,
  signUp,
} = await import('@/server/auth/accounts')

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
  // The service cannot send to these addresses (CN-74).
  const refused = new Set<string>()
  // Reset links by token hash, and the session held aside after a try refused for the old password.
  const resetLinks = new Map<string, { userId: string; used: boolean }>()
  const recoveredAt: Date[] = []
  let held: string | null = null
  const passwordless = new Set<string>()
  const changes: { userId: string; email: string }[] = []
  const cancels: string[] = []
  // Runs right after an email-change link is sent: a test makes another write happen there.
  const hooks: { afterChange?: (email: string) => Promise<void> } = {}
  const auth: AuthProvider = {
    getUser: async () => null,
    signOut: async () => void signOuts++,
    googleSignInUrl: async () => '/test/google',
    async sendRecovery(email, sentAt) {
      if (limited) return { ok: false, error: 'rateLimited' }
      if (refused.has(email)) return { ok: false, error: 'sendFailed' }
      recovered.push(email)
      recoveredAt.push(sentAt)
      return { ok: true }
    },
    async heldResetUser() {
      const u = held ? users.get(held) : undefined
      return u ? { id: u.id, email: u.email } : null
    },
    async resetPassword(link, password) {
      if (limited) return { ok: false, error: 'rateLimited' }
      let userId = held
      if (!userId) {
        const l = resetLinks.get(link.tokenHash)
        if (!l || l.used) return { ok: false, error: 'invalidLink' }
        l.used = true
        userId = l.userId
        held = userId
        // As Supabase's recoverVerify: using the link confirms the email.
        users.get(userId)!.confirmed = true
      }
      const u = users.get(userId)!
      if (u.password === password && !passwordless.has(userId)) return { ok: false, error: 'samePassword' }
      u.password = password
      passwordless.delete(userId)
      held = null
      return { ok: true, userId }
    },
    dropHeldReset: async () => void (held = null),
    hasPassword: async (id) => users.has(id) && !passwordless.has(id),
    exchangeGoogleCode: async () => googleAnswer,
    removeGoogleIdentity: async (userId, { unconfirm }) => {
      removed.push({ userId, unconfirm })
      const u = users.get(userId)
      if (u && unconfirm) u.confirmed = false
    },
    async signUp(email, password) {
      if (limited) return { ok: false, error: 'rateLimited' }
      if (refused.has(email)) return { ok: false, error: 'sendFailed' }
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
      users.set(id, { id, email, password, confirmed: false })
      sent.push(email)
      return { ok: true, userId: id }
    },
    async resendConfirmation(email) {
      if (limited) return { ok: false, error: 'rateLimited' }
      if (refused.has(email)) return { ok: false, error: 'sendFailed' }
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
    async changeEmail(userId, email) {
      if (limited) return { ok: false, error: 'rateLimited' }
      if (refused.has(email)) return { ok: false, error: 'sendFailed' }
      changes.push({ userId, email })
      await hooks.afterChange?.(email)
      return { ok: true }
    },
    cancelEmailChange: async (userId) => void cancels.push(userId),
  }
  return {
    auth,
    /** Email-change links sent, and changes taken back (CN-77). */
    changes,
    cancels,
    hooks,
    users,
    sent,
    removed,
    recovered,
    signOuts: () => signOuts,
    confirm: (id: string) => (users.get(id)!.confirmed = true),
    limit: () => (limited = true),
    unlimit: () => (limited = false),
    refuse: (email: string) => refused.add(email),
    recoveredAt,
    /** A reset link of the account, as the email would carry it. */
    resetLink: (userId: string, tokenHash: string) => resetLinks.set(tokenHash, { userId, used: false }),
    held: () => held,
    /** The service removed the password (CN-63). */
    dropPassword: (userId: string) => passwordless.add(userId),
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
    // The service dropped the password with the password identity.
    f.dropPassword(p.id)
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

describe('Forgot password (S-C1a, PR M1-4)', () => {
  it('AC56 A15 no account, then the email of a Google account: their messages, nothing sent', async () => {
    await google('0938111222', 'minh@gmail.com')
    expect(await forgotPassword(deps(), '0987000111')).toMatchObject({ notice: { code: 'noAccount' } })
    expect(await forgotPassword(deps(), 'minh@gmail.com')).toMatchObject({ notice: { code: 'googleAccount' } })
    expect(f.recovered).toEqual([])
  })

  it('AC143 N1 the phone number on a Google account profile: "This account signs in with Google", nothing sent', async () => {
    await google('0938111222', 'minh@gmail.com')
    expect(await forgotPassword(deps(), '0938 111 222')).toMatchObject({ notice: { code: 'googleAccount' } })
    expect(f.recovered).toEqual([])
  })

  it('AC69 P8 AC148 N6 an account not confirmed: "not confirmed" with the seconds left, no reset link', async () => {
    await signUp(deps(-20), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    expect(await forgotPassword(deps(), '0905111222')).toEqual({
      status: 'error',
      fields: {},
      notice: { code: 'notConfirmed', identifier: '0905111222', wait: 40 },
    })
    expect(f.recovered).toEqual([])
  })

  it('AC145 N3 an account that needs a password: "not confirmed"; only its button sends the link that sets the password', async () => {
    await signUp(deps(-120), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    await t.db.update(profiles).set({ needsPassword: true }).where(eq(profiles.email, 'lan@gmail.com'))
    expect(await forgotPassword(deps(), '0912345678')).toMatchObject({ notice: { code: 'notConfirmed', identifier: '0912345678' } })
    expect(f.recovered).toEqual([])
    expect(await sendConfirmation(deps(), '0912345678')).toMatchObject({ status: 'sent' })
    expect(f.recovered).toEqual(['lan@gmail.com'])
  })

  it('AC20 A16 AC144 N2 a confirmed account: a reset link sent at the time the app logs, then the 60-second wait', async () => {
    await confirmed('0905111222', 'huy@gmail.com')
    expect(await forgotPassword(deps(), '0905111222')).toEqual({ status: 'sent', sendAgain: { identifier: '0905111222', wait: 60 } })
    expect(f.recovered).toEqual(['huy@gmail.com'])
    const [log] = await t.db.select().from(authMailLog).where(eq(authMailLog.kind, 'reset'))
    expect(log.sentAt.getTime()).toBe(f.recoveredAt[0].getTime())
    expect(await forgotPassword(deps(30), 'huy@gmail.com')).toEqual({
      status: 'wait',
      sendAgain: { identifier: 'huy@gmail.com', wait: 30 },
    })
    expect(await forgotPassword(deps(60), 'huy@gmail.com')).toMatchObject({ status: 'sent' })
    expect(f.recovered).toHaveLength(2)
  })

  it('AC113 Y2 a reset link 20 seconds after a confirmation link to the same address: nothing sent until 60 seconds', async () => {
    await signUp(deps(0), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    f.confirm((await profileOf('lan@gmail.com')).id)
    expect(await forgotPassword(deps(20), 'lan@gmail.com')).toEqual({
      status: 'wait',
      sendAgain: { identifier: 'lan@gmail.com', wait: 40 },
    })
    expect(f.recovered).toEqual([])
  })

  it('AC98 A16 the limit of the service gives "Too many attempts"', async () => {
    await confirmed('0905111222', 'huy@gmail.com')
    f.limit()
    expect(await forgotPassword(deps(), '0905111222')).toMatchObject({ notice: { code: 'tooMany' } })
  })

  it('AC156 N14 N16 an address the service cannot send to: "Could not send the email", nothing created, no wait started', async () => {
    f.refuse('huy@gmail.com')
    expect(await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')).toMatchObject({
      notice: { code: 'sendFailed' },
    })
    expect(await profileOf('huy@gmail.com')).toBeUndefined()
    await confirmed('0912345678', 'lan@gmail.com')
    f.refuse('lan@gmail.com')
    expect(await forgotPassword(deps(), 'lan@gmail.com')).toMatchObject({ notice: { code: 'sendFailed' } })
    await signUp(deps(-120), { phone: '0987654321', email: 'an@gmail.com', password: PW }, 'vi')
    f.refuse('an@gmail.com')
    expect(await sendConfirmation(deps(), 'an@gmail.com')).toMatchObject({ notice: { code: 'sendFailed' } })
    expect(await t.db.select().from(authMailLog).where(eq(authMailLog.kind, 'reset'))).toEqual([])
  })
})

describe('saving a new password on /auth/reset (PR M1-4)', () => {
  const link = (sent: number, tokenHash = 'tok-1') => ({ tokenHash, sent })

  /** Lan, confirmed with PW, asked for a reset link at `seconds`; returns its link. */
  async function lanWithLink(seconds = 0, tokenHash = 'tok-1') {
    await confirmed('0912345678', 'lan@gmail.com')
    const p = await profileOf('lan@gmail.com')
    expect(await forgotPassword(deps(seconds), 'lan@gmail.com')).toMatchObject({ status: 'sent' })
    f.resetLink(p.id, tokenHash)
    return { p, l: link(at(seconds).getTime(), tokenHash) }
  }

  it('AC53 A10 the password rule comes first, under the field', async () => {
    const { l } = await lanWithLink()
    expect(await resetPassword(deps(), l, '')).toMatchObject({ fields: { password: 'required' } })
    for (const pw of ['abc12', 'abcdefgh'])
      expect(await resetPassword(deps(), l, pw)).toMatchObject({ fields: { password: 'passwordRule' } })
    expect(await resetPassword(deps(), l, 'abcdef34')).toMatchObject({ status: 'saved' })
  })

  it('AC147 N5 no link kept: the expired page', async () => {
    expect(await resetPassword(deps(), null, 'abcdef34')).toEqual({ status: 'invalidLink' })
  })

  it('AC161 N20 a link replaced by a newer reset email comes before the password rule, with no session held', async () => {
    const { l } = await lanWithLink(0, 'tok-3')
    expect(await forgotPassword(deps(61), 'lan@gmail.com')).toMatchObject({ status: 'sent' })
    expect(f.held()).toBeNull()
    expect(await resetPassword(deps(70), l, 'abc')).toEqual({ status: 'invalidLink' })
    expect(f.recovered).toHaveLength(2)
  })

  it('AC159 N18 an expired or saved link comes before the password rule', async () => {
    const { l } = await lanWithLink()
    expect(await resetPassword(deps(3601), l, 'abc')).toEqual({ status: 'invalidLink' })
    expect(await resetPassword(deps(10), l, 'abcdef34')).toMatchObject({ status: 'saved' })
    expect(await resetPassword(deps(20), l, 'abc')).toEqual({ status: 'invalidLink' })
  })

  it('AC20 AC149 N7 saving uses the link and records it, so the saved link is refused when tapped again', async () => {
    const { p, l } = await lanWithLink()
    expect(await resetLinkRefusal(t.db, l, at(300))).toBeNull()
    const saved = await resetPassword(deps(300), l, 'abcdef34')
    expect(saved).toMatchObject({ status: 'saved', profile: { id: p.id } })
    expect(f.users.get(p.id)!.password).toBe('abcdef34')
    expect(await resetLinkRefusal(t.db, l, at(310))).toBe('invalidLink')
    expect(await resetPassword(deps(310), l, 'abcdef56')).toEqual({ status: 'invalidLink' })
  })

  it('AC153 N11 a link past its hour by the clock, and a link replaced by a newer one while a session is held', async () => {
    const { l } = await lanWithLink(0, 'tok-1')
    expect(await resetLinkRefusal(t.db, l, at(3601))).toBe('invalidLink')
    expect(await resetPassword(deps(3601), l, 'abcdef34')).toEqual({ status: 'invalidLink' })
    // A try refused for the old password holds the session of L1; then L2 is sent.
    expect(await resetPassword(deps(10), l, PW)).toMatchObject({ fields: { password: 'samePassword' } })
    expect(f.held()).not.toBeNull()
    expect(await forgotPassword(deps(100), 'lan@gmail.com')).toMatchObject({ status: 'sent' })
    expect(await resetPassword(deps(110), l, 'abcdef34')).toEqual({ status: 'invalidLink' })
    // A <sent> changed by hand is refused the same way.
    expect(await resetPassword(deps(110), link(at(5000).getTime()), 'abcdef34')).toEqual({ status: 'invalidLink' })
  })

  it('AC150 AC158 N8 N17 a password equal to the old one: refused under the field; the held session saves the next try', async () => {
    const { p, l } = await lanWithLink()
    expect(await resetPassword(deps(10), l, PW)).toEqual({ status: 'error', fields: { password: 'samePassword' } })
    expect(f.users.get(p.id)!.password).toBe(PW)
    expect(await resetPassword(deps(20), l, 'abcdef34')).toMatchObject({ status: 'saved' })
    expect(f.users.get(p.id)!.password).toBe('abcdef34')
  })

  it('AC94 AC146 W3 N4 an account that needed a password: the link confirms it only by saving; the mark goes and so does Google', async () => {
    await signUp(deps(-120), { phone: '0912345678', email: 'lan@gmail.com', password: PW }, 'vi')
    const p = await profileOf('lan@gmail.com')
    await t.db.update(profiles).set({ needsPassword: true }).where(eq(profiles.id, p.id))
    f.dropPassword(p.id)
    expect(await sendConfirmation(deps(), '0912345678')).toMatchObject({ status: 'sent' })
    f.resetLink(p.id, 'tok-63')
    // Leaving the page before saving changes nothing.
    expect(await signIn(deps(30), { identifier: '0912345678', password: 'abc12345' })).toMatchObject({ notice: { code: 'notConfirmed' } })
    const saved = await resetPassword(deps(60), link(at(0).getTime(), 'tok-63'), 'abcdef34')
    expect(saved).toMatchObject({ status: 'saved', profile: { needsPassword: false, phone: '0912345678' } })
    expect((await profileOf('lan@gmail.com')).needsPassword).toBe(false)
    expect(f.removed).toEqual([{ userId: p.id, unconfirm: false }])
    expect(await signIn(deps(70), { identifier: '0912345678', password: 'abcdef34' })).toMatchObject({ status: 'signedIn' })
  })

  it('AC154 N12 Google with the email of that account after its reset: the AC49 sentence, the Google identity taken off again', async () => {
    await confirmed('0912345678', 'lan@gmail.com')
    const p = await profileOf('lan@gmail.com')
    f.google(gUser(p.id, 'lan@gmail.com', [GOOGLE]))
    expect(await googleSignIn(deps(), 'c1', 'vi')).toEqual({ status: 'refused', code: 'googleTakenPhone' })
    expect(f.removed).toEqual([{ userId: p.id, unconfirm: false }])
    expect((await profileOf('lan@gmail.com')).needsPassword).toBe(false)
  })
})

// Test names give AC and scenario ids, not CN-77 or CN-78, which many criteria cite (X7).
describe('the profile, S-C2 (BR-29a)', () => {
  const B1 = '00000000-0000-4000-8000-0000000000b1'
  const B2 = '00000000-0000-4000-8000-0000000000b2'

  // Lan, confirmed, with a complete profile on an approved building; `pending` waits as her new email.
  async function lan(pending?: string) {
    await t.db.insert(buildings).values({ id: B1, name: 'Tòa A', state: 'approved' })
    await confirmed('0912345678', 'lan@gmail.com')
    const p = await profileOf('lan@gmail.com')
    await t.db
      .update(profiles)
      .set({ name: 'Lan', buildingId: B1, pendingEmail: pending ?? null })
      .where(eq(profiles.id, p.id))
    return p.id
  }
  const input = (over: Partial<{ name: string; phone: string; email: string; buildingId: string }> = {}) => ({
    name: 'Lan',
    phone: '0912 345 678',
    email: 'lan@gmail.com',
    buildingId: B1,
    ...over,
  })

  it('AC177 K7 a new email: saved, the link sent to it only, logged for the 60-second wait', async () => {
    const id = await lan()
    expect(await saveProfile(deps(), id, input({ email: 'Lan2@Gmail.com' }))).toEqual({ status: 'saved', wasComplete: true })
    expect(f.changes).toEqual([{ userId: id, email: 'lan2@gmail.com' }])
    expect(await profileOf('lan@gmail.com')).toMatchObject({ pendingEmail: 'lan2@gmail.com' })
    const log = await t.db.select().from(authMailLog).where(eq(authMailLog.email, 'lan2@gmail.com'))
    expect(log.map((r) => r.kind)).toEqual(['change'])
  })

  it('AC178 K8 one refused field saves nothing and sends nothing; an email that cannot be sent too', async () => {
    const id = await lan()
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    const r = await saveProfile(deps(), id, input({ name: 'Lan Trần', phone: '0905111222', email: 'lan2@gmail.com' }))
    expect(r).toEqual({ status: 'error', fields: { phone: 'phoneWaiting' } })
    expect(f.changes).toEqual([])
    expect(await profileOf('lan@gmail.com')).toMatchObject({ name: 'Lan', pendingEmail: null })
    f.refuse('lan2@gmail.com')
    expect(await saveProfile(deps(), id, input({ name: 'Lan Trần', email: 'lan2@gmail.com' }))).toEqual({
      status: 'error',
      fields: {},
      notice: { code: 'sendFailed' },
    })
    expect(await profileOf('lan@gmail.com')).toMatchObject({ name: 'Lan', pendingEmail: null })
  })

  it('AC175 AC184 K5 K14 the own email typed again: no change; with a new email waiting, it is cancelled', async () => {
    const id = await lan()
    expect(await saveProfile(deps(), id, input())).toEqual({ status: 'saved', wasComplete: true })
    expect(f.changes).toEqual([])
    expect(f.cancels).toEqual([])
    await t.db.update(profiles).set({ pendingEmail: 'lan2@gmail.com' }).where(eq(profiles.id, id))
    expect(await saveProfile(deps(), id, input())).toEqual({ status: 'saved', wasComplete: true })
    expect(f.cancels).toEqual([id])
    expect((await profileOf('lan@gmail.com')).pendingEmail).toBeNull()
  })

  it('AC176 AC191 K6 K21 the waiting email typed again (the field as it was prefilled) sends nothing; the name is saved', async () => {
    const id = await lan('lan2@gmail.com')
    expect(await saveProfile(deps(), id, input({ name: 'Lan Trần', email: 'lan2@gmail.com' }))).toEqual({
      status: 'saved',
      wasComplete: true,
    })
    expect(f.changes).toEqual([])
    expect(await profileOf('lan@gmail.com')).toMatchObject({ name: 'Lan Trần', pendingEmail: 'lan2@gmail.com' })
  })

  it('AC185 K15 a new email within its 60-second wait, or past the limit, saves nothing', async () => {
    const id = await lan()
    await saveProfile(deps(0), id, input({ email: 'lan2@gmail.com' }))
    await saveProfile(deps(20), id, input({ email: 'lan3@gmail.com' }))
    expect(await saveProfile(deps(40), id, input({ name: 'Lan Trần', email: 'lan2@gmail.com' }))).toEqual({
      status: 'error',
      fields: {},
      emailWait: 20,
    })
    expect(await profileOf('lan@gmail.com')).toMatchObject({ name: 'Lan', pendingEmail: 'lan3@gmail.com' })
    f.limit()
    expect(await saveProfile(deps(200), id, input({ email: 'lan4@gmail.com' }))).toEqual({ status: 'error', fields: { email: 'tooMany' } })
    expect((await profileOf('lan@gmail.com')).pendingEmail).toBe('lan3@gmail.com')
  })

  it('AC54 AC70 AC101 AC106 the emails refused on the profile', async () => {
    const id = await lan()
    await confirmed('0977000111', 'minh@gmail.com')
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    vi.stubEnv('SHOP_EMAILS', 'shop@comla.vn')
    try {
      expect(await saveProfile(deps(), id, input({ email: 'minh@gmail.com' }))).toMatchObject({ fields: { email: 'emailTaken' } })
      expect(await saveProfile(deps(), id, input({ email: 'huy@gmail.com' }))).toMatchObject({ fields: { email: 'emailWaiting' } })
      expect(await saveProfile(deps(), id, input({ email: 'shop@comla.vn' }))).toMatchObject({ fields: { email: 'emailShop' } })
      expect(await saveProfile(deps(), id, input({ email: 'lan@' }))).toMatchObject({ fields: { email: 'emailInvalid' } })
    } finally {
      vi.unstubAllEnvs()
    }
    // A new email waiting for Lan is taken for everyone else (CN-65).
    await saveProfile(deps(), id, input({ email: 'lan2@gmail.com' }))
    const minh = (await profileOf('minh@gmail.com')).id
    await t.db.update(profiles).set({ name: 'Minh', buildingId: B1 }).where(eq(profiles.id, minh))
    expect(await saveProfile(deps(), minh, input({ name: 'Minh', phone: '0977000111', email: 'lan2@gmail.com' }))).toMatchObject({
      fields: { email: 'emailWaiting' },
    })
    expect(f.changes).toEqual([{ userId: id, email: 'lan2@gmail.com' }])
  })

  it('AC54 AC92 the phone: a free one saved, one of a confirmed account or of a waiting one refused', async () => {
    const id = await lan()
    await confirmed('0977000111', 'minh@gmail.com')
    await signUp(deps(), { phone: '0905111222', email: 'huy@gmail.com', password: PW }, 'vi')
    expect(await saveProfile(deps(), id, input({ phone: '0977000111' }))).toMatchObject({ fields: { phone: 'phoneTaken' } })
    expect(await saveProfile(deps(), id, input({ phone: '0905 111 222' }))).toMatchObject({ fields: { phone: 'phoneWaiting' } })
    expect(await saveProfile(deps(), id, input({ phone: '+84 938 000 999' }))).toMatchObject({ status: 'saved' })
    expect((await profileOf('lan@gmail.com')).phone).toBe('0938000999')
  })

  it('AC103 the name: required, at most 80 characters; a Google account keeps its email', async () => {
    const id = await lan()
    expect(await saveProfile(deps(), id, input({ name: '  ' }))).toMatchObject({ fields: { name: 'required' } })
    expect(await saveProfile(deps(), id, input({ name: 'a'.repeat(81) }))).toMatchObject({ fields: { name: 'nameTooLong' } })
    expect(await saveProfile(deps(), id, input({ name: ` ${'a'.repeat(80)} ` }))).toMatchObject({ status: 'saved' })
    await google('0938111222', 'g@gmail.com')
    const g = (await profileOf('g@gmail.com')).id
    expect(await saveProfile(deps(), g, input({ name: 'G', phone: '0938111222', email: 'other@gmail.com' }))).toEqual({
      status: 'saved',
      wasComplete: false,
    })
    expect(await profileOf('g@gmail.com')).toMatchObject({ name: 'G', pendingEmail: null })
    expect(f.changes).toEqual([])
  })

  it('AC188 AC190 K18 K20 a declined building cannot be saved; another one completes the profile, with a new email', async () => {
    const id = await lan()
    await t.db.insert(buildings).values({ id: B2, name: 'Tòa ABC', state: 'declined', proposedBy: id })
    await t.db.update(profiles).set({ buildingId: B2 }).where(eq(profiles.id, id))
    expect(await saveProfile(deps(), id, input({ buildingId: B2 }))).toMatchObject({ fields: { buildingId: 'required' } })
    expect(await saveProfile(deps(), id, input({ buildingId: '' }))).toMatchObject({ fields: { buildingId: 'required' } })
    expect(await saveProfile(deps(), id, input({ email: 'lan2@gmail.com' }))).toEqual({ status: 'saved', wasComplete: false })
    expect(await profileOf('lan@gmail.com')).toMatchObject({ buildingId: B1, pendingEmail: 'lan2@gmail.com' })
  })

  it('AC173 AC186 K3 K16 "Send again" and "Send a new link": to the address waiting now, after its wait', async () => {
    const id = await lan()
    expect(await sendEmailChange(deps(), id)).toEqual({ status: 'error', fields: {}, notice: { code: 'noPendingEmail' } })
    await saveProfile(deps(0), id, input({ email: 'lan2@gmail.com' }))
    expect(await sendEmailChange(deps(10), id)).toEqual({ status: 'wait', sendAgain: { identifier: 'lan2@gmail.com', wait: 50 } })
    await saveProfile(deps(70), id, input({ email: 'lan3@gmail.com' }))
    expect(await sendEmailChange(deps(140), id)).toEqual({ status: 'sent', sendAgain: { identifier: 'lan3@gmail.com', wait: 60 } })
    expect(f.changes.map((c) => c.email)).toEqual(['lan2@gmail.com', 'lan3@gmail.com', 'lan3@gmail.com'])
  })

  it('K8 the write failing after the link was sent: the change is taken back and nothing is saved', async () => {
    const id = await lan()
    // Another account takes the address between the checks and the write. PGlite has one
    // connection, so here the transaction runs on it directly and that write can happen meanwhile.
    f.hooks.afterChange = async (email) => {
      await t.db
        .insert(profiles)
        .values({ id: '00000000-0000-4000-8000-00000000bbbb', email: 'minh@gmail.com', pendingEmail: email, method: 'password' })
    }
    const direct: typeof t.db = Object.assign(Object.create(t.db), { transaction: (run: (tx: typeof t.db) => unknown) => run(direct) })
    expect(await saveProfile({ ...deps(), db: direct }, id, input({ name: 'Lan Trần', email: 'lan2@gmail.com' }))).toEqual({
      status: 'error',
      fields: { email: 'emailWaiting' },
    })
    expect(f.cancels).toEqual([id])
    expect(await profileOf('lan@gmail.com')).toMatchObject({ name: 'Lan', pendingEmail: null })
    // The email did go out, so its 60-second wait is kept (CN-67).
    const log = await t.db.select().from(authMailLog).where(eq(authMailLog.email, 'lan2@gmail.com'))
    expect(log.map((r) => r.kind)).toEqual(['change'])
  })

  it('AC101 AC106 the address taken in between: "waiting" for a waiting account, "already has an account" for a confirmed one', async () => {
    const id = await lan()
    const direct: typeof t.db = Object.assign(Object.create(t.db), { transaction: (run: (tx: typeof t.db) => unknown) => run(direct) })
    for (const [n, confirmedNow, field] of [
      [1, false, 'emailWaiting'],
      [2, true, 'emailTaken'],
    ] as const) {
      const other = `00000000-0000-4000-8000-00000000cc0${n}`
      const email = `taken${n}@gmail.com`
      f.hooks.afterChange = async () => {
        await t.db.insert(profiles).values({ id: other, email, method: 'password' })
        f.users.set(other, { id: other, email, password: PW, confirmed: confirmedNow })
      }
      expect(await saveProfile({ ...deps(n * 100), db: direct }, id, input({ email }))).toEqual({
        status: 'error',
        fields: { email: field },
      })
    }
  })

  it('AC175 K5 a cancel whose write is refused leaves the waiting email and its link as they were', async () => {
    const id = await lan('lan2@gmail.com')
    await confirmed('0977000111', 'minh@gmail.com')
    // The phone is free at the check, then taken before the write.
    f.hooks.afterChange = undefined
    const direct: typeof t.db = Object.assign(Object.create(t.db), {
      transaction: async (run: (tx: typeof t.db) => unknown) => {
        if (!(direct as { checked?: boolean }).checked) {
          ;(direct as { checked?: boolean }).checked = true
          return run(direct)
        }
        await t.db.update(profiles).set({ phone: '0938000999' }).where(eq(profiles.email, 'minh@gmail.com'))
        return run(direct)
      },
    })
    expect(await saveProfile({ ...deps(), db: direct }, id, input({ phone: '0938000999' }))).toEqual({
      status: 'error',
      fields: { phone: 'phoneTaken' },
    })
    expect(f.cancels).toEqual([])
    expect((await profileOf('lan@gmail.com')).pendingEmail).toBe('lan2@gmail.com')
  })

  it("AC179 K9 the link used: the new email is the account's and nothing waits", async () => {
    const id = await lan('lan2@gmail.com')
    await confirmEmailChange(t.db, id, 'Lan2@gmail.com')
    expect(await profileOf('lan2@gmail.com')).toMatchObject({ id, pendingEmail: null })
  })
})
