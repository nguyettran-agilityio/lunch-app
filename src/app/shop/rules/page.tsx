// The shop's Build-your-own rules screen, S-S2 (BR-7, CN-80, CN-81, B71): for a shop account; someone
// not signed in is sent to sign in and back here (AC201), a customer to / (CN-68). The base price
// field is empty until the first Save creates the settings row (B71).
import { asc } from 'drizzle-orm'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { RulesScreen } from '@/screens/shop/RulesScreen'
import { getDb } from '@/server/db/client'
import { dishGroups } from '@/server/db/schema'
import { loadBasePrice, toGroup } from '@/server/load'
import { getLang } from '@/server/session'
import { shopUser } from '@/server/shop-page'

export default function Page() {
  return (
    <Suspense>
      <Rules />
    </Suspense>
  )
}

async function Rules() {
  const [, lang] = await Promise.all([shopUser('/shop/rules'), getLang()])
  await connection()
  const db = getDb()
  const [basePrice, groups] = await Promise.all([loadBasePrice(db), db.select().from(dishGroups).orderBy(asc(dishGroups.position))])
  return (
    <RealShell lang={lang} signedIn shop home="/shop">
      <RulesScreen lang={lang} basePrice={basePrice} groups={groups.map(toGroup)} />
    </RealShell>
  )
}
