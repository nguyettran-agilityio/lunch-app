import { Suspense } from 'react'
import { DayScreen } from '@/screens/customer/DayScreen'

// Client-only page: the fake data lives in the browser (see the root layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <DayScreen />
    </Suspense>
  )
}
