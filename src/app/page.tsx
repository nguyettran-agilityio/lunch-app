import { redirect } from 'next/navigation'

// Until M1-2 builds the real customer home, `/` sends visitors to the prototype (B31).
export default function Page() {
  redirect('/proto')
}
