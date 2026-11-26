// S-C1 Sign up (BR-29a, CN-60, CN-64): only phone, email and password. Someone already
// signed in does not see the form (CN-69).
import { Suspense } from 'react'
import { SignUpForm } from '@/screens/account/AccountForms'
import { AccountPage, firstParam } from '@/screens/account/AccountPage'

export default function Page({ searchParams }: PageProps<'/sign-up'>) {
  return (
    <Suspense>
      <AccountPage searchParams={searchParams} render={(lang, sp) => <SignUpForm lang={lang} next={firstParam(sp.next)} />} />
    </Suspense>
  )
}
