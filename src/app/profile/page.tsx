// The profile, S-C2 (BR-15, BR-16, BR-29a, CN-64, CN-77, CN-78): for a customer signed in; a
// visitor not signed in is sent to sign in by proxy.ts and the shop to /shop (CN-72, AC129).
// Reads the profile, the buildings the customer may pick (`load.ts`, B24), the default building
// the shop declined (AC82, AC188), and the seconds left of the waiting new email's wait (CN-68).
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RealShell } from '@/components/RealShell'
import { isProfileComplete } from '@/domain/account'
import { ProfileForm } from '@/screens/account/ProfileForm'
import { firstParam } from '@/screens/account/AccountPage'
import { mailWait } from '@/server/auth/accounts'
import { getAuthProvider } from '@/server/auth/provider'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { buildings, profiles } from '@/server/db/schema'
import { loadProfileState } from '@/server/load'
import { getLang } from '@/server/session'

export default function Page({ searchParams }: PageProps<'/profile'>) {
  return (
    <Suspense>
      <Profile searchParams={searchParams} />
    </Suspense>
  )
}

async function Profile({ searchParams }: { searchParams: PageProps<'/profile'>['searchParams'] }) {
  const [sp, lang, user] = await Promise.all([searchParams, getLang(), (await getAuthProvider()).getUser()])
  if (!user) redirect('/sign-in?next=/profile')
  if (user.role === 'shop') redirect('/shop')
  const db = getDb()
  const [p] = await db.select().from(profiles).where(eq(profiles.id, user.id))
  if (!p) redirect('/sign-in')
  const [b] = p.buildingId
    ? await db.select({ name: buildings.name, state: buildings.state }).from(buildings).where(eq(buildings.id, p.buildingId))
    : []
  await connection()
  const clock = await now()
  const state = await loadProfileState(db, { me: user.id, lang, clock })
  const declined = b?.state === 'declined' ? b.name : null
  const pendingWait = p.pendingEmail ? await mailWait(db, p.pendingEmail, clock.date) : 0
  return (
    <RealShell lang={lang} signedIn>
      <ProfileForm
        lang={lang}
        state={state}
        profile={{
          name: p.name ?? '',
          phone: p.phone ?? '',
          email: p.email,
          pendingEmail: p.pendingEmail,
          method: p.method,
          // A declined building is not offered (AC188): the field starts empty.
          buildingId: declined ? null : p.buildingId,
        }}
        complete={isProfileComplete({ name: p.name, phone: p.phone, buildingState: b?.state ?? null })}
        declined={declined}
        next={firstParam(sp.next)}
        pendingWait={pendingWait}
        emailChanged={firstParam(sp.emailChanged) === '1'}
      />
    </RealShell>
  )
}
