import { Suspense } from 'react'
import { OrdersScreen } from '@/screens/customer/OrdersScreen'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  )
}
