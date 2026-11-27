// A path under /shop that the app does not have (CN-80, AC201, B71): a shop account goes to /shop and
// never sees a 404; a customer is sent to / by proxy.ts first, and here too.
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { shopUser } from '@/server/shop-page'

export default function Page() {
  return (
    <Suspense>
      <ToShop />
    </Suspense>
  )
}

async function ToShop(): Promise<null> {
  await shopUser('/shop')
  redirect('/shop')
}
