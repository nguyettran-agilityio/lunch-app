// The expired-link page (BR-29a, CN-61, CN-64): "The link has expired"; for a sign-up link it
// asks for the phone number or email and sends a new link, with the 60-second wait; for a reset
// link the same, with the answers of "Forgot password" (CN-73, AC148). It is open to everyone.
// The page of an email-change link is for someone signed in: a visitor not signed in is sent to
// sign in, then back here (CN-65, AC109); it asks for nothing and sends to the new email waiting
// for the account signed in (CN-77, CN-78).
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { ExpiredEmailChange, ExpiredSignUpForm, ForgotPasswordForm } from '@/screens/account/AccountForms'
import { mailWait } from '@/server/auth/accounts'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { currentAccount, getLang } from '@/server/session'

/** The new email waiting for this account, and the seconds left of its 60-second wait (CN-68). */
async function waitingEmail(userId: string): Promise<{ pending: string | null; wait: number }> {
  const [p] = await getDb().select({ pending: profiles.pendingEmail }).from(profiles).where(eq(profiles.id, userId))
  if (!p?.pending) return { pending: null, wait: 0 }
  await connection()
  return { pending: p.pending, wait: await mailWait(getDb(), p.pending, (await now()).date) }
}

export default function Page({ searchParams }: PageProps<'/auth/expired'>) {
  return (
    <Suspense>
      <Expired searchParams={searchParams} />
    </Suspense>
  )
}

async function Expired({ searchParams }: { searchParams: PageProps<'/auth/expired'>['searchParams'] }) {
  const [sp, lang, account] = await Promise.all([searchParams, getLang(), currentAccount()])
  const type = sp.type ?? 'signup'
  // "Go to the home page" leads a shop account to /shop (CN-72, AC125, CN-74).
  const home = account?.user.role === 'shop' ? '/shop' : '/'
  if (type === 'email_change') {
    if (!account) redirect(`/sign-in?next=${encodeURIComponent('/auth/expired?type=email_change')}`)
    const { pending, wait } = await waitingEmail(account.user.id)
    return (
      <RealShell lang={lang} signedIn home={home}>
        <ExpiredEmailChange lang={lang} pending={pending} wait={wait} home={home} />
      </RealShell>
    )
  }
  return (
    <RealShell lang={lang} signedIn={!!account} home={home}>
      {type === 'signup' ? (
        <ExpiredSignUpForm lang={lang} signedIn={!!account} home={home} />
      ) : type === 'recovery' ? (
        <ForgotPasswordForm lang={lang} signedIn={!!account} home={home} expired />
      ) : (
        <ExpiredSignUpForm lang={lang} signedIn={!!account} home={home} />
      )}
    </RealShell>
  )
}
