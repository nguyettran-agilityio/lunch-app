// The shop home of M1 (B61): a greeting and the link to the prototype. A customer who opens
// it is sent to / (CN-68); in M1-2 the page checks this itself, M1-3 adds it to proxy.ts.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { messages } from '@/domain/i18n'
import { currentAccount, getLang } from '@/server/session'

export default function Page() {
  return (
    <Suspense>
      <ShopHome />
    </Suspense>
  )
}

async function ShopHome() {
  const [account, lang] = await Promise.all([currentAccount(), getLang()])
  if (!account) redirect('/sign-in?next=/shop')
  if (account.user.role !== 'shop') redirect('/')
  const m = messages[lang].real
  return (
    <RealShell lang={lang} signedIn home="/shop">
      <section className="parcel max-w-xl bg-card p-5 ring-1 ring-steel/70 sm:p-6">
        <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-tight">{m.shopHello}</h1>
        <p className="mt-2 text-[15px] text-muted">{m.shopIntro}</p>
        <Link
          href="/proto/shop"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-leaf px-4 font-semibold text-on-leaf hover:bg-leaf-dark"
        >
          {m.openPrototype}
        </Link>
      </section>
    </RealShell>
  )
}
