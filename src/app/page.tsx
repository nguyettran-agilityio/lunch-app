// The customer home of M1 (B61): the name, or the phone number grouped 4-3-3 while the
// profile has no name yet; the default building when there is one; and the prototype link.
// The week view moves here in M2. A visitor not signed in is sent to sign in (CN-65).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { messages } from '@/domain/i18n'
import { formatPhone } from '@/domain/phone'
import { currentAccount, getLang } from '@/server/session'

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}

async function Home() {
  const [account, lang] = await Promise.all([currentAccount(), getLang()])
  if (!account) redirect('/sign-in')
  const m = messages[lang].real
  const who = account.name ?? (account.phone ? formatPhone(account.phone) : account.user.email)
  return (
    <RealShell lang={lang} signedIn>
      <section className="parcel max-w-xl bg-card p-5 ring-1 ring-steel/70 sm:p-6">
        <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-tight">{m.hello(who)}</h1>
        {account.building && <p className="mt-2 text-[15px]">{m.building(account.building.name)}</p>}
        <p className="mt-2 text-[15px] text-muted">{m.homeIntro}</p>
        <Link
          href="/proto"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-leaf px-4 font-semibold text-on-leaf hover:bg-leaf-dark"
        >
          {m.openPrototype}
        </Link>
      </section>
    </RealShell>
  )
}
