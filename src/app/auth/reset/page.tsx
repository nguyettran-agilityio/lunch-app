// /auth/reset "Set a new password" (BR-29a, CN-64, CN-73, CN-75). It opens only after
// /auth/reset/link/<sent> kept a reset link in the `reset_link` cookie; without it (typed by
// hand, signed in or not) it opens the expired page of a reset link (AC147). Opened or
// reloaded, it makes the same check as tapping the link: more than 1 hour, or already saved,
// opens the expired page at once (AC159). The page reads no session and has the top bar of
// someone signed out: it belongs to the link's account (AC160); only saving signs in.
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { ResetPasswordForm } from '@/screens/account/AccountForms'
import { resetLinkRefusal } from '@/server/auth/accounts'
import { getResetLink } from '@/server/auth/reset-cookies'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { getLang } from '@/server/session'

export default function Page() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  )
}

async function Reset() {
  const [lang, link] = await Promise.all([getLang(), getResetLink()])
  // The current time is read at request time only (Cache Components).
  await connection()
  if (!link || (await resetLinkRefusal(getDb(), link, (await now()).date))) redirect('/auth/expired?type=recovery')
  return (
    <RealShell lang={lang} signedIn={false} browserOnlyLang>
      <ResetPasswordForm lang={lang} />
    </RealShell>
  )
}
