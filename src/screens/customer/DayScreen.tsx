'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { DayLabel } from '@/components/parts'
import { Button, Card, LinkButton, Notice, PageTitle } from '@/components/ui'
import { addToCart, cutoffOf, dayState, findDay, findDish, linesTotal } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import { useApp } from '@/proto/useApp'

/** S-C4 Day menu: fixed dishes, entry to the plate builder, add to that day's cart (BR-2, BR-11a). */
export function DayScreen() {
  const date = useSearchParams().get('d') ?? ''
  const { s, m, money } = useApp()
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const day = findDay(s, date)
  const state = dayState(s, date)
  const cutoff = hhmm(cutoffOf(s, date))
  const cart = s.carts[date] ?? []
  const cartQty = cart.reduce((n, l) => n + l.qty, 0)

  if (!day?.menu || state === 'closed' || state === 'outOfRange') {
    const title = state === 'closed' ? m.week.closed : state === 'noMenu' ? m.week.noMenu : m.day.notOpen
    return (
      <>
        <PageTitle title={title} />
        <LinkButton href="/" variant="secondary">
          {m.cart.goWeek}
        </LinkButton>
      </>
    )
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight sm:text-3xl">
          <DayLabel date={date} long />
        </h1>
        <p className="mt-1 text-[15px] text-muted">{m.day.cutoffAt(cutoff)}</p>
      </div>

      {state === 'pastCutoff' && (
        <div className="mb-5">
          <Notice tone="chili">{m.day.pastCutoff(cutoff)}</Notice>
        </div>
      )}
      {state !== 'open' && state !== 'pastCutoff' && (
        <div className="mb-5">
          <Notice>{m.day.notOpen}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="fixed-title">
          <h2 id="fixed-title" className="mb-3 text-lg font-bold">
            {m.day.fixedTitle}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {day.menu.fixed.map((id) => {
              const dish = findDish(s, id)
              if (!dish || dish.price === null) return null
              return (
                <li key={id} className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-steel/70">
                  <div>
                    <p className="text-[17px] font-semibold">{dish.name}</p>
                    {dish.description && <p className="mt-0.5 text-sm text-muted">{dish.description}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[17px] font-bold">{money(dish.price)}</span>
                    <Button
                      disabled={state !== 'open'}
                      onClick={() => {
                        const r = run((st) => addToCart(st, date, { kind: 'fixed', dishId: id, qty: 1, unitPrice: dish.price! }))
                        if (r.ok) setJustAdded(id)
                      }}
                    >
                      {justAdded === id ? m.day.added : m.day.add}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          <Card className="bg-leaf-soft ring-leaf/30">
            <h2 className="text-lg font-bold">{m.day.buildTitle}</h2>
            <p className="mt-1 text-[15px]">{m.day.buildIntro(money(s.settings.basePrice))}</p>
            <p className="mt-2 text-sm text-muted">
              {day.menu.components
                .map((id) => findDish(s, id)?.name)
                .join(', ')}
            </p>
            <div className="mt-4">
              {state === 'open' ? (
                <LinkButton href={`/plate?d=${date}`} className="w-full">
                  {m.day.buildCta}
                </LinkButton>
              ) : (
                <Button disabled className="w-full">
                  {m.day.buildCta}
                </Button>
              )}
            </div>
          </Card>
          {cartQty > 0 && (
            <Card>
              <p className="flex justify-between font-semibold">
                <span>{m.week.inCart(cartQty)}</span>
                <span>{money(linesTotal(cart))}</span>
              </p>
              <LinkButton href="/cart" variant="secondary" className="mt-3 w-full">
                {m.day.viewCart}
              </LinkButton>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}
