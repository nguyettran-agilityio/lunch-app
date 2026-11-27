// The shop's Settings screen, S-S4 (BR-4, BR-19, CN-60, CN-83, B73): for a shop account; someone
// not signed in is sent to sign in and back here (AC201), a customer to / (CN-68). The default
// cutoff shows 09:30 until the shop saves another (AC224); the bank fields are empty until then.
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { SettingsScreen } from '@/screens/shop/SettingsScreen'
import { now } from '@/server/clock'
import { settingsPage } from '@/server/days'
import { getDb } from '@/server/db/client'
import { getLang } from '@/server/session'
import { shopUser } from '@/server/shop-page'

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  )
}

async function Settings() {
  const [, lang] = await Promise.all([shopUser('/shop/settings'), getLang()])
  await connection()
  const { today, minutes } = await now()
  const saved = await settingsPage({ db: getDb(), clock: { today, minutes } })
  return (
    <RealShell lang={lang} signedIn shop home="/shop">
      <SettingsScreen
        lang={lang}
        defaultCutoff={saved.cutoffInUse}
        bankBin={saved.bankBin ?? ''}
        account={saved.bankAccount ?? ''}
        holder={saved.bankHolder ?? ''}
      />
    </RealShell>
  )
}
