// Shared by the /test/* routes (B42, B46): they exist only in the test sign-in mode and
// use the same check as instrumentation.ts, so they answer 404 whenever it is not fully on.
import { connection } from 'next/server'
import { isTestMode } from '@/server/auth/test-mode'

// Waits for the request first, so the route is never prerendered at build time with the
// build's environment; then returns a 404 response unless the test mode is on.
export async function testRouteClosed(): Promise<Response | null> {
  await connection()
  return isTestMode() ? null : new Response('Not found', { status: 404 })
}
