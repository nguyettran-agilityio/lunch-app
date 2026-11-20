import { Suspense } from 'react'
import { DeliveryScreen } from '@/screens/shop/DeliveryScreen'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <DeliveryScreen />
    </Suspense>
  )
}
