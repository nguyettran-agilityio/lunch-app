'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { DayLabel, LinesSummary, PendingRefundNote } from '@/components/parts'
import { Button, ConfirmButton, OrderBadges, cx } from '@/components/ui'
import {
  beforeCutoff,
  canReject,
  confirmOrder,
  confirmPayment,
  customerRefundMethod,
  cutoffOf,
  dayOrders,
  dayState,
  findBuilding,
  findCustomer,
  isActive,
  markRefunded,
  orderTotal,
  owed,
  paymentState,
  rejectOrder,
  reportedTotal,
  reportNotReceived,
  toPay,
  week,
} from '@/proto/logic'
import { run, update } from '@/proto/store'
import { hhmm } from '@/proto/time'
import type { Order } from '@/proto/types'
import { useApp } from '@/proto/useApp'

/** Day chooser shared by the shop screens (prototype navigation). */
export function ShopDayBar() {
  const { s, m } = useApp()
  const cutoff = hhmm(cutoffOf(s, s.shopDay))
  return (
    <div className="mb-5">
      <div role="group" aria-label={m.shop.day} className="flex flex-wrap gap-1.5">
        {week(s).map((d) => {
          const n = dayOrders(s, d).length
          return (
            <button
              key={d}
              type="button"
              aria-pressed={s.shopDay === d}
              onClick={() => update((st) => ({ ...st, shopDay: d }))}
              className={cx(
                'min-h-10 rounded-lg px-3 text-sm font-semibold ring-1',
                s.shopDay === d ? 'bg-ink text-white ring-ink' : 'bg-card text-ink ring-steel hover:ring-leaf',
              )}
            >
              <DayLabel date={d} />
              {n > 0 && <span className="ml-1.5 opacity-70">({n})</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-muted">
        {/* Only days with a menu that are not closed take orders (BR-3). */}
        {dayState(s, s.shopDay) === 'closed'
          ? m.week.closed
          : dayState(s, s.shopDay) === 'noMenu'
            ? m.week.noMenu
            : beforeCutoff(s, s.shopDay)
              ? m.shop.beforeCutoff(cutoff)
              : m.shop.afterCutoff(cutoff)}
      </p>
    </div>
  )
}

/** One order with the shop's actions: confirm, reject, payment received (BR-19, BR-22, D20). */
export function ShopOrderCard({
  order,
  selectable,
  selected,
  onSelect,
  extra,
}: {
  order: Order
  selectable?: boolean
  selected?: boolean
  onSelect?: (on: boolean) => void
  extra?: ReactNode
}) {
  const { s, m, money } = useApp()
  const customer = findCustomer(s, order.customerId)
  const building = findBuilding(s, order.buildingId)
  const notApproved = building?.state !== 'approved'

  return (
    <article className={cx('rounded-xl bg-card p-4 ring-1', selected ? 'ring-2 ring-leaf' : 'ring-steel/70')}>
      <div className="flex gap-3">
        {selectable !== undefined && (
          <input
            type="checkbox"
            aria-label={`${m.shop.startPreparing} ${order.code}`}
            disabled={!selectable}
            checked={!!selected}
            onChange={(e) => onSelect?.(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[#2f6b3a] disabled:opacity-30"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {/* Every order opens its detail, whatever its day or status (CN-35). */}
            <Link href={`/shop/order?id=${order.id}`} className="font-bold tracking-wide text-leaf underline underline-offset-2">
              {order.code}
            </Link>
            <span className="text-lg font-bold">{money(orderTotal(order))}</span>
          </div>
          <p className="text-[15px] font-semibold">
            {customer?.name} <span className="font-normal text-muted">· {customer?.phone}</span>
          </p>
          <p className="text-sm text-muted">
            {building?.name}
            {notApproved && (
              <span className="font-semibold text-[#7a5104]"> ({building?.state === 'declined' ? m.buildings.declined : m.buildings.pending})</span>
            )}
            {order.note && ` · ${order.note}`}
          </p>
          <div className="my-2">
            <LinesSummary lines={order.lines} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <OrderBadges order={order} />
            {order.kept && <span className="text-xs font-semibold text-muted">{m.shop.kept}</span>}
          </div>
          {/* A pending refund never blocks the order, but is always shown (CN-53). */}
          <PendingRefundNote order={order} />
        </div>
      </div>
      <ShopOrderActions order={order} extra={extra} />
    </article>
  )
}

/** What the shop sees of a reported transfer it has not confirmed yet (CN-39, CN-42). */
export function ReportNote({ order }: { order: Order }) {
  const { m, money } = useApp()
  if (reportedTotal(order) === 0) return null
  const more = toPay(order)
  return (
    <p className="mt-2 text-sm font-semibold text-[#7a5104]">
      {/* A Paid order with a report still open: no "not confirmed 0" (CN-47). */}
      {isActive(order.status) && paymentState(order) === 'paid'
        ? m.shop.reportNotePaid(money(reportedTotal(order)))
        : isActive(order.status)
        ? m.shop.reportNote(money(owed(order)), money(reportedTotal(order)), more > 0 ? money(more) : null)
        : m.shop.reportNoteClosed(money(reportedTotal(order)))}
    </p>
  )
}

/** The shop's actions on one order: confirm, payment received, not received yet, reject (BR-19, BR-22, D20). */
export function ShopOrderActions({ order, extra }: { order: Order; extra?: ReactNode }) {
  const { s, m, money } = useApp()
  const building = findBuilding(s, order.buildingId)
  const notApproved = building?.state !== 'approved'
  // Money owed that the customer has not reported: the full amount owed without a report (CN-28),
  // or "the rest" next to open reports (CN-48). Reports are answered one by one below (CN-43).
  const due = toPay(order)
  return (
    <>
      <ReportNote order={order} />
      {/* Each report is answered on its own: exactly its amount, also on a closed order (CN-38, CN-39, CN-41, CN-43). */}
      {order.reports.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {order.reports.map((r) => (
            <li key={r.id} className="rounded-lg bg-turmeric-soft p-2">
              <p className="text-sm">{m.shop.reportLine(money(r.amount), r.at)}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => run((st) => confirmPayment(st, order.id, r.id))}>
                  {m.shop.confirmPay} · {money(r.amount)}
                </Button>
                <ConfirmButton
                  label={m.shop.notReceived}
                  question={m.shop.notReceivedConfirm(money(r.amount))}
                  onConfirm={() => run((st) => reportNotReceived(st, order.id, r.id))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === 'placed' && (
          <Button
            disabled={notApproved}
            title={notApproved ? m.shop.buildingPending : undefined}
            onClick={() => run((st) => confirmOrder(st, order.id))}
          >
            {m.shop.confirm}
          </Button>
        )}
        {due > 0 && (
          <Button variant="secondary" onClick={() => run((st) => confirmPayment(st, order.id))}>
            {order.reports.length > 0 ? m.shop.confirmRest : m.shop.confirmPay} · {money(due)}
          </Button>
        )}
        {extra}
        {canReject(order) && (
          <ConfirmButton label={m.shop.reject} question={m.shop.rejectConfirm} onConfirm={() => run((st) => rejectOrder(st, order.id))} />
        )}
      </div>
      {order.status === 'placed' && building?.state === 'pending' && <p className="mt-2 text-sm text-[#7a5104]">{m.shop.buildingPending}</p>}
    </>
  )
}

/** Mark a refund made, by bank transfer or cash; the customer's choice comes first (CN-54). */
export function MarkRefundedButtons({ order, refundId }: { order: Order; refundId: string }) {
  const { m } = useApp()
  const first = customerRefundMethod(order)
  const other = first === 'cash' ? 'transfer' : 'cash'
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => run((st) => markRefunded(st, order.id, refundId, first))}>{m.refunds.markAs(m.refunds.method[first])}</Button>
      <Button variant="secondary" onClick={() => run((st) => markRefunded(st, order.id, refundId, other))}>
        {m.refunds.markAs(m.refunds.method[other])}
      </Button>
    </div>
  )
}
