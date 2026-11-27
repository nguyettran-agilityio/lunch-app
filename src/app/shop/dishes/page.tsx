// The shop's Dishes screen, S-S1 (CN-80, CN-81, B71): for a shop account; someone not signed in is
// sent to sign in and back here (AC201), a customer to / (CN-68). Reads the dishes, the groups and
// each photo's signed address when the page is rendered (B71).
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { DishesScreen } from '@/screens/shop/DishesScreen'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { getLang } from '@/server/session'
import { dishesPage } from '@/server/shop'
import { shopUser } from '@/server/shop-page'
import { getStorage } from '@/server/storage/provider'

export default function Page() {
  return (
    <Suspense>
      <Dishes />
    </Suspense>
  )
}

async function Dishes() {
  const [user, lang] = await Promise.all([shopUser('/shop/dishes'), getLang()])
  await connection()
  const { state, photos } = await dishesPage({ db: getDb(), storage: await getStorage(), ctx: { me: user.id, lang, clock: await now() } })
  return (
    <RealShell lang={lang} signedIn shop home="/shop">
      <DishesScreen lang={lang} dishes={state.dishes} groups={state.groups} photos={photos} />
    </RealShell>
  )
}
