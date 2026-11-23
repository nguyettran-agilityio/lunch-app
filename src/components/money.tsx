'use client'

import { isActive, netPaid, owed, paymentState, refundState, reportedTotal, toPay } from '@/proto/logic'
import type { Order } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { cx } from './ui'

type Tone = 'leaf' | 'turmeric' | 'chili' | 'muted'
/** Whose screen the block is on: the shop's Order detail uses its own wording (UI10). */
type Side = 'customer' | 'shop'

const toneText: Record<Tone, string> = {
  leaf: 'text-leaf',
  turmeric: 'text-turmeric-ink',
  chili: 'text-chili',
  muted: 'text-muted',
}
const toneFill: Record<Tone, string> = {
  leaf: 'bg-leaf',
  turmeric: 'bg-turmeric',
  chili: 'bg-chili',
  muted: 'bg-muted',
}

/**
 * The money state of an order at a glance (docs/design.md, UI1, UI3–UI5). It only shows states the spec
 * defines (spec 4.2, 4.3): a 3-stop bar for the payment state of an active order, a 2-stop bar for a refund,
 * and for a Cancelled or Rejected order only the refund bar or one line.
 */
export function MoneyState({ order, side = 'customer' }: { order: Order; side?: Side }) {
  const { m } = useApp()
  const active = isActive(order.status)
  const refund = refundState(order)
  return (
    <section aria-label={m.money.label} data-testid="money-state" className="flex flex-col gap-3">
      {active && <PaymentBar order={order} side={side} />}
      {refund !== 'none' && <RefundBar order={order} side={side} />}
      {!active && refund === 'none' && <ClosedLine order={order} side={side} />}
    </section>
  )
}

function PaymentBar({ order, side }: { order: Order; side: Side }) {
  const { m, money } = useApp()
  const w = side === 'shop' ? m.money.shop : m.money
  const pay = paymentState(order)
  // Stop 1 Unpaid, 2 Transfer reported, 3 Shop received; Underpaid stays at stop 3 half filled, red (UI4).
  const at = pay === 'unpaid' ? 0 : pay === 'reported' ? 1 : 2
  const tone: Tone = pay === 'paid' ? 'leaf' : pay === 'reported' ? 'turmeric' : 'chili'
  const half = pay === 'underpaid'
  const headline =
    pay === 'unpaid'
      ? w.unpaid(money(owed(order)))
      : pay === 'reported'
        ? w.reported(money(reportedTotal(order)))
        : pay === 'paid'
          ? w.paid
          : w.underpaid(money(owed(order)))
  const more = pay === 'reported' ? toPay(order) : 0
  // Reported after part of the money was received: say what the shop holds (UI9).
  const held = pay === 'reported' ? netPaid(order) : 0
  // Paid with a report still open: the report is said inside the block (UI7, CN-47).
  const openReport = pay === 'paid' ? reportedTotal(order) : 0
  // The shop's bar has its own stop labels (UI14).
  const stops = [w.stops.unpaid, w.stops.reported, w.stops.received]
  return (
    <div data-state={pay} className="rounded-2xl bg-card p-4 ring-1 ring-steel/70">
      <div className="flex items-center gap-3">
        <Coin tone={tone} half={half} />
        <div className="min-w-0">
          <p className={cx('font-display text-[22px] leading-tight font-bold tracking-tight', toneText[tone])}>{headline}</p>
          {more > 0 && <p className="text-[15px] font-semibold text-chili">{w.stillToTransfer(money(more))}</p>}
          {held > 0 && <p className="text-[15px] text-muted">{w.received(money(held))}</p>}
          {openReport > 0 && (
            <p className="text-[15px] font-semibold text-turmeric-ink">
              {(side === 'shop' ? m.money.shop : m.money).reportOpen(money(openReport))}
            </p>
          )}
        </div>
      </div>
      <Stops labels={stops} at={at} tone={tone} half={half} />
    </div>
  )
}

