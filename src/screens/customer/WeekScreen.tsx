'use client'

import Link from 'next/link'
import { DayLabel } from '@/components/parts'
import { Badge, PageTitle, cx } from '@/components/ui'
import { cutoffOf, dayState, findDay, findDish, week } from '@/proto/logic'
import { hhmm } from '@/proto/time'
import { useApp } from '@/proto/useApp'

/** S-C3 Week view: today + next 6 days with their state (BR-3). */
export function WeekScreen() {
  const { s, m } = useApp()
  return (
    <>
      <PageTitle title={m.week.title} intro={m.week.intro} />
      <ol className="grid gap-3 lg:grid-cols-2">
        {week(s).map((date) => {
          const state = dayState(s, date)
          const day = findDay(s, date)
          const menuNames = day?.menu ? [...new Set([...day.menu.fixed, ...day.menu.components])] : []
          const cart = (s.carts[date] ?? []).reduce((n, l) => n + l.qty, 0)
          const mine = s.orders.filter((o) => o.date === date && o.customerId === s.me).length
          const clickable = state === 'open' || state === 'pastCutoff'
          const body = (
            <div className="flex gap-4">
              <div
                className={cx(
                  'flex w-16 shrink-0 flex-col items-center justify-center rounded-lg py-2',
                  state === 'open' ? 'bg-leaf text-white' : 'bg-tray text-muted',
                )}
              >
                <span className="text-[13px] font-semibold">{m.weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]}</span>
                <span className="text-2xl leading-none font-bold">{date.slice(8, 10)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    <DayLabel date={date} long />
                  </span>
                  {state === 'open' && <Badge tone="leaf">{m.week.open(hhmm(cutoffOf(s, date)))}</Badge>}
                  {state === 'pastCutoff' && <Badge tone="chili">{m.week.pastCutoff}</Badge>}
                  {state === 'closed' && <Badge tone="steel">{m.week.closed}</Badge>}
                  {state === 'noMenu' && <Badge tone="steel">{m.week.noMenu}</Badge>}
                </div>
                {menuNames.length > 0 && (
                  <p className="mt-1 truncate text-[15px] text-muted">
                    {menuNames
                      .slice(0, 4)
                      .map((id) => findDish(s, id)?.name)
                      .join(', ')}
                    {menuNames.length > 4 && '…'}
                  </p>
                )}
                {(cart > 0 || mine > 0) && (
                  <p className="mt-1.5 flex flex-wrap gap-2 text-sm font-semibold">
                    {cart > 0 && <span className="text-chili">{m.week.inCart(cart)}</span>}
                    {mine > 0 && <span className="text-leaf">{m.week.myOrders(mine)}</span>}
                  </p>
                )}
              </div>
            </div>
          )
          return (
            <li key={date}>
              {clickable ? (
                <Link
                  href={`/day?d=${date}`}
                  className="block rounded-xl bg-card p-3 ring-1 ring-steel/70 transition-shadow hover:ring-2 hover:ring-leaf"
                >
                  {body}
                </Link>
              ) : (
                <div className="rounded-xl bg-card/60 p-3 ring-1 ring-steel/50">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
