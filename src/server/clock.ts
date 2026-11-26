// The current time (plan.md section 1.3) in Asia/Ho_Chi_Minh. Only in the test sign-in mode,
// an offset in seconds read from the `test_clock_offset` cookie of the browser context moves
// it, so Playwright can pass the 60-second wait and the 1-hour link expiry without waiting;
// outside the test mode the cookie is ignored (B59).
import 'server-only'
import { cookies } from 'next/headers'
import { stamp, vietnamNow } from '@/domain/time'
import type { DateStr } from '@/domain/types'
import { isTestMode } from './auth/test-mode'

export const TEST_CLOCK_COOKIE = 'test_clock_offset'

export type Now = { today: DateStr; minutes: number; stamp: string; date: Date }

type Env = Record<string, string | undefined>

/** The time `base` moved by the offset cookie, when the test mode is on. */
export function clockAt(base: Date, offsetCookie: string | undefined, env: Env = process.env): Now {
  const offset = isTestMode(env) ? Number(offsetCookie ?? 0) : 0
  const date = new Date(base.getTime() + (Number.isFinite(offset) ? offset * 1000 : 0))
  const { today, minutes } = vietnamNow(date)
  return { today, minutes, stamp: stamp(today, minutes), date }
}

export async function now(): Promise<Now> {
  const offset = isTestMode() ? (await cookies()).get(TEST_CLOCK_COOKIE)?.value : undefined
  return clockAt(new Date(), offset)
}
