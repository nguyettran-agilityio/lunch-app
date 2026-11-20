'use client'

import { findDish, lineTotal } from '@/proto/logic'
import { dayMonth, weekday } from '@/proto/time'
import type { DateStr, Line } from '@/proto/types'
import { useApp } from '@/proto/useApp'

export function DayLabel({ date, long = false }: { date: DateStr; long?: boolean }) {
  const { s, m } = useApp()
  const names = long ? m.weekdaysLong : m.weekdays
  return (
    <>
      {date === s.clock.today ? `${m.demo.today}, ` : `${names[weekday(date)]}, `}
      {dayMonth(date)}
    </>
  )
}

export function LineText({ line }: { line: Line }) {
  const { s, m } = useApp()
  if (line.kind === 'fixed') return <>{findDish(s, line.dishId)?.name}</>
  return (
    <>
      <span className="font-semibold">{m.cart.plate}</span>
      <span className="text-muted">: {line.picks.map((id) => findDish(s, id)?.name).join(', ')}</span>
    </>
  )
}

export function LinesList({ lines }: { lines: Line[] }) {
  const { money } = useApp()
  return (
    <ul className="divide-y divide-tray">
      {lines.map((l) => (
        <li key={l.id} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
          <span>
            <span className="font-semibold">{l.qty} × </span>
            <LineText line={l} />
          </span>
          <span className="shrink-0 font-medium">{money(lineTotal(l))}</span>
        </li>
      ))}
    </ul>
  )
}

/** Compact one-line summary for shop lists. */
export function LinesSummary({ lines }: { lines: Line[] }) {
  const { s, m } = useApp()
  return (
    <p className="text-[15px]">
      {lines
        .map((l) =>
          l.kind === 'fixed'
            ? `${l.qty}× ${findDish(s, l.dishId)?.name}`
            : `${l.qty}× ${m.cart.plate} (${l.picks.map((id) => findDish(s, id)?.name).join(', ')})`,
        )
        .join(' · ')}
    </p>
  )
}

/**
 * A fake QR: a deterministic pattern from the payload, with the three finder squares,
 * so it looks like a VietQR code. It cannot be scanned (decision P1: fake QR).
 */
export function FakeQr({ payload, label }: { payload: string; label: string }) {
  const n = 29
  let h = 2166136261
  for (let i = 0; i < payload.length; i++) h = Math.imul(h ^ payload.charCodeAt(i), 16777619)
  const cells: [number, number][] = []
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue
      h = Math.imul(h ^ (x * 31 + y), 16777619)
      if ((h >>> 13) % 2 === 0) cells.push([x, y])
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#1d2420" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#1d2420" />
    </g>
  )
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={label} className="aspect-square w-full max-w-60 rounded-lg bg-white">
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill="#1d2420" />
      ))}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  )
}
