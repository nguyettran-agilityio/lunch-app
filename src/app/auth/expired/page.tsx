// The expired-link page (BR-29a, CN-61, CN-64): "The link has expired"; for a sign-up link it
// asks for the phone number or email and sends a new link, with the 60-second wait; for a reset
// link the same, with the answers of "Forgot password" (CN-73, AC148). It is open to everyone.
// The email-change kind (M1-5) comes with its link.
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { ExpiredOther, ExpiredSignUpForm, ForgotPasswordForm } from '@/screens/account/AccountForms'
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
  const type = sp.type ?? 'signup'
  // "Go to the home page" leads a shop account to /shop (CN-72, AC125, CN-74).
  const home = account?.user.role === 'shop' ? '/shop' : '/'
  return (
    <RealShell lang={lang} signedIn={!!account} home={home}>
      {type === 'signup' ? (
        <ExpiredSignUpForm lang={lang} signedIn={!!account} home={home} />
      ) : type === 'recovery' ? (
        <ForgotPasswordForm lang={lang} signedIn={!!account} home={home} expired />
      ) : (
        <ExpiredOther lang={lang} />
      )}
    </RealShell>
  )
}
