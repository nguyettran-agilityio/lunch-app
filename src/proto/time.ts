import type { DateStr } from './types'

// All dates and times are Asia/Ho_Chi_Minh, whatever the device time zone (CN-14, AC17).
export const TZ = 'Asia/Ho_Chi_Minh'

export function vietnamNow(date: Date): { today: DateStr; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function addDays(date: DateStr, n: number): DateStr {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateStr): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Demo timestamp kept in history: "YYYY-MM-DD HH:MM", Vietnam time. */
export function stamp(today: DateStr, minutes: number): string {
  return `${today} ${hhmm(minutes)}`
}

export function dayMonth(date: DateStr): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/** Minutes since 1970 of a demo timestamp, to compare stamps across days. */
export function stampMinutes(at: string): number {
  const [date, time] = at.split(' ')
  const [y, mo, d] = date.split('-').map(Number)
  return Date.UTC(y, mo - 1, d) / 60000 + (parseHhmm(time) ?? 0)
}
