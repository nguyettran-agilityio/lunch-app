// The shop's Days screen, S-S3 (BR-2, BR-4, CN-83, B73): for a shop account; someone not signed in
// is sent to sign in and back here (AC201), a customer to / (CN-68). Today and the next 6 days in
// Vietnam time, from the server clock (AC223), with each day's menu and cutoff.
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { DaysScreen } from '@/screens/shop/DaysScreen'
import { now } from '@/server/clock'
import { daysPage } from '@/server/days'
import { getDb } from '@/server/db/client'
import { getLang } from '@/server/session'
import { shopUser } from '@/server/shop-page'

export default function Page() {
  return (
    <Suspense>
      <Days />
    </Suspense>
  )
}

async function Days() {
  const [, lang] = await Promise.all([shopUser('/shop/days'), getLang()])
  await connection()
  const { today, minutes } = await now()
  const clock = { today, minutes }
  const data = await daysPage({ db: getDb(), clock })
  return (
    <RealShell lang={lang} signedIn shop home="/shop">
      <DaysScreen lang={lang} clock={clock} {...data} />
    </RealShell>
  )
}
