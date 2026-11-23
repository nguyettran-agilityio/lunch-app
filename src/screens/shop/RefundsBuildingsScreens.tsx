'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DayLabel, RefundToView, refundTime } from '@/components/parts'
import { Badge, Button, Card, ConfirmButton, PageTitle, TextInput } from '@/components/ui'
import {
  addBuilding,
  approveBuilding,
  declineBuilding,
  declinePreview,
  findCustomer,
  isActive,
  matchesSearch,
  newestFirst,
  refundList,
  setDeliveryTime,
} from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm, parseHhmm } from '@/proto/time'
import type { Building } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { MarkRefundedButtons, OrderSearch } from './common'

/** S-S10 Refunds: Needs refund with amount, reason, customer phone; mark Refunded (BR-21). */
export function RefundsScreen() {
  const { s, m, money } = useApp()
  const [query, setQuery] = useState('')
  // Every day, newest order first, filtered by the search box (CN-56).
  const all = newestFirst(
    s,
    refundList(s).filter((x) => matchesSearch(s, x.order, query)),
    (x) => x.order,
  )
  const open = all.filter((x) => x.refund.refundedAt === null)
  const anyPending = refundList(s).some((x) => x.refund.refundedAt === null)
  const done = all.filter((x) => x.refund.refundedAt !== null)

  return (
    <>
      <PageTitle title={m.refunds.title} intro={m.refunds.intro} />
      <OrderSearch value={query} onChange={setQuery} />
      {/* A search with no result says so; "nothing to refund" only when no refund is pending at all (CN-57). */}
      {query.trim() !== '' && all.length === 0 ? (
        <Card>
          <p>{m.shop.noMatch}</p>
        </Card>
      ) : (
        !anyPending && (
          <Card>
            <p>{m.refunds.empty}</p>
          </Card>
        )
      )}
      {open.length > 0 && <h2 className="mb-2 text-lg font-bold">{m.refunds.pendingSection}</h2>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {open.map(({ order, refund }) => {
          const c = findCustomer(s, order.customerId)
          return (
            <li key={refund.id} className="rounded-xl bg-card p-4 ring-1 ring-chili/30">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-chili">{money(refund.amount)}</span>
                <Link
                  href={`/shop/order?id=${order.id}`}
                  className="text-sm font-bold tracking-wide text-leaf underline underline-offset-2"
                >
                  {order.code}
                </Link>
              </div>
              <p className="font-semibold">
                {c?.name} · {c?.phone}
              </p>
              <p className="mb-3 text-sm text-muted">
                {m.reason[refund.reason]} · <DayLabel date={order.date} />
              </p>
              {/* Where to send it, as entered by the customer; the shop can mark it refunded either way (CN-33). */}
              <div className="mb-3">
                {order.refundTo ? (
                  <RefundToView to={order.refundTo} />
                ) : (
                  <p className="text-sm font-semibold text-turmeric-ink">{m.refunds.noDestination}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <MarkRefundedButtons order={order} refundId={refund.id} />
                <Link
                  href={`/shop/order?id=${order.id}`}
                  className="inline-flex min-h-11 items-center rounded-lg px-4 text-[15px] font-semibold text-leaf hover:bg-leaf-soft"
                >
                  {m.refunds.openOrder}
                </Link>
              </div>
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
                  <Link href={`/shop/order?id=${order.id}`} className="font-semibold text-leaf underline underline-offset-2">
                    {order.code}
                  </Link>{' '}
                  · {findCustomer(s, order.customerId)?.name} · {m.reason[refund.reason]}
                </span>
                <span className="font-semibold">
                  {m.refunds.by(money(refund.amount), m.refunds.method[refund.method ?? 'transfer'])}{' '}
                  <span className="font-normal text-muted">{m.refunds.at(refundTime(refund.refundedAt!))}</span>
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
      <AddBuilding />
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

/** "Add building": name, address and delivery time; approved at once (CN-61). */
function AddBuilding() {
  const { m } = useApp()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [time, setTime] = useState('11:30')
  const minutes = parseHhmm(time)
  return (
    <section className="mb-8">
      <Card>
        <h2 className="mb-2 font-bold">{m.buildings.add}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <TextInput label={m.buildings.addName} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label={m.buildings.addAddress} value={address} onChange={(e) => setAddress(e.target.value)} />
          <TextInput label={m.buildings.deliveryTime} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
          <Button
            disabled={minutes === null || !name.trim()}
            onClick={() => {
              if (run((st) => addBuilding(st, name, address, minutes!)).ok) {
                setName('')
                setAddress('')
              }
            }}
          >
            {m.buildings.addSave}
          </Button>
        </div>
      </Card>
    </section>
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
            <DeclineButton building={b} />
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

/** Declining shows the orders that will be rejected and each refund before anything changes (CN-26). */
function DeclineButton({ building: b }: { building: Building }) {
  const { s, m, money } = useApp()
  const preview = declinePreview(s, b.id)
  const total = preview.reduce((sum, p) => sum + p.refund, 0)
  return (
    <ConfirmButton
      label={m.buildings.decline}
      question={preview.length > 0 ? m.buildings.declineConfirm : m.buildings.declineNone}
      onConfirm={() => run((st) => declineBuilding(st, b.id))}
    >
      {preview.length > 0 && (
        <div className="w-full text-sm text-ink">
          <ul className="mb-1 divide-y divide-chili/20">
            {preview.map(({ order, refund, reported }) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2 py-1">
                <span>
                  <Link href={`/shop/order?id=${order.id}`} className="font-bold tracking-wide text-leaf underline underline-offset-2">
                    {order.code}
                  </Link>{' '}
                  · {findCustomer(s, order.customerId)?.name} · <DayLabel date={order.date} />
                </span>
                <span className={refund > 0 ? 'font-semibold text-chili' : 'text-muted'}>
                  {m.buildings.declineRefund(money(refund))}
                  {refund === 0 && reported === 0 && ` (${m.buildings.declineNoRefund})`}
                </span>
                {/* Reported but not confirmed: refunded only once the shop confirms it received it (CN-39). */}
                {reported > 0 && (
                  <span className="w-full text-right font-semibold text-turmeric-ink">{m.buildings.declineReported(money(reported))}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="font-semibold">{m.buildings.declineTotal(preview.length, money(total))}</p>
        </div>
      )}
    </ConfirmButton>
  )
}