function RefundBar({ order, side }: { order: Order; side: Side }) {
  const { m, money } = useApp()
  // A closed order with a report still open says so inside the block (UI8, CN-39).
  const openReport = isActive(order.status) ? 0 : reportedTotal(order)
  const state = refundState(order)
  const pending = order.refunds.filter((r) => r.refundedAt === null).reduce((n, r) => n + r.amount, 0)
  const done = order.refunds.filter((r) => r.refundedAt !== null)
  const tone: Tone = state === 'refunded' ? 'leaf' : 'chili'
  // Every line of the shop's block uses the shop's wording (UI10, UI12).
  const shop = side === 'shop'
  return (
    <div data-state={state} className="rounded-2xl bg-card p-4 ring-1 ring-steel/70">
      <p className="text-sm font-semibold text-muted">{m.money.refundLabel}</p>
      <div className="mt-1 flex items-center gap-3">
        <Coin tone={tone} back />
        <div className="min-w-0">
          {pending > 0 && (
            <p className="font-display text-[22px] leading-tight font-bold tracking-tight text-chili">
              {(shop ? m.money.shop : m.money).needs(money(pending))}
            </p>
          )}
          {done.map((r) => (
            <p
              key={r.id}
              className={cx(
                pending > 0 ? 'text-[15px] text-muted' : 'font-display text-[22px] leading-tight font-bold tracking-tight text-leaf',
              )}
            >
              {(shop ? m.money.shop.refunded : m.refunds.by)(money(r.amount), m.refunds.method[r.method ?? 'transfer'])}
            </p>
          ))}
          {openReport > 0 && (
            <p className="text-[15px] font-semibold text-turmeric-ink">
              {shop ? m.money.shop.reported(money(openReport)) : m.money.reported(money(openReport))}
            </p>
          )}
        </div>
      </div>
      <Stops
        labels={[(shop ? m.money.shop : m.money).refundStops.needs, (shop ? m.money.shop : m.money).refundStops.done]}
        at={state === 'refunded' ? 1 : 0}
        tone={tone}
      />
    </div>
  )
}

function ClosedLine({ order, side }: { order: Order; side: Side }) {
  const { m, money } = useApp()
  // A transfer reported on a closed order is still waiting for the shop (CN-39): say so instead of "nothing".
  const reported = reportedTotal(order)
  return (
    <p data-state="closed" className="rounded-2xl bg-tray px-4 py-3 text-[15px] font-semibold text-muted">
      {side === 'shop'
        ? reported > 0
          ? m.money.shop.reported(money(reported))
          : m.money.shop.nothing
        : reported > 0
          ? m.money.reported(money(reported))
          : m.money.nothing}
    </p>
  )
}

/** Stops on a line; the stops reached are filled in the state's colour, the current one is ringed. */
function Stops({ labels, at, tone, half = false }: { labels: string[]; at: number; tone: Tone; half?: boolean }) {
  return (
    <ol className="mt-4 grid" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((label, i) => {
        const reached = i <= at
        const current = i === at
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cx('absolute top-[9px] right-1/2 h-1 w-full rounded-full', reached ? toneFill[tone] : 'bg-steel')}
              />
            )}
            <span
              aria-hidden
              className={cx(
                'relative z-10 grid size-[22px] place-items-center rounded-full ring-4 ring-card',
                reached ? toneFill[tone] : 'bg-steel',
                current && 'outline-2 outline-offset-2',
                current && toneText[tone],
              )}
              style={current ? { outlineStyle: 'solid', outlineColor: 'currentColor' } : undefined}
            >
              {current && half && <span className="size-full rounded-full bg-[linear-gradient(90deg,transparent_50%,var(--card)_50%)]" />}
            </span>
            <span
              className={cx(
                'mt-2 text-[13px] leading-tight',
                current ? cx('font-bold', toneText[tone]) : reached ? 'text-ink' : 'text-muted',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** A coin that takes the state's colour; "back" turns its arrow round for a refund. */
function Coin({ tone, half = false, back = false }: { tone: Tone; half?: boolean; back?: boolean }) {
  return (
    <svg viewBox="0 0 44 44" aria-hidden className={cx('size-11 shrink-0', toneText[tone])}>
      <circle cx={22} cy={22} r={20} fill="currentColor" opacity={0.16} />
      <circle cx={22} cy={22} r={15} fill="none" stroke="currentColor" strokeWidth={3} strokeDasharray={half ? '47 47' : undefined} />
      {back ? (
        <path
          d="M27 16 h-8 a6 6 0 0 0 0 12 h6 M19 16 l3 -3 M19 16 l3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <text x={22} y={28} textAnchor="middle" fontSize={17} fontWeight={800} fill="currentColor">
          ₫
        </text>
      )}
    </svg>
  )
}
