// Vietnamese phone numbers (BR-29a, CN-60, CN-64): spaces are removed and +84 becomes 0, so
// "0912 345 678", "0912345678" and "+84912345678" are the same number. A number is valid when,
// after normalizing, it has 10 digits starting with 03, 05, 07, 08 or 09 (the same pattern as
// the CHECK constraint on profiles.phone, B40). Shown grouped 4-3-3 on every screen.

const VALID = /^0[35789][0-9]{8}$/

/** Removes spaces and turns a leading +84 into 0; nothing else is changed. */
export function normalizePhone(input: string): string {
  const compact = input.replace(/\s+/g, '')
  return compact.startsWith('+84') ? `0${compact.slice(3)}` : compact
}

/** True for a normalized Vietnamese mobile number. */
export function isValidPhone(normalized: string): boolean {
  return VALID.test(normalized)
}

/** "0912345678" → "0912 345 678"; anything else is returned as it is. */
export function formatPhone(phone: string): string {
  return VALID.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone
}
