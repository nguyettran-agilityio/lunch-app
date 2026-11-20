'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { DayLabel, LineText, LinesList } from '@/components/parts'
import { Button, Card, ConfirmButton, LinkButton, Notice, OrderBadges, PageTitle, QtyStepper, TextInput } from '@/components/ui'
import {
  cancelOrder,
  customerChangeBlock,
  editOrder,
  findBuilding,
  findDay,
  findDish,
  linesTotal,
  netPaid,
  orderTotal,
  owed,
} from '@/proto/logic'
import { run } from '@/proto/store'
import type { Line, Order } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { BuildingPicker } from './BuildingPicker'

/** S-C9 Order detail: lines, total, building, history; edit and cancel before the cutoff while not Preparing. */
export function OrderScreen() {
  const id = useSearchParams().get('id') ?? ''
  const { s, m, money } = useApp()
  const [editing, setEditing] = useState(false)
  const order = s.orders.find((o) => o.id === id && o.customerId === s.me)
  if (!order) return <PageTitle title={m.detail.notFound} />

  const block = customerChangeBlock(s, order)
  const due = owed(order)

  return (
    <>
      <PageTitle title={m.detail.title(order.code)}>
        <OrderBadges order={order} />
      </PageTitle>
      <p className="-mt-3 mb-5 text-[15px] text-muted">
        <DayLabel date={order.date} long />
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {editing ? (
            <EditOrder order={order} onDone={() => setEditing(false)} />
          ) : (
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
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {due > 0 && <LinkButton href={`/pay?id=${order.id}`}>{m.detail.pay}</LinkButton>}
                {!block && (
                  <>
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                      {m.detail.edit}
                    </Button>
                    <LinkButton href={`/plate?order=${order.id}`} variant="secondary">
                      + {m.detail.addPlate}
                    </LinkButton>
                    <ConfirmButton label={m.detail.cancel} question={m.detail.cancelConfirm} onConfirm={() => run((st) => cancelOrder(st, order.id))} />
                  </>
                )}
              </div>
              {block === 'pastCutoff' && (
                <div className="mt-4">
                  <Notice tone="chili">{m.detail.lockedCutoff}</Notice>
                </div>
              )}
              {block === 'preparing' && (
                <div className="mt-4">
                  <Notice>{m.detail.lockedPreparing}</Notice>
                </div>
              )}
            </Card>
          )}

          {order.refunds.length > 0 && (
            <Card>
              <h2 className="mb-2 font-bold">{m.detail.refunds}</h2>
              <ul className="flex flex-col gap-1.5 text-[15px]">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {money(r.amount)} · {m.reason[r.reason]}
                    </span>
                    <span className={r.refundedAt ? 'text-muted' : 'font-semibold text-chili'}>
                      {r.refundedAt ? `${m.refund.refunded} ${m.refunds.at(r.refundedAt.slice(11))}` : m.refund.needsRefund}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-3 font-bold">{m.detail.history}</h2>
          <ol className="relative ml-1.5 flex flex-col gap-3 border-l-2 border-steel pl-4">
            {order.history.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[23px] size-3 rounded-full bg-leaf ring-2 ring-card" />
                <p className="font-semibold">{m.status[h.status]}</p>
                <p className="text-sm text-muted">{h.at}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  )
}

function EditOrder({ order, onDone }: { order: Order; onDone: () => void }) {
  const { s, m, money } = useApp()
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>(order.lines)
  const [buildingId, setBuildingId] = useState(order.buildingId)
  const [note, setNote] = useState(order.note)
  const fixed = findDay(s, order.date)?.menu?.fixed ?? []
  const changed =
    buildingId !== order.buildingId ||
    note.trim() !== order.note ||
    JSON.stringify(lines.filter((l) => l.qty > 0)) !== JSON.stringify(order.lines)
  const setQty = (id: string, qty: number) => setLines(lines.map((l) => (l.id === id ? { ...l, qty } : l)))
  const addFixed = (dishId: string) => {
    const existing = lines.find((l) => l.kind === 'fixed' && l.dishId === dishId)
    if (existing) return setQty(existing.id, existing.qty + 1)
    // A newly added dish takes today's price; existing lines keep theirs (BR-6).
    setLines([...lines, { id: `new-${dishId}-${lines.length}`, kind: 'fixed', dishId, qty: 1, unitPrice: findDish(s, dishId)?.price ?? 0 }])
  }

  return (
    <Card>
      <h2 className="mb-1 font-bold">{m.detail.edit}</h2>
      <div className="mb-3">
        <Notice>{m.detail.editNote}</Notice>
      </div>
      <ul className="divide-y divide-tray">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 basis-48 text-[15px]">
              <LineText line={l} />
              <p className="text-sm text-muted">{money(l.unitPrice)}</p>
            </div>
            <QtyStepper value={l.qty} onChange={(v) => setQty(l.id, v)} />
          </li>
        ))}
      </ul>
      <p className="mt-4 mb-2 text-sm font-medium text-muted">{m.detail.addDish}</p>
      <div className="flex flex-wrap gap-2">
        {fixed.map((id) => (
          <Button key={id} variant="secondary" onClick={() => addFixed(id)}>
            + {findDish(s, id)?.name}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-tray pt-4">
        <BuildingPicker id={`edit-${order.id}`} value={buildingId} onChange={setBuildingId} />
        <TextInput label={m.cart.note} placeholder={m.cart.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="text-sm text-muted">{m.cart.total} </span>
          <span className="text-2xl font-bold">{money(linesTotal(lines.filter((l) => l.qty > 0)))}</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            {m.detail.discard}
          </Button>
          <Button
            // Saving without a change is not an edit and must not send the order back to Placed (BR-14).
            disabled={!changed}
            onClick={() => {
              const r = run((st) => editOrder(st, order.id, lines, buildingId, note))
              if (!r.ok) return
              onDone()
              const after = r.state.orders.find((o) => o.id === order.id)
              if (after && owed(after) > 0 && netPaid(after) > 0) router.push(`/pay?id=${order.id}`)
            }}
          >
            {m.detail.save}
          </Button>
        </div>
      </div>
    </Card>
  )
}
