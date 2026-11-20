import { Suspense } from 'react'
import { CartScreen } from '@/screens/customer/CartScreen'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <CartScreen />
    </Suspense>
  )
}
