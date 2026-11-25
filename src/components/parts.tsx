'use client'

import { dishName, findBuilding, lineTotal, moneySummary, owed } from '@/domain/logic'
import { dayMonth, weekday } from '@/domain/time'
import type { DateStr, EditChange, HistoryEntry, Line, Order, Refund, RefundTo } from '@/domain/types'
import { useApp } from '@/screens/app'
import { LineArt } from './art'
import { Notice } from './ui'

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
  if (line.kind === 'fixed') return <>{dishName(s, line.dishId)}</>
  return (
    <>
      <span className="font-semibold">{m.cart.plate}</span>
      <span className="text-muted">: {line.picks.map((id) => dishName(s, id)).join(', ')}</span>
    </>
  )
}

/** One line as plain text, for summaries and the edit history. */
export function useLineLabel() {
  const { s, m } = useApp()
  return (l: Line) => (l.kind === 'fixed' ? dishName(s, l.dishId) : `${m.cart.plate} (${l.picks.map((id) => dishName(s, id)).join(', ')})`)
}

/** The lines of an order; `art` adds a drawn thumbnail to each line (customer screens, UI6). */
export function LinesList({ lines, art = false }: { lines: Line[]; art?: boolean }) {
  const { money } = useApp()
  return (
    <ul className="divide-y divide-tray">
      {lines.map((l) => (
        <li key={l.id} className={`flex justify-between gap-3 py-2 text-[15px] ${art ? 'items-center' : 'items-baseline'}`}>
          {art && (
            <LineArt
              dishId={l.kind === 'fixed' ? l.dishId : undefined}
              picks={l.kind === 'plate' ? l.picks : undefined}
              className="size-12 shrink-0"
            />
          )}
          <span className={art ? 'flex-1' : undefined}>
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
  const label = useLineLabel()
  return <p className="text-[15px]">{lines.map((l) => `${l.qty}× ${label(l)}`).join(' · ')}</p>
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

/** Status changes and saved edits with what changed, for customer and shop (CN-32). */
export function OrderHistory({ history }: { history: HistoryEntry[] }) {
  const { s, m, money } = useApp()
  const label = useLineLabel()
  const building = (id: string) => findBuilding(s, id)?.name ?? id
  const change = (c: EditChange) => {
    switch (c.type) {
      case 'added':
        return m.detail.chAdded(`${c.line.qty} × ${label(c.line)}`)
      case 'removed':
        return m.detail.chRemoved(`${c.line.qty} × ${label(c.line)}`)
      case 'qty':
        return m.detail.chQty(label(c.line), c.from, c.to)
      case 'building':
        return m.detail.chBuilding(building(c.from), building(c.to))
      case 'note':
        return m.detail.chNote(c.from, c.to)
    }
  }
  return (
    <ol className="relative ml-1.5 flex flex-col gap-3 border-l-2 border-steel pl-4">
      {history.map((h, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute top-1.5 -left-[23px] size-3 rounded-full ring-2 ring-card ${h.kind === 'edit' ? 'bg-turmeric' : h.kind === 'reportMissing' ? 'bg-chili' : 'bg-leaf'}`}
          />
          {h.kind === 'edit' ? (
            <>
              <p className="font-semibold">{m.detail.edited(money(h.fromTotal), money(h.toTotal))}</p>
              <ul className="mt-0.5 text-sm">
                {h.changes.map((c, j) => (
                  <li key={j}>· {change(c)}</li>
                ))}
              </ul>
            </>
          ) : h.kind === 'reportMissing' ? (
            <p className="font-semibold">{m.detail.historyMissing(money(h.amount))}</p>
          ) : (
            <p className="font-semibold">{m.status[h.status]}</p>
          )}
          <p className="text-sm text-muted">{h.at}</p>
        </li>
      ))}
    </ol>
  )
}

/** Where the customer asked for the refund to go (CN-33). */
export function RefundToView({ to }: { to: RefundTo }) {
  const { m } = useApp()
  if (to.kind === 'cash') return <p className="text-[15px] font-semibold">{m.refunds.destCash}</p>
  if (to.kind === 'qr') {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL uploaded by the customer, kept in localStorage
    return <img src={to.image} alt={m.refunds.destQr} className="mt-1 w-full max-w-48 rounded-lg ring-1 ring-steel" />
  }
  return (
    <p className="text-[15px]">
      <span className="font-semibold">{to.bank}</span> · <span className="font-bold tracking-wide">{to.account}</span> · {to.holder}
    </p>
  )
}

/** Money received by the shop, and refunds pending or sent, as rows of an order's detail list. */
export function PaidRows({ order }: { order: Order }) {
  const { m, money } = useApp()
  const { received, reported, pendingRefund, refunded } = moneySummary(order)
  return (
    <>
      <dt className="text-muted">{m.detail.paid}</dt>
      <dd className="text-right">{money(received)}</dd>
      {/* Reported money is not received until the shop confirms it (CN-37, CN-39). */}
      {reported > 0 && (
        <>
          <dt className="text-muted">{m.detail.reportedRow}</dt>
          <dd className="text-right">{money(reported)}</dd>
        </>
      )}
      {pendingRefund > 0 && (
        <>
          <dt className="font-semibold text-chili">{m.detail.pendingRefund}</dt>
          <dd className="text-right font-semibold text-chili">{money(pendingRefund)}</dd>
        </>
      )}
      {refunded > 0 && (
        <>
          <dt className="text-muted">{m.detail.refundedAmount}</dt>
          <dd className="text-right">{money(refunded)}</dd>
        </>
      )}
    </>
  )
}

/** Transfers the shop has not found; a closed order owes nothing, so no transfer is asked for (CN-41, CN-44). */
export function MissingNotice({ order }: { order: Order }) {
  const { m, money } = useApp()
  if (order.missing.length === 0) return null
  const amounts = order.missing.map((v) => money(v)).join(m.detail.and)
  // A closed order, or a Paid one, owes nothing: no transfer is asked for (CN-44, CN-51).
  const closed = order.status === 'cancelled' || order.status === 'rejected' || owed(order) === 0
  return <Notice tone="chili">{closed ? m.detail.reportMissingClosed(amounts) : m.detail.reportMissing(amounts)}</Notice>
}

/** A pending refund, always shown to the shop, with how the customer wants it (CN-53, CN-54). */
export function PendingRefundNote({ order }: { order: Order }) {
  const { m, money } = useApp()
  const pending = order.refunds.filter((r) => r.refundedAt === null).reduce((n, r) => n + r.amount, 0)
  if (pending === 0) return null
  const how = !order.refundTo ? m.refunds.howNone : order.refundTo.kind === 'cash' ? m.refunds.howCash : m.refunds.howTransfer
  return (
    <p className="mt-2 rounded-md bg-chili-soft px-2 py-1 text-sm font-semibold text-chili">{m.refunds.pending(money(pending), how)}</p>
  )
}

/** "Refunded X by bank transfer / cash", or the pending state (CN-54). */
export function RefundState({ refund }: { refund: Refund }) {
  const { m, money } = useApp()
  if (!refund.refundedAt) return <span className="font-semibold text-chili">{m.refund.needsRefund}</span>
  return (
    <span className="text-muted">
      {m.refunds.by(money(refund.amount), m.refunds.method[refund.method ?? 'transfer'])} {m.refunds.at(refundTime(refund.refundedAt))}
    </span>
  )
}

/** A refund's time, the same everywhere: "08:00, 20/11". */
export const refundTime = (at: string): string => `${at.slice(11)}, ${dayMonth(at.slice(0, 10))}`
