import { Suspense } from 'react'
import { WeekScreen } from '@/screens/customer/WeekScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <WeekScreen />
    </Suspense>
  )
}
