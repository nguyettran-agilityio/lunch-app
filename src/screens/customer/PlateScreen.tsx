'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { DayLabel } from '@/components/parts'
import { Button, Notice, QtyStepper, cx } from '@/components/ui'
import {
  addPlateToOrder,
  addToCart,
  customerChangeBlock,
  dayState,
  findDay,
  findDish,
  groupCounts,
  netPaid,
  owed,
  platePrice,
  plateValid,
} from '@/proto/logic'
import { run } from '@/proto/store'
import { useApp } from '@/proto/useApp'

/** S-C5 Plate builder: groups with min/max/included, live price, blocks invalid plates (BR-7 – BR-9). */
export function PlateScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const { s, m, money } = useApp()
  // With ?order=<id> the plate is added to an order already placed (CN-23) instead of the cart.
  const order = s.orders.find((o) => o.id === params.get('order') && o.customerId === s.me)
  const date = order?.date ?? params.get('d') ?? ''
  const back = order ? `/order?id=${order.id}` : `/day?d=${date}`
  const [picks, setPicks] = useState<string[]>([])
  const [qty, setQty] = useState(1)
  const day = findDay(s, date)
  const components = day?.menu?.components ?? []
  const counts = groupCounts(s, picks)
  const price = platePrice(s, picks)
  const valid = plateValid(s, date, picks)
  const open = order ? customerChangeBlock(s, order) === null : dayState(s, date) === 'open'

  const toggle = (dishId: string, groupId: string) => {
    const g = s.groups.find((x) => x.id === groupId)!
    if (picks.includes(dishId)) return setPicks(picks.filter((p) => p !== dishId))
    const inGroup = picks.filter((p) => findDish(s, p)?.groupId === groupId)
    if (inGroup.length < g.max) return setPicks([...picks, dishId])
    // A group with room for one swaps the choice instead of refusing it.
    if (g.max === 1) setPicks([...picks.filter((p) => !inGroup.includes(p)), dishId])
  }

  const problems = s.groups
    .filter((g) => (counts.get(g.id) ?? 0) < g.min)
    .map((g) => m.plate.tooFew(g.name, g.min))

  const slots = s.groups.flatMap((g) => {
    const chosen = picks.filter((p) => findDish(s, p)?.groupId === g.id)
    return Array.from({ length: g.max }, (_, i) => ({ group: g, dishId: chosen[i] ?? null, key: `${g.id}-${i}` }))
  })
  const extraCols = Math.ceil(slots.length / 2)

  return (
    <>
      <Link href={back} className="mb-3 inline-block text-[15px] font-semibold text-leaf">
        ← {m.plate.back}
      </Link>
      <h1 className="text-[26px] leading-tight font-bold tracking-tight sm:text-3xl">{m.plate.title}</h1>
      <p className="mt-1 mb-5 text-[15px] text-muted">
        <DayLabel date={date} long />
      </p>

      {order && (
        <div className="mb-5">
          <Notice>{m.detail.addPlateNote}</Notice>
        </div>
      )}
      {!open && (
        <div className="mb-5">
          <Notice tone="chili">{m.day.notOpen}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:grid-rows-[auto_1fr]">
        {/* The tray: the one memorable element of the prototype. */}
        <div className="lg:col-start-1 lg:row-start-1">
          <div
            className="tray grid gap-2.5 rounded-[22px] p-3"
            style={{ gridTemplateColumns: `1.3fr repeat(${extraCols}, 1fr)`, gridTemplateRows: 'repeat(2, minmax(5.5rem, auto))' }}
            aria-label={m.plate.title}
          >
            <div className="tray-cell row-span-2 flex flex-col items-center justify-center rounded-2xl p-2 text-center">
              <span aria-hidden className="mb-1 text-3xl">🍚</span>
              <span className="text-sm font-semibold">{m.plate.rice}</span>
            </div>
            {slots.map(({ group, dishId, key }) => (
              <div key={key} className="tray-cell flex flex-col justify-between rounded-2xl p-2">
                <span className="text-[11px] font-semibold text-muted">{group.name}</span>
                {dishId ? (
                  <span key={dishId} className="fill-in text-[13px] leading-tight font-semibold text-leaf-dark">
                    {findDish(s, dishId)?.name}
                  </span>
                ) : (
                  <span className="text-[13px] text-muted/70">{m.plate.empty}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Price and add: sticks above the bottom bar on phones, beside the tray on computers. */}
        <div className="sticky bottom-16 z-10 rounded-xl bg-card p-4 shadow-[0_-4px_16px_rgb(29_36_32/0.12)] ring-1 ring-steel/70 max-sm:p-3 md:bottom-4 lg:top-4 lg:bottom-auto lg:col-start-1 lg:row-start-2 lg:self-start lg:shadow-none">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{m.plate.price}</span>
              <span className="text-2xl font-bold tracking-tight sm:text-3xl" aria-live="polite">
                {money(price)}
              </span>
            </div>
            <p className="mt-1 hidden text-sm text-muted sm:block">
              {m.plate.base} {money(s.settings.basePrice)}
              {picks.map((id) => {
                const d = findDish(s, id)
                return d && d.surcharge > 0 ? ` + ${money(d.surcharge)} (${d.name})` : ''
              })}
              {s.groups.map((g) => {
                const extra = (counts.get(g.id) ?? 0) - g.included
                return extra > 0 && g.extraFee > 0 ? ` + ${g.name}: ${extra} × ${m.plate.extraFee(money(g.extraFee))}` : ''
              })}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 sm:mt-4 sm:gap-3">
              <span className="flex items-center gap-2 text-[15px] font-medium">
                <span className="max-sm:sr-only">{m.plate.qty}</span> <QtyStepper value={qty} onChange={setQty} min={1} />
              </span>
              <Button
                disabled={!valid || !open}
                onClick={() => {
                  if (order) {
                    const r = run((st) => addPlateToOrder(st, order.id, { kind: 'plate', picks, qty, unitPrice: price }))
                    if (!r.ok) return
                    const after = r.state.orders.find((o) => o.id === order.id)!
                    router.push(owed(after) > 0 && netPaid(after) > 0 ? `/pay?id=${order.id}` : back)
                    return
                  }
                  const r = run((st) => addToCart(st, date, { kind: 'plate', picks, qty, unitPrice: price }))
                  if (r.ok) router.push(back)
                }}
              >
                {order ? m.detail.plateToOrder : m.plate.add}
              </Button>
            </div>
            {problems.length > 0 && <p className="mt-2 text-sm sm:mt-3 font-medium text-chili">{problems.join(' · ')}</p>}
        </div>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {s.groups.map((g) => {
            const dishes = components.filter((id) => findDish(s, id)?.groupId === g.id)
            if (dishes.length === 0) return null
            const n = counts.get(g.id) ?? 0
            return (
              <fieldset key={g.id}>
                <legend className="mb-2 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-lg font-bold">{g.name}</span>
                  <span className="text-sm text-muted">
                    {m.plate.rule(g.min, g.max, g.included)}
                    {g.extraFee > 0 && ` · ${m.plate.extraFee(money(g.extraFee))}`}
                  </span>
                  {n >= g.max && g.max > 1 && <span className="text-sm font-semibold text-leaf">{m.plate.full}</span>}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {dishes.map((id) => {
                    const d = findDish(s, id)!
                    const on = picks.includes(id)
                    const blocked = !on && n >= g.max && g.max > 1
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        disabled={blocked || !open}
                        onClick={() => toggle(id, g.id)}
                        className={cx(
                          'flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 py-2 text-left ring-1 transition-colors',
                          on ? 'bg-leaf text-white ring-leaf' : 'bg-card ring-steel hover:ring-leaf',
                          (blocked || !open) && 'opacity-50',
                        )}
                      >
                        <span className="font-semibold">{d.name}</span>
                        <span className={cx('text-sm font-semibold', on ? 'text-white' : 'text-muted')}>
                          {d.surcharge > 0 ? m.plate.surcharge(money(d.surcharge)) : money(0)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
      </div>
    </>
  )
}
