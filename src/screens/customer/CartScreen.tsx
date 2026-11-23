'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmptyArt, LineArt } from '@/components/art'
import { DayLabel, LineText } from '@/components/parts'
import { Button, Card, LinkButton, Notice, PageTitle, QtyStepper, TextInput } from '@/components/ui'
import { cutoffOf, dayState, findCustomer, lineTotal, linesTotal, placeOrder, setCartQty } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import type { DateStr } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { BuildingPicker } from './BuildingPicker'

/** S-C6 Cart and checkout: one cart per service day (BR-10, BR-11a, BR-12). */
export function CartScreen() {
  const { s, m } = useApp()
  const dates = Object.keys(s.carts)
    .filter((d) => (s.carts[d] ?? []).length > 0)
    .sort()

  return (
    <>
      <PageTitle title={m.cart.title} intro={m.cart.intro} />
      {dates.length === 0 ? (
        <Card className="flex flex-col items-start">
          <EmptyArt kind="cart" className="mb-2 w-48 text-ink" />
          <p className="mb-4 text-[15px]">{m.cart.empty}</p>
          <LinkButton href="/">{m.cart.goWeek}</LinkButton>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {dates.map((d) => (
            <DayCart key={d} date={d} />
          ))}
        </div>
      )}
    </>
  )
}

function DayCart({ date }: { date: DateStr }) {
  const { s, m, money } = useApp()
  const router = useRouter()
  const me = findCustomer(s, s.me)!
  const [buildingId, setBuildingId] = useState(me.buildingId)
  const [note, setNote] = useState('')
  const lines = s.carts[date] ?? []
  const state = dayState(s, date)

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold">
          <DayLabel date={date} long />
        </h2>
        <span className="text-sm text-muted">{m.day.cutoffAt(hhmm(cutoffOf(s, date)))}</span>
      </div>
      {state !== 'open' && (
        <div className="mb-3">
          <Notice tone="chili">{state === 'pastCutoff' ? m.errors.pastCutoff : m.errors.dayNotOpen}</Notice>
        </div>
      )}
      <ul className="divide-y divide-tray">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3 py-3">
            <LineArt dishId={l.kind === 'fixed' ? l.dishId : undefined} picks={l.kind === 'plate' ? l.picks : undefined} className="size-16 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0 basis-44 text-[15px] sm:flex-1">
                <LineText line={l} />
                <p className="text-sm text-muted">
                  {money(l.unitPrice)} × {l.qty} = <span className="font-semibold text-ink">{money(lineTotal(l))}</span>
                </p>
              </div>
              <QtyStepper value={l.qty} onChange={(v) => run((st) => setCartQty(st, date, l.id, v))} />
            </div>
          </li>
        ))}
      </ul>
      <LinkButton href={`/day?d=${date}`} variant="ghost" className="mt-1 -ml-3">
        + {m.cart.addMore}
      </LinkButton>

      <div className="mt-4 flex flex-col gap-3 border-t border-tray pt-4">
        <BuildingPicker id={`b-${date}`} value={buildingId} onChange={setBuildingId} />
        <TextInput label={m.cart.note} placeholder={m.cart.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p>
          <span className="text-sm text-muted">{m.cart.total} </span>
          <span className="font-display text-[26px] font-extrabold tracking-tight">{money(linesTotal(lines))}</span>
        </p>
        <Button
          onClick={() => {
            const r = run((st) => placeOrder(st, date, buildingId, note))
            if (r.ok) router.push(`/pay?id=${r.id}`)
          }}
          disabled={state !== 'open'}
        >
          {m.cart.place}
        </Button>
      </div>
    </Card>
  )
}
