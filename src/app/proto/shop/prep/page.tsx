import { Suspense } from 'react'
import { PrepScreen } from '@/screens/shop/PrepScreen'

// Client-only page: the fake data lives in the browser (see the prototype layout).
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <PrepScreen />
    </Suspense>
  )
}
