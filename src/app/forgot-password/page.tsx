// S-C1a Forgot password (BR-29, BR-29a, CN-58, CN-73, CN-74). Open to everyone, also signed in:
// someone signed in sees the same form, stays signed in, and the link under the card goes to
// the home page (/shop for the shop) instead of "Sign in" (AC144, AC155).
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { ForgotPasswordForm } from '@/screens/account/AccountForms'
import { currentAccount, getLang } from '@/server/session'

export default function Page() {
  return (
    <Suspense>
      <ForgotPassword />
    </Suspense>
  )
}

async function ForgotPassword() {
  const [lang, account] = await Promise.all([getLang(), currentAccount()])
  const home = account?.user.role === 'shop' ? '/shop' : '/'
  return (
    <RealShell lang={lang} signedIn={!!account} home={home}>
      <ForgotPasswordForm lang={lang} signedIn={!!account} home={home} />
    </RealShell>
  )
}
