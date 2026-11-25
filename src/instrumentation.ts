// Runs once when a server starts (B25): the test sign-in mode must never run next to
// Vercel or a Supabase key, so a conflict stops the server before it takes any request.
// A thrown error alone only logs "Failed to prepare server" and `next start` keeps
// running, so on the Node.js runtime the process exits with code 1.
import { testModeConflict } from '@/server/auth/test-mode'

export function register() {
  const conflict = testModeConflict()
  if (!conflict) return
  const message = `Refusing to start: ${conflict} (decision B25)`
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.error(message)
    process.exit(1)
  }
  throw new Error(message)
}
