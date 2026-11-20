import { Suspense } from 'react'
import { OrderScreen } from '@/screens/customer/OrderScreen'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <OrderScreen />
    </Suspense>
  )
}
