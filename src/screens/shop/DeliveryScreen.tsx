'use client'

import { useState } from 'react'
import { LinesSummary } from '@/components/parts'
import { Badge, Button, Card, OrderBadges, PageTitle, TextInput } from '@/components/ui'
import { deliveryList, findCustomer, markDelivered, markDelivering } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import type { Order } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { ShopDayBar } from './common'

/** S-S9 Delivery list: by building and delivery time; Delivering / Delivered per building or per order (BR-26, BR-27, CN-19). */
export function DeliveryScreen() {
  const { s, m } = useApp()
  const groups = deliveryList(s, s.shopDay)

  return (
    <>
      <PageTitle title={m.delivery.title} intro={m.delivery.intro} />
      <ShopDayBar />
      {groups.length === 0 && (
        <Card>
          <p>{m.delivery.empty}</p>
        </Card>
      )}
      <div className="flex flex-col gap-6">
        {groups.map(({ building, time, orders }) => {
          const cooking = orders.filter((o) => o.status === 'preparing').map((o) => o.id)
          const onTheWay = orders.filter((o) => o.status === 'delivering').map((o) => o.id)
          return (
            <section key={building.id} aria-labelledby={`b-${building.id}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-2">
                <div>
                  <h2 id={`b-${building.id}`} className="text-xl font-bold">
                    <span className="mr-2 text-leaf">{time !== null ? hhmm(time) : m.delivery.noTime}</span>
                    {building.name}
                  </h2>
                  <p className="text-sm text-muted">{building.address}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={cooking.length === 0} onClick={() => run((st) => markDelivering(st, cooking))}>
                    {m.delivery.startAll(cooking.length)}
                  </Button>
                  <Button disabled={onTheWay.length === 0} onClick={() => run((st) => markDelivered(st, onTheWay))}>
                    {m.delivery.deliveredAll(onTheWay.length)}
                  </Button>
                </div>
              </div>
              <ul className="grid gap-3 lg:grid-cols-2">
                {orders.map((o) => (
                  <DeliveryRow key={o.id} order={o} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

function DeliveryRow({ order }: { order: Order }) {
  const { s, m } = useApp()
  const [note, setNote] = useState('')
  const c = findCustomer(s, order.customerId)
  return (
    <li className="rounded-xl bg-card p-4 ring-1 ring-steel/70">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {c?.name} ·{' '}
          <a href={`tel:${c?.phone.replace(/\s/g, '')}`} className="text-leaf underline">
            {c?.phone}
          </a>
        </span>
        <span className="text-sm font-bold tracking-wide text-muted">{order.code}</span>
      </div>
      {order.note && <p className="text-sm font-semibold">{order.note}</p>}
      <div className="my-2">
        <LinesSummary lines={order.lines} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <OrderBadges order={order} />
        {order.status === 'confirmed' && <Badge tone="steel">{m.delivery.notCooked}</Badge>}
      </div>
      {order.shopNote && <p className="mt-2 text-sm text-muted">{order.shopNote}</p>}
      {order.status === 'preparing' && (
        <Button variant="secondary" className="mt-3" onClick={() => run((st) => markDelivering(st, [order.id]))}>
          {m.delivery.start}
        </Button>
      )}
      {order.status === 'delivering' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <TextInput label={m.delivery.note} value={note} onChange={(e) => setNote(e.target.value)} className="flex-1 basis-48" />
          <Button onClick={() => run((st) => markDelivered(st, [order.id], note))}>{m.delivery.delivered}</Button>
        </div>
      )}
    </li>
  )
}
