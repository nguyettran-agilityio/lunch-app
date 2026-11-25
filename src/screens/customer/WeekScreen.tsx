'use client'

import Link from 'next/link'
import { DayLabel } from '@/components/parts'
import { Badge, PageTitle, cx } from '@/components/ui'
import { cutoffOf, dayState, dishName, findDay, week } from '@/domain/logic'
import { hhmm } from '@/domain/time'
import { useApp } from '@/screens/app'

/** S-C3 Week view: today + next 6 days with their state (BR-3). */
export function WeekScreen() {
  const { s, m, href } = useApp()
  return (
    <>
      <PageTitle title={m.week.title} intro={m.week.intro} />
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                  'flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl py-2',
                  state === 'open' ? 'bg-leaf text-on-leaf' : 'bg-tray text-muted',
                )}
              >
                <span className="text-[13px] font-semibold">{m.weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]}</span>
                <span className="font-display text-[28px] leading-none font-extrabold">{date.slice(8, 10)}</span>
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
                      .map((id) => dishName(s, id))
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
                  href={href(`/day?d=${date}`)}
                  className="parcel block bg-card p-3 ring-1 ring-steel/70 transition-shadow hover:ring-2 hover:ring-leaf"
                >
                  {body}
                </Link>
              ) : (
                <div className="parcel bg-card/60 p-3 ring-1 ring-steel/50">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
