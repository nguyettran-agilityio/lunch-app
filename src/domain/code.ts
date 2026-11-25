import type { DateStr } from './types'

/** Order code: "LA" + MMDD + sequence for that day, letters and digits only (CN-20). */
export function orderCode(date: DateStr, n: number): string {
  return `LA${date.slice(5, 7)}${date.slice(8, 10)}${String(n).padStart(3, '0')}`
}
