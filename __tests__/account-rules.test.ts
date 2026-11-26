// @vitest-environment node
// The pure account rules of M1-2 (BR-29a, CN-64, CN-65, CN-69): phone numbers, the password
// rule, the form checks and where the app goes after signing in.
import { describe, expect, it } from 'vitest'
import { afterSignIn, checkSignIn, checkSignUp, isProfileComplete, readIdentifier, returnPath } from '@/domain/account'
import { isValidPassword } from '@/domain/password'
import { formatPhone, isValidPhone, normalizePhone } from '@/domain/phone'

describe('phone numbers (BR-29a)', () => {
  it('normalizes spaces and +84, so the three spellings are one number', () => {
    for (const s of ['0912 345 678', '0912345678', '+84912345678', ' +84 912 345 678 ']) expect(normalizePhone(s)).toBe('0912345678')
  })
  it('accepts 10 digits starting with 03, 05, 07, 08 or 09 only', () => {
    for (const ok of ['0312345678', '0512345678', '0712345678', '0812345678', '0912345678']) expect(isValidPhone(ok)).toBe(true)
    for (const bad of ['0281234567', '0912345', '09123456789', '0112345678', '091234567a']) expect(isValidPhone(bad)).toBe(false)
  })
  it('shows a number grouped 4-3-3', () => {
    expect(formatPhone('0912345678')).toBe('0912 345 678')
  })
})

describe('A10 the password rule (sign-up part)', () => {
  it('needs 8 characters with letters and digits', () => {
    expect(isValidPassword('abc12')).toBe(false)
    expect(isValidPassword('abcdefgh')).toBe(false)
    expect(isValidPassword('12345678')).toBe(false)
    expect(isValidPassword('abcdef12')).toBe(true)
    expect(isValidPassword('mậtkhẩu1')).toBe(true)
  })
})

describe('X2 X15 the form checks run before any lookup (BR-29a)', () => {
  it('gives each sign-up field its own message', () => {
    expect(checkSignUp({ phone: '028 1234 567', email: 'lan@', password: '' })).toEqual({
      errors: { phone: 'phoneInvalid', email: 'emailInvalid', password: 'required' },
    })
    expect(checkSignUp({ phone: '', email: '', password: 'abc' })).toEqual({
      errors: { phone: 'required', email: 'required', password: 'passwordRule' },
    })
    expect(checkSignUp({ phone: '+84 912 345 678', email: ' Lan@Gmail.com ', password: 'abcdef12' })).toEqual({
      values: { phone: '0912345678', email: 'lan@gmail.com', password: 'abcdef12' },
    })
  })
  it('reads a phone-or-email field as an email when it contains "@"', () => {
    expect(readIdentifier('0281234567')).toBe('phoneInvalid')
    expect(readIdentifier('lan@')).toBe('emailInvalid')
    expect(readIdentifier('')).toBe('required')
    expect(readIdentifier('0912 345 678')).toEqual({ kind: 'phone', phone: '0912345678' })
    expect(readIdentifier('LAN@gmail.com')).toEqual({ kind: 'email', email: 'lan@gmail.com' })
    expect(checkSignIn({ identifier: 'lan@gmail.com', password: '' })).toEqual({ errors: { password: 'required' } })
  })
})

describe('Y10 Y11 where the app goes after signing in (BR-29a)', () => {
  it('follows `next` when it is a path of this app', () => {
    expect(afterSignIn({ role: 'customer', complete: true, next: '/proto/cart?x=1' })).toBe('/proto/cart?x=1')
    for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil', 'proto', null, ''])
      expect(afterSignIn({ role: 'customer', complete: true, next: bad })).toBe('/')
  })
  it('drops a `next` whose path is /sign-in or /sign-up, whatever follows it', () => {
    for (const next of ['/sign-in', '/sign-up', '/sign-up?next=/proto', '/sign-in/', '/sign-in?next=/sign-in'])
      expect(returnPath(next, 'customer')).toBeNull()
  })
  it('drops a real shop page for a customer, but follows /proto/shop and the open pages', () => {
    expect(returnPath('/shop', 'customer')).toBeNull()
    expect(returnPath('/shop/x', 'customer')).toBeNull()
    expect(returnPath('/shopx', 'customer')).toBe('/shopx')
    expect(returnPath('/proto/shop', 'customer')).toBe('/proto/shop')
    expect(returnPath('/auth/expired?type=signup', 'customer')).toBe('/auth/expired?type=signup')
    expect(returnPath('/forgot-password', 'customer')).toBe('/forgot-password')
  })
  it('sends a shop account to /shop, and an incomplete customer to / until the profile of M1-5', () => {
    expect(afterSignIn({ role: 'shop', complete: false, next: '/proto' })).toBe('/shop')
    expect(afterSignIn({ role: 'customer', complete: false, next: '/proto' })).toBe('/')
  })
  it('counts a profile complete with a name, a phone and a building not declined (BR-15)', () => {
    expect(isProfileComplete({ name: 'Lan', phone: '0912345678', buildingState: 'pending' })).toBe(true)
    expect(isProfileComplete({ name: 'Lan', phone: '0912345678', buildingState: 'declined' })).toBe(false)
    expect(isProfileComplete({ name: null, phone: '0912345678', buildingState: 'approved' })).toBe(false)
    expect(isProfileComplete({ name: 'Lan', phone: '0912345678', buildingState: null })).toBe(false)
  })
})
