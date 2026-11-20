'use client'

import { useState } from 'react'
import { Button, Card, PageTitle, Select } from '@/components/ui'
import { dayOrders, paymentState, startPreparing } from '@/proto/logic'
import { run } from '@/proto/store'
import type { PaymentState, Status } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { ShopDayBar, ShopOrderCard } from './common'

const STATUSES: Status[] = ['placed', 'confirmed', 'preparing', 'delivering', 'delivered', 'rejected', 'cancelled']
const PAYMENTS: PaymentState[] = ['unpaid', 'reported', 'underpaid', 'paid']

/** S-S6 Orders: filter; confirm, reject, payment received; start preparing several Shop confirmed orders (BR-24). */
export function ShopOrdersScreen() {
  const { s, m } = useApp()
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [building, setBuilding] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const all = dayOrders(s, s.shopDay)
  const shown = all.filter(
    (o) =>
      (!status || o.status === status) &&
      // "Reported" lists every order with an open report, also Paid, Cancelled or Rejected ones (CN-39, CN-47).
      (!payment ||
        (payment === 'reported'
          ? o.reports.length > 0
          : o.status !== 'rejected' && o.status !== 'cancelled' && paymentState(o) === payment)) &&
      (!building || o.buildingId === building),
  )
  // Only Shop confirmed orders can be selected (BR-24); drop any that moved on.
  const selected = picked.filter((id) => all.some((o) => o.id === id && o.status === 'confirmed'))

  return (
    <>
      <PageTitle title={m.nav.shopOrders} />
      <ShopDayBar />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select label={m.shop.filterStatus} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{m.shop.all}</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {m.status[st]}
            </option>
          ))}
        </Select>
        <Select label={m.shop.filterPayment} value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">{m.shop.all}</option>
          {PAYMENTS.map((p) => (
            <option key={p} value={p}>
              {m.payment[p]}
            </option>
          ))}
        </Select>
        <Select label={m.shop.filterBuilding} value={building} onChange={(e) => setBuilding(e.target.value)}>
          <option value="">{m.shop.all}</option>
          {s.buildings
            .filter((b) => all.some((o) => o.buildingId === b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
      </div>
      <p className="mb-3 text-sm text-muted">
        {m.shop.count(shown.length)} · {m.shop.selectHint}
      </p>
      {shown.length === 0 ? (
        <Card>
          <p>{m.shop.none}</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((o) => (
            <ShopOrderCard
              key={o.id}
              order={o}
              selectable={o.status === 'confirmed'}
              selected={selected.includes(o.id)}
              onSelect={(on) => setPicked(on ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
            />
          ))}
        </div>
      )}
      {selected.length > 0 && <StartBar ids={selected} onDone={() => setPicked([])} />}
    </>
  )
}

/** One tap moves each selected order to Preparing on its own; there is no whole-day button (BR-24). */
export function StartBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { m } = useApp()
  return (
    <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-xl bg-ink p-3 pl-4 text-white shadow-lg">
      <span className="font-semibold">{m.shop.selected(ids.length)}</span>
      <Button
        onClick={() => {
          if (run((st) => startPreparing(st, ids)).ok) onDone()
        }}
      >
        {m.shop.startPreparing}
      </Button>
    </div>
  )
}
