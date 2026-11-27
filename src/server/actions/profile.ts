'use server'
// Server Actions of the profile, S-C2 (plan.md section 1.3 and the M1-5 plan): thin wrappers
// that check the session (a customer only, BR-15) and call the rules of `server/auth/accounts.ts`
// and `domain/logic.ts`.
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { afterSignIn } from '@/domain/account'
import * as logic from '@/domain/logic'
import * as accounts from '@/server/auth/accounts'
import { getAuthProvider } from '@/server/auth/provider'
import { now } from '@/server/clock'
import { getDb, inTransaction } from '@/server/db/client'
import { loadProfileState } from '@/server/load'
import { saveState } from '@/server/save'
import { getLang } from '@/server/session'
import type { ActionResult } from '@/screens/app'

const text = (fd: FormData, name: string) => String(fd.get(name) ?? '')

/** The customer signed in, or null: a shop account has no profile (BR-15, AC57). */
async function customer() {
  const auth = await getAuthProvider()
  const user = await auth.getUser()
  return user && user.role === 'customer' ? { auth, user } : null
}

/**
 * Save on the profile. Completing an incomplete profile goes on to the page to return to
 * (CN-65, AC190); saving a complete one stays, with the saved notice (CN-77, CN-78, AC177).
 */
export async function saveProfileAction(_prev: accounts.ProfileState, fd: FormData): Promise<accounts.ProfileState> {
  const c = await customer()
  if (!c) redirect('/sign-in')
  const result = await accounts.saveProfile({ db: getDb(), auth: c.auth, at: (await now()).date }, c.user.id, {
    name: text(fd, 'name'),
    phone: text(fd, 'phone'),
    email: text(fd, 'email'),
    buildingId: text(fd, 'buildingId'),
  })
  if (result.status === 'saved' && !result.wasComplete) redirect(afterSignIn({ role: 'customer', complete: true, next: text(fd, 'next') }))
  if (result.status === 'saved') refresh()
  return result
}

/** "Send again" of the waiting new email, and "Send a new link" of an expired email-change link. */
export async function sendEmailChangeAction(): Promise<accounts.FormState> {
  const c = await customer()
  if (!c) return { status: 'error', fields: {}, notice: { code: 'noPendingEmail' } }
  return accounts.sendEmailChange({ db: getDb(), auth: c.auth, at: (await now()).date }, c.user.id)
}

/**
 * "Propose this building" (BR-16, CN-77, CN-78, CN-79): the pending building is created at once,
 * or the customer's own pending one of that name is selected again, with a new address if one is
 * typed (AC183, AC189, AC193). Through `load.ts`,
 * `logic.proposeBuilding` and `save.ts` (B24), with random UUIDs (B30).
 */
export async function proposeBuildingAction(name: string, address: string): Promise<ActionResult> {
  const c = await customer()
  if (!c) return { ok: false, error: 'notFound' }
  const db = getDb()
  const clock = await now()
  return inTransaction(db, async (tx) => {
    // One proposal of this customer at a time: two taps at once (two tabs) cannot both miss the
    // pending building of that name and make two (CN-78, AC189).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`propose-building:${c.user.id}`}))`)
    const before = await loadProfileState(tx, { me: c.user.id, lang: await getLang(), clock })
    const r = logic.proposeBuilding(before, name, address, () => randomUUID())
    if (!r.ok) return { ok: false, error: r.error }
    await saveState(tx, before, r.state)
    return { ok: true, id: r.id }
  })
}
