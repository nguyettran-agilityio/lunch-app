import { Suspense } from 'react'
import { AccountsDesign } from '@/screens/accounts-design/AccountsDesign'

// M1-D design round for the account screens (UI16): mockups on fake data, removed once the Lead
// has chosen a direction. Client-only page, like the rest of the prototype.
export const instant = false

export default function Page() {
  return (
    <Suspense>
      <AccountsDesign />
    </Suspense>
  )
}
