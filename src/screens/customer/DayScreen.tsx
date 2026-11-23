'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { DishArt, EmptyArt, PlateArt } from '@/components/art'
import { DayLabel } from '@/components/parts'
import { Button, Card, LinkButton, Notice, PageTitle } from '@/components/ui'
import { addToCart, cutoffOf, dayState, dishDescription, dishName, findDay, findDish, linesTotal } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import { useApp } from '@/proto/useApp'

/** S-C4 Day menu: fixed dishes, entry to the plate builder, add to that day's cart (BR-2, BR-11a). */
export function DayScreen() {
  const date = useSearchParams().get('d') ?? ''
  const { s, m, money } = useApp()
  // The last dish added, with a counter so every tap, also on a dish already in the cart, shows feedback.
  const [justAdded, setJustAdded] = useState<{ id: string; tap: number } | null>(null)
  const day = findDay(s, date)
  const state = dayState(s, date)
  const cutoff = hhmm(cutoffOf(s, date))
  const cart = s.carts[date] ?? []
  const cartQty = cart.reduce((n, l) => n + l.qty, 0)

  if (!day?.menu || state === 'closed' || state === 'outOfRange') {
    const title = state === 'closed' ? m.week.closed : state === 'noMenu' ? m.week.noMenu : m.day.notOpen
    return (
      <div className="flex flex-col items-start gap-4">
        <EmptyArt kind={state === 'closed' ? 'closed' : 'noMenu'} className="w-56 text-ink" />
        <PageTitle title={title} />
        <LinkButton href="/" variant="secondary">
          {m.cart.goWeek}
        </LinkButton>
      </div>
    )
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display text-[28px] leading-[1.1] font-extrabold tracking-tight sm:text-[34px]">
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
          <h2 id="fixed-title" className="text-lg font-bold">
            {m.day.fixedTitle}
          </h2>
          <p className="mb-3 text-[15px] text-muted">{m.day.fixedIntro}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {day.menu.fixed.map((id) => {
              const dish = findDish(s, id)
              if (!dish || dish.price === null) return null
              const inCart = cart.reduce((n, l) => n + (l.kind === 'fixed' && l.dishId === id ? l.qty : 0), 0)
              const flash = justAdded?.id === id
              return (
                <li key={id} className="parcel flex gap-3 overflow-hidden bg-card p-3 ring-1 ring-steel/70 sm:flex-col sm:p-4 sm:pt-0">
                  {/* Our own drawing of the dish on a piece of leaf (UI6): beside the text on phones, on top on computers. */}
                  <div className="grid w-24 shrink-0 place-items-center self-start rounded-2xl bg-leaf-soft p-1 sm:-mx-4 sm:w-auto sm:self-stretch sm:rounded-none sm:py-3">
                    <DishArt dishId={id} meal className="size-22 sm:size-36" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div>
                      <p className="text-[17px] leading-snug font-semibold">{dishName(s, id)}</p>
                      {dishDescription(s, id) && <p className="mt-0.5 text-sm text-muted">{dishDescription(s, id)}</p>}
                    </div>
                    <p aria-live="polite" className="text-sm font-semibold text-leaf empty:hidden sm:min-h-5 sm:empty:block">
                      {flash ? (
                        <span key={justAdded.tap} className="fill-in inline-block">
                          ✓ {m.day.addedMore(dishName(s, id), inCart)}
                        </span>
                      ) : inCart > 0 ? (
                        m.day.inCart(inCart)
                      ) : null}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-xl font-bold tracking-tight sm:text-[22px]">{money(dish.price)}</span>
                      <Button
                        disabled={state !== 'open'}
                        onClick={() => {
                          const r = run((st) => addToCart(st, date, { kind: 'fixed', dishId: id, qty: 1, unitPrice: dish.price! }))
                          if (r.ok) setJustAdded({ id, tap: (justAdded?.tap ?? 0) + 1 })
                        }}
                      >
                        {m.day.add}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          <Card className="parcel bg-leaf-soft ring-leaf/30">
            <PlateArt picks={[]} slots={s.groups.reduce((n, g) => n + g.max, 0)} className="float-right -mt-1 -mr-1 ml-2 size-24" />
            <h2 className="font-display text-xl font-bold">{m.day.buildTitle}</h2>
            <p className="mt-1 text-[15px]">{m.day.buildIntro(money(s.settings.basePrice))}</p>
            <p className="mt-2 text-sm text-muted">{day.menu.components.map((id) => dishName(s, id)).join(', ')}</p>
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
