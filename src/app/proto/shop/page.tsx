import { Suspense } from 'react'
import { ShopOrdersScreen } from '@/screens/shop/ShopOrdersScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <ShopOrdersScreen />
    </Suspense>
  )
}
