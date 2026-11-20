'use client'

import { useState } from 'react'
import { DayLabel } from '@/components/parts'
import { Badge, Button, Card, ConfirmButton, PageTitle, TextInput } from '@/components/ui'
import { approveBuilding, declineBuilding, findCustomer, isActive, markRefunded, refundList, setDeliveryTime } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm, parseHhmm } from '@/proto/time'
import type { Building } from '@/proto/types'
import { useApp } from '@/proto/useApp'

/** S-S10 Refunds: Needs refund with amount, reason, customer phone; mark Refunded (BR-21). */
export function RefundsScreen() {
  const { s, m, money } = useApp()
  const all = refundList(s)
  const open = all.filter((x) => x.refund.refundedAt === null)
  const done = all.filter((x) => x.refund.refundedAt !== null)

  return (
    <>
      <PageTitle title={m.refunds.title} intro={m.refunds.intro} />
      {open.length === 0 && (
        <Card>
          <p>{m.refunds.empty}</p>
        </Card>
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {open.map(({ order, refund }) => {
          const c = findCustomer(s, order.customerId)
          return (
            <li key={refund.id} className="rounded-xl bg-card p-4 ring-1 ring-chili/30">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-chili">{money(refund.amount)}</span>
                <span className="text-sm font-bold tracking-wide text-muted">{order.code}</span>
              </div>
              <p className="font-semibold">
                {c?.name} · {c?.phone}
              </p>
              <p className="mb-3 text-sm text-muted">
                {m.reason[refund.reason]} · <DayLabel date={order.date} />
              </p>
              <Button onClick={() => run((st) => markRefunded(st, order.id, refund.id))}>{m.refunds.mark}</Button>
            </li>
          )
        })}
      </ul>
      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">{m.refunds.done}</h2>
          <ul className="divide-y divide-tray rounded-xl bg-card px-4 ring-1 ring-steel/70">
            {done.map(({ order, refund }) => (
              <li key={refund.id} className="flex flex-wrap justify-between gap-2 py-3 text-[15px]">
                <span>
                  {order.code} · {findCustomer(s, order.customerId)?.name} · {m.reason[refund.reason]}
                </span>
                <span className="font-semibold">
                  {money(refund.amount)} <span className="font-normal text-muted">{m.refunds.at(refund.refundedAt!)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** S-S5 Buildings: approved ones with delivery times; pending ones to approve or decline (BR-16 – BR-18). */
export function BuildingsScreen() {
  const { s, m } = useApp()
  const pending = s.buildings.filter((b) => b.state === 'pending')
  const approved = s.buildings.filter((b) => b.state === 'approved').sort((a, b) => (a.deliveryTime ?? 0) - (b.deliveryTime ?? 0))
  const declined = s.buildings.filter((b) => b.state === 'declined')

  return (
    <>
      <PageTitle title={m.buildings.title} intro={m.buildings.timeNote} />
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-bold">
            {m.buildings.pending} <span className="text-muted">({pending.length})</span>
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((b) => (
              <BuildingCard key={b.id} building={b} />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-lg font-bold">{m.buildings.approved}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {approved.map((b) => (
            <BuildingCard key={b.id} building={b} />
          ))}
        </div>
      </section>
      {declined.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">{m.buildings.declined}</h2>
          <ul className="text-[15px] text-muted">
            {declined.map((b) => (
              <li key={b.id}>
                {b.name} · {b.address}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function BuildingCard({ building: b }: { building: Building }) {
  const { s, m } = useApp()
  const [time, setTime] = useState(b.deliveryTime !== null ? hhmm(b.deliveryTime) : '11:30')
  const minutes = parseHhmm(time)
  const waiting = s.orders.filter((o) => o.buildingId === b.id && isActive(o.status) && o.status === 'placed').length
  const proposer = b.proposedBy ? findCustomer(s, b.proposedBy)?.name : null

  return (
    <Card className={b.state === 'pending' ? 'ring-turmeric/50' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold">{b.name}</p>
          <p className="text-sm text-muted">{b.address}</p>
          {b.state === 'pending' && proposer && <p className="mt-1 text-sm">{m.buildings.proposedBy(proposer)}</p>}
        </div>
        {b.state === 'pending' && waiting > 0 && <Badge tone="turmeric">{m.buildings.orders(waiting)}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <TextInput label={m.buildings.deliveryTime} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
        {b.state === 'pending' ? (
          <>
            <Button disabled={minutes === null} onClick={() => run((st) => approveBuilding(st, b.id, minutes!))}>
              {m.buildings.approve}
            </Button>
            <ConfirmButton label={m.buildings.decline} question={m.buildings.declineConfirm} onConfirm={() => run((st) => declineBuilding(st, b.id))} />
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={minutes === null || minutes === b.deliveryTime}
            onClick={() => run((st) => setDeliveryTime(st, b.id, minutes!))}
          >
            {m.buildings.save}
          </Button>
        )}
      </div>
    </Card>
  )
}
