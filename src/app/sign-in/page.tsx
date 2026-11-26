// S-C1 Sign in (BR-29a, CN-64, CN-65). Someone already signed in does not see the form: they
// go where signing in would send them, `next` included (CN-69).
import { Suspense } from 'react'
import { SignInForm } from '@/screens/account/AccountForms'
import { AccountPage, firstParam } from '@/screens/account/AccountPage'

export default function Page({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <Suspense>
      <AccountPage searchParams={searchParams} render={(lang, sp) => <SignInForm lang={lang} next={firstParam(sp.next)} />} />
    </Suspense>
  )
}
