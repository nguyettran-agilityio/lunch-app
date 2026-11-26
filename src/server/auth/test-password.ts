// Password hashes of the test sign-in mode (B25), with scrypt. No other imports: the e2e seed
// script loads this file as it is to seed the accounts' passwords.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}

export function passwordMatches(password: string, stored: string | null): boolean {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  const given = scryptSync(password, salt, 32)
  const want = Buffer.from(hash, 'hex')
  return want.length === given.length && timingSafeEqual(want, given)
}
