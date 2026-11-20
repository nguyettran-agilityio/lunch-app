'use client'

import type { ReactNode } from 'react'
import { DayLabel, LinesSummary } from '@/components/parts'
import { Button, ConfirmButton, OrderBadges, cx } from '@/components/ui'
import {
  beforeCutoff,
  canReject,
  confirmOrder,
  confirmPayment,
  cutoffOf,
  dayOrders,
  dayState,
  findBuilding,
  findCustomer,
  orderTotal,
  owed,
  rejectOrder,
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
  const due = owed(order)

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
            <span className="font-bold tracking-wide">{order.code}</span>
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
        </div>
      </div>
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
            {m.shop.confirmPay} · {money(due)}
          </Button>
        )}
        {extra}
        {canReject(order) && (
          <ConfirmButton label={m.shop.reject} question={m.shop.rejectConfirm} onConfirm={() => run((st) => rejectOrder(st, order.id))} />
        )}
      </div>
      {order.status === 'placed' && building?.state === 'pending' && <p className="mt-2 text-sm text-[#7a5104]">{m.shop.buildingPending}</p>}
    </article>
  )
}
