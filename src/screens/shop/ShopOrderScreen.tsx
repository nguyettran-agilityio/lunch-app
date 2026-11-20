'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { DayLabel, LinesList, OrderHistory, RefundToView } from '@/components/parts'
import { Button, Card, OrderBadges, PageTitle } from '@/components/ui'
import { findBuilding, findCustomer, markRefunded, netPaid, orderTotal, owed, startPreparing } from '@/proto/logic'
import { run } from '@/proto/store'
import { useApp } from '@/proto/useApp'
import { ShopOrderActions } from './common'

/** S-S11 Order detail for the shop: any order of any day, including Cancelled and Rejected (CN-35). */
export function ShopOrderScreen() {
  const id = useSearchParams().get('id') ?? ''
  const { s, m, money } = useApp()
  const router = useRouter()
  const order = s.orders.find((o) => o.id === id)
  if (!order) return <PageTitle title={m.detail.notFound} />

  const customer = findCustomer(s, order.customerId)
  const due = owed(order)

  return (
    <>
      {/* Back to whichever shop screen opened the order. */}
      <button type="button" onClick={() => router.back()} className="mb-3 inline-block text-[15px] font-semibold text-leaf">
        ← {m.shop.back}
      </button>
      <PageTitle title={m.detail.title(order.code)}>
        <OrderBadges order={order} />
      </PageTitle>
      <p className="-mt-3 mb-5 text-[15px] text-muted">
        <DayLabel date={order.date} long />
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-1 font-bold">{m.detail.lines}</h2>
            <LinesList lines={order.lines} />
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-tray pt-3 text-[15px]">
              <dt className="text-muted">{m.detail.total}</dt>
              <dd className="text-right text-lg font-bold">{money(orderTotal(order))}</dd>
              <dt className="text-muted">{m.detail.paid}</dt>
              <dd className="text-right">{money(Math.max(0, netPaid(order)))}</dd>
              {due > 0 && (
                <>
                  <dt className="font-semibold text-chili">{m.detail.owed}</dt>
                  <dd className="text-right font-semibold text-chili">{money(due)}</dd>
                </>
              )}
              <dt className="text-muted">{m.shop.customer}</dt>
              <dd className="text-right">
                {customer?.name} ·{' '}
                <a href={`tel:${customer?.phone.replace(/\s/g, '')}`} className="text-leaf underline">
                  {customer?.phone}
                </a>
              </dd>
              <dt className="text-muted">{m.detail.building}</dt>
              <dd className="text-right">{findBuilding(s, order.buildingId)?.name}</dd>
              {order.note && (
                <>
                  <dt className="text-muted">{m.detail.note}</dt>
                  <dd className="text-right">{order.note}</dd>
                </>
              )}
              {order.shopNote && (
                <>
                  <dt className="text-muted">{m.detail.shopNote}</dt>
                  <dd className="text-right">{order.shopNote}</dd>
                </>
              )}
              {order.kept && (
                <>
                  <dt className="text-muted">{m.nav.review}</dt>
                  <dd className="text-right">{m.shop.kept}</dd>
                </>
              )}
            </dl>
            {/* The same actions as on the Orders screen, including start preparing (S-S11, BR-24). */}
            <ShopOrderActions
              order={order}
              extra={
                order.status === 'confirmed' ? (
                  <Button variant="secondary" onClick={() => run((st) => startPreparing(st, [order.id]))}>
                    {m.shop.startPreparing}
                  </Button>
                ) : null
              }
            />
          </Card>

          {order.refunds.length > 0 && (
            <Card>
              <h2 className="mb-2 font-bold">{m.detail.refunds}</h2>
              <ul className="flex flex-col gap-2 text-[15px]">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {money(r.amount)} · {m.reason[r.reason]}
                    </span>
                    {r.refundedAt ? (
                      <span className="text-muted">
                        {m.refund.refunded} {m.refunds.at(r.refundedAt)}
                      </span>
                    ) : (
                      <Button onClick={() => run((st) => markRefunded(st, order.id, r.id))}>{m.refunds.mark}</Button>
                    )}
                  </li>
                ))}
              </ul>
              {/* Where the money goes, also kept after it is marked Refunded (CN-33). */}
              {order.refundTo ? (
                <div className="mt-3 border-t border-tray pt-3">
                  <RefundToView to={order.refundTo} />
                </div>
              ) : (
                order.refunds.some((r) => r.refundedAt === null) && (
                  <p className="mt-3 border-t border-tray pt-3 text-sm font-semibold text-[#7a5104]">{m.refunds.noDestination}</p>
                )
              )}
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-3 font-bold">{m.detail.history}</h2>
          <OrderHistory history={order.history} />
        </Card>
      </div>
    </>
  )
}
