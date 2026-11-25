import { Suspense } from 'react'
import { ShopOrderScreen } from '@/screens/shop/ShopOrderScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <ShopOrderScreen />
    </Suspense>
  )
}
