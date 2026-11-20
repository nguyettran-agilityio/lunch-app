import { Suspense } from 'react'
import { RefundsScreen } from '@/screens/shop/RefundsBuildingsScreens'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <RefundsScreen />
    </Suspense>
  )
}
