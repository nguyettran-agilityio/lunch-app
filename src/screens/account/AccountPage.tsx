// The server part of /sign-in and /sign-up: reads the language and the session at request
// time (inside the page's Suspense, as Cache Components needs), sends someone already signed
// in where signing in would send them (CN-69), and renders the form in the real shell. A
// Google sign-in that came back without signing in gives its message code in `?google=`;
// after an AC91 refusal the 60-second wait of the kept email is read here (CN-68, CN-72).
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { afterSignIn, isGoogleRefusal } from '@/domain/account'
import type { Lang } from '@/domain/types'
import { RealShell } from '@/components/RealShell'
import { mailWait } from '@/server/auth/accounts'
import { getGoogleRefused } from '@/server/auth/google-cookies'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { currentAccount, getLang } from '@/server/session'
import type { GoogleState } from './AccountForms'

type Params = Record<string, string | string[] | undefined>

export const firstParam = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

async function googleState(sp: Params): Promise<GoogleState | undefined> {
  const code = firstParam(sp.google)
  if (!isGoogleRefusal(code)) return undefined
  if (code !== 'googleNotConfirmed') return { code, wait: 0 }
  const kept = await getGoogleRefused()
  if (!kept) return { code, wait: 0 }
  // The current time is read at request time only (Cache Components).
  await connection()
  return { code, wait: await mailWait(getDb(), kept.email, (await now()).date) }
}

export async function AccountPage({
  searchParams,
  render,
}: {
  searchParams: Promise<Params>
  render: (lang: Lang, sp: Params, google: GoogleState | undefined) => ReactNode
}) {
  const [sp, account, lang] = await Promise.all([searchParams, currentAccount(), getLang()])
  if (account) redirect(afterSignIn({ role: account.user.role, complete: account.complete, next: firstParam(sp.next) }))
  return (
    <RealShell lang={lang} signedIn={false}>
      {render(lang, sp, await googleState(sp))}
    </RealShell>
  )
}
