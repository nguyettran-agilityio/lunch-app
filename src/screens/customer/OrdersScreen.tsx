'use client'

import Link from 'next/link'
import { DayLabel, LinesSummary } from '@/components/parts'
import { Card, OrderBadges, PageTitle } from '@/components/ui'
import { findBuilding, orderTotal } from '@/proto/logic'
import { useApp } from '@/proto/useApp'

/** S-C8 My orders: by day, with status, payment state and refund state (BR-32). */
export function OrdersScreen() {
  const { s, m, money } = useApp()
  const mine = s.orders.filter((o) => o.customerId === s.me)
  const dates = [...new Set(mine.map((o) => o.date))].sort()

  return (
    <>
      <PageTitle title={m.orders.title} />
      {dates.length === 0 && (
        <Card>
          <p>{m.orders.empty}</p>
        </Card>
      )}
      <div className="flex flex-col gap-6">
        {dates.map((d) => (
          <section key={d}>
            <h2 className="mb-2 text-lg font-bold">
              <DayLabel date={d} long />
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {mine
                .filter((o) => o.date === d)
                .map((o) => (
                  <li key={o.id}>
                    <Link href={`/order?id=${o.id}`} className="block rounded-xl bg-card p-4 ring-1 ring-steel/70 hover:ring-2 hover:ring-leaf">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-bold tracking-wide">{o.code}</span>
                        <span className="text-lg font-bold">{money(orderTotal(o))}</span>
                      </div>
                      <LinesSummary lines={o.lines} />
                      <p className="mt-1 mb-3 text-sm text-muted">{findBuilding(s, o.buildingId)?.name}</p>
                      <OrderBadges order={o} />
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
