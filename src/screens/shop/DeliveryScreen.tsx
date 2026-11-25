'use client'

import Link from 'next/link'
import { useState } from 'react'
import { LinesSummary, PendingRefundNote } from '@/components/parts'
import { Badge, Button, Card, OrderBadges, PageTitle, TextInput } from '@/components/ui'
import { deliveryList, findCustomer, pendingRefund } from '@/domain/logic'
import { hhmm } from '@/domain/time'
import type { Order } from '@/domain/types'
import { useActions, useApp } from '@/screens/app'
import { ShopDayBar } from './common'

/** S-S9 Delivery list: by building and delivery time; Delivering / Delivered per building or per order (BR-26, BR-27, CN-19). */
export function DeliveryScreen() {
  const { s, m, shopDay } = useApp()
  const { markDelivering, markDelivered, pending } = useActions()
  const groups = deliveryList(s, shopDay)

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
                  <Button variant="secondary" disabled={pending || cooking.length === 0} onClick={() => markDelivering(cooking)}>
                    {m.delivery.startAll(cooking.length)}
                  </Button>
                  <Button disabled={pending || onTheWay.length === 0} onClick={() => markDelivered(onTheWay)}>
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
  const { s, m, money, href } = useApp()
  const { giveCashBack, markDelivering, markDelivered, pending } = useActions()
  const [note, setNote] = useState('')
  const c = findCustomer(s, order.customerId)
  // Cash to give back unless the customer asked for a bank transfer (CN-54).
  const cashDue = order.refundTo && order.refundTo.kind !== 'cash' ? 0 : pendingRefund(order)
  return (
    <li className="rounded-xl bg-card p-4 ring-1 ring-steel/70">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {c?.name} ·{' '}
          <a href={`tel:${c?.phone.replace(/\s/g, '')}`} className="text-leaf underline">
            {c?.phone}
          </a>
        </span>
        <Link href={href(`/shop/order?id=${order.id}`)} className="text-sm font-bold tracking-wide text-leaf underline underline-offset-2">
          {order.code}
        </Link>
      </div>
      {order.note && <p className="text-sm font-semibold">{order.note}</p>}
      <div className="my-2">
        <LinesSummary lines={order.lines} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <OrderBadges order={order} />
        {order.status === 'confirmed' && <Badge tone="steel">{m.delivery.notCooked}</Badge>}
      </div>
      {/* Pending refund: how much to give back, and how (CN-53, CN-54). */}
      <PendingRefundNote order={order} />
      {cashDue > 0 && (
        <Button variant="secondary" className="mt-2" disabled={pending} onClick={() => giveCashBack(order.id)}>
          {m.delivery.cashBack(money(cashDue))}
        </Button>
      )}
      {order.shopNote && <p className="mt-2 text-sm text-muted">{order.shopNote}</p>}
      {order.status === 'preparing' && (
        <Button variant="secondary" className="mt-3" disabled={pending} onClick={() => markDelivering([order.id])}>
          {m.delivery.start}
        </Button>
      )}
      {order.status === 'delivering' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <TextInput label={m.delivery.note} value={note} onChange={(e) => setNote(e.target.value)} className="flex-1 basis-48" />
          <Button disabled={pending} onClick={() => markDelivered([order.id], note)}>
            {m.delivery.delivered}
          </Button>
        </div>
      )}
    </li>
  )
}
