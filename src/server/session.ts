// The session of a request for pages and actions (plan.md sections 1.5 and 1.8): the account
// signed in with its profile, and the language. Read on every request, never cached.
import 'server-only'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { isProfileComplete } from '@/domain/account'
import type { Lang } from '@/domain/types'
import { getAuthProvider, type SessionUser } from '@/server/auth/provider'
import { getDb } from '@/server/db/client'
import { buildings, profiles } from '@/server/db/schema'

export const LANG_COOKIE = 'lang'

/** The language of this browser: the `lang` cookie, Vietnamese when there is none (BR-30). */
export async function getLang(): Promise<Lang> {
  return (await cookies()).get(LANG_COOKIE)?.value === 'en' ? 'en' : 'vi'
}

export async function setLangCookie(lang: Lang): Promise<void> {
  ;(await cookies()).set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax', maxAge: 400 * 24 * 60 * 60 })
}

export type Account = {
  user: SessionUser
  name: string | null
  phone: string | null
  lang: Lang
  building: { name: string; state: string } | null
  complete: boolean
}

/** The account signed in with its profile, or null. */
export async function currentAccount(): Promise<Account | null> {
  const user = await (await getAuthProvider()).getUser()
  if (!user) return null
  const [row] = await getDb()
    .select({
      name: profiles.name,
      phone: profiles.phone,
      lang: profiles.lang,
      buildingName: buildings.name,
      buildingState: buildings.state,
    })
    .from(profiles)
    .leftJoin(buildings, eq(buildings.id, profiles.buildingId))
    .where(eq(profiles.id, user.id))
  if (!row) return null
  const building = row.buildingName && row.buildingState ? { name: row.buildingName, state: row.buildingState } : null
  return {
    user,
    name: row.name,
    phone: row.phone,
    lang: row.lang,
    building,
    complete: isProfileComplete({ name: row.name, phone: row.phone, buildingState: row.buildingState }),
  }
}
