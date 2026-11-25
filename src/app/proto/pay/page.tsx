import { Suspense } from 'react'
import { PayScreen } from '@/screens/customer/PayScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <PayScreen />
    </Suspense>
  )
}
