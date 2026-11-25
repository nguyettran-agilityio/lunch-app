import { Suspense } from 'react'
import { ReviewScreen } from '@/screens/shop/ReviewScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <ReviewScreen />
    </Suspense>
  )
}
