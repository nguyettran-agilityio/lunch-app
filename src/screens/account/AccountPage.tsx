// The server part of /sign-in and /sign-up: reads the language and the session at request
// time (inside the page's Suspense, as Cache Components needs), sends someone already signed
// in where signing in would send them (CN-69), and renders the form in the real shell.
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { afterSignIn } from '@/domain/account'
import type { Lang } from '@/domain/types'
import { RealShell } from '@/components/RealShell'
import { currentAccount, getLang } from '@/server/session'

type Params = Record<string, string | string[] | undefined>

export const firstParam = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export async function AccountPage({
  searchParams,
  render,
}: {
  searchParams: Promise<Params>
  render: (lang: Lang, sp: Params) => ReactNode
}) {
  const [sp, account, lang] = await Promise.all([searchParams, currentAccount(), getLang()])
  if (account) redirect(afterSignIn({ role: account.user.role, complete: account.complete, next: firstParam(sp.next) }))
  return (
    <RealShell lang={lang} signedIn={false}>
      {render(lang, sp)}
    </RealShell>
  )
}
