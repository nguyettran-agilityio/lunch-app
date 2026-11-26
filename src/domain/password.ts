// The password rule (BR-29a): at least 8 characters, with both letters and digits.
// Letters include Vietnamese letters with accents.

export function isValidPassword(password: string): boolean {
  return [...password].length >= 8 && /\p{L}/u.test(password) && /\p{Nd}/u.test(password)
}
