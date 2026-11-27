// The `reset_link` cookie (plan.md PR M1-4, CN-73, CN-74, B67): the reset link that
// /auth/reset/link/<sent> keeps without using it, until /auth/reset saves the new password.
// httpOnly, never in a URL; on path /auth, so only the reset pages get it; it expires at the
// earlier of the link's hour and one hour from now. Every deletion passes the same path, since
// `cookies().delete(name)` alone deletes on path /.
import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import type { ResetLink } from './provider'

export const RESET_LINK_COOKIE = 'reset_link'
export const RESET_COOKIE_PATH = '/auth'
/** A reset link works for 1 hour from its sending (BR-29a, CN-58). */
export const RESET_LINK_MS = 60 * 60 * 1000

/** When the cookies of a reset link expire: the earlier of the link's hour and now + 1 hour. */
export function resetCookieExpiry(sent: number, at: Date): Date {
  return new Date(Math.min(sent + RESET_LINK_MS, at.getTime() + RESET_LINK_MS))
}

/** The SHA-256 digest of a link's token hash, kept in `used_reset_links` (CN-74). */
export function resetDigest(tokenHash: string): string {
  return createHash('sha256').update(tokenHash).digest('hex')
}

export async function setResetLink(link: ResetLink, at: Date): Promise<void> {
  ;(await cookies()).set(RESET_LINK_COOKIE, JSON.stringify(link), {
    httpOnly: true,
    sameSite: 'lax',
    path: RESET_COOKIE_PATH,
    expires: resetCookieExpiry(link.sent, at),
  })
}

export async function getResetLink(): Promise<ResetLink | null> {
  const raw = (await cookies()).get(RESET_LINK_COOKIE)?.value
  try {
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v.tokenHash === 'string' && v.tokenHash && Number.isFinite(v.sent) ? { tokenHash: v.tokenHash, sent: v.sent } : null
  } catch {
    return null
  }
}

export async function clearResetLink(): Promise<void> {
  ;(await cookies()).delete({ name: RESET_LINK_COOKIE, path: RESET_COOKIE_PATH })
}
