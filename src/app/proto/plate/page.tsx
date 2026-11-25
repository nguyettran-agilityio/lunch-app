import { Suspense } from 'react'
import { PlateScreen } from '@/screens/customer/PlateScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <PlateScreen />
    </Suspense>
  )
}
