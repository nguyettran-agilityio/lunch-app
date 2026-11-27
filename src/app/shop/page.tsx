// The shop home (B61): a greeting, the real shop screens of M2-1 (Dishes, Build-your-own rules) and
// the link to the prototype. A customer who opens it is sent to / (CN-68), by proxy.ts and here.
import Link from 'next/link'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { messages } from '@/domain/i18n'
import { shopUser } from '@/server/shop-page'
import { getLang } from '@/server/session'

export default function Page() {
  return (
    <Suspense>
      <ShopHome />
    </Suspense>
  )
}

async function ShopHome() {
  const [, lang] = await Promise.all([shopUser('/shop'), getLang()])
  const m = messages[lang].real
  const s = messages[lang].shopSetup
  const link = 'inline-flex min-h-11 items-center rounded-xl px-4 font-semibold'
  return (
    <RealShell lang={lang} signedIn shop home="/shop">
      <section className="parcel max-w-xl bg-card p-5 ring-1 ring-steel/70 sm:p-6">
        <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-tight">{m.shopHello}</h1>
        <p className="mt-2 text-[15px] text-muted">{m.shopIntro}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/shop/dishes" className={`${link} bg-leaf text-on-leaf hover:bg-leaf-dark`}>
            {s.navDishes}
          </Link>
          <Link href="/shop/rules" className={`${link} bg-leaf text-on-leaf hover:bg-leaf-dark`}>
            {s.navRules}
          </Link>
          <Link href="/proto/shop" className={`${link} text-leaf ring-1 ring-leaf hover:bg-leaf-soft`}>
            {m.openPrototype}
          </Link>
        </div>
      </section>
    </RealShell>
  )
}
