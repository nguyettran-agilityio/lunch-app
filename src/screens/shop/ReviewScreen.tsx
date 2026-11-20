'use client'

import { useState } from 'react'
import { Button, Notice, PageTitle } from '@/components/ui'
import { beforeCutoff, cutoffOf, keepOrder, matchesSearch, newestFirst, paymentState, reviewList } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import { useApp } from '@/proto/useApp'
import { OrderSearch, ShopDayBar, ShopOrderCard } from './common'

/** S-S7 Cutoff review: orders still Placed and orders not Paid; keep or reject each (BR-22, BR-23, CN-18). */
export function ReviewScreen() {
  const { s, m } = useApp()
  const cutoff = hhmm(cutoffOf(s, s.shopDay))
  const [query, setQuery] = useState('')
  const list = reviewList(s, s.shopDay)
  // Newest order first in each group; search within the selected day (CN-56).
  const found = newestFirst(s, list.filter((o) => matchesSearch(s, o, query)), (o) => o)
  const placed = found.filter((o) => o.status === 'placed')
  const unpaid = found.filter((o) => o.status !== 'placed')

  return (
    <>
      <PageTitle title={m.review.title} intro={m.review.intro} />
      <ShopDayBar />
      {beforeCutoff(s, s.shopDay) ? (
        <Notice>{m.review.notYet(cutoff)}</Notice>
      ) : list.length === 0 ? (
        <Notice tone="leaf">{m.review.done}</Notice>
      ) : (
        <div className="flex flex-col gap-6">
          <OrderSearch value={query} onChange={setQuery} />
          {found.length === 0 && <Notice>{m.shop.noMatch}</Notice>}
          {[
            { title: m.review.stillPlaced, orders: placed },
            { title: m.review.notPaid, orders: unpaid },
          ]
            .filter((g) => g.orders.length > 0)
            .map((g) => (
              <section key={g.title}>
                <h2 className="mb-2 text-lg font-bold">
                  {g.title} <span className="text-muted">({g.orders.length})</span>
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {g.orders.map((o) => (
                    <ShopOrderCard
                      key={o.id}
                      order={o}
                      extra={
                        // A Placed order is decided by confirming or rejecting it; an unpaid one can be kept.
                        o.status !== 'placed' && paymentState(o) !== 'paid' ? (
                          <Button variant="secondary" onClick={() => run((st) => keepOrder(st, o.id))}>
                            {m.shop.keep}
                          </Button>
                        ) : null
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  )
}
