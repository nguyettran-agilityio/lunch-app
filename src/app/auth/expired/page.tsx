// The expired-link page (BR-29a, CN-61, CN-64): "The link has expired"; for a sign-up link it
// asks for the phone number or email and sends a new link, with the 60-second wait. It is open
// to everyone. The reset (M1-4) and email-change (M1-5) kinds come with their links.
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { ExpiredOther, ExpiredSignUpForm } from '@/screens/account/AccountForms'
import { currentAccount, getLang } from '@/server/session'

export default function Page({ searchParams }: PageProps<'/auth/expired'>) {
  return (
    <Suspense>
      <Expired searchParams={searchParams} />
    </Suspense>
  )
}

async function Expired({ searchParams }: { searchParams: PageProps<'/auth/expired'>['searchParams'] }) {
  const [sp, lang, account] = await Promise.all([searchParams, getLang(), currentAccount()])
  return (
    <RealShell lang={lang} signedIn={!!account}>
      {(sp.type ?? 'signup') === 'signup' ? <ExpiredSignUpForm lang={lang} signedIn={!!account} /> : <ExpiredOther lang={lang} />}
    </RealShell>
  )
}
