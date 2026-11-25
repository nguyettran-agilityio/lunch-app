'use client'

import { useState } from 'react'
import { Card, PageTitle } from '@/components/ui'
import { dishName, dayOrders, prepSheet, type PrepColumn, type PrepRow } from '@/domain/logic'
import { useApp } from '@/screens/app'
import { ShopDayBar, ShopOrderCard } from './common'
import { StartBar } from './ShopOrdersScreen'

const COLUMNS: PrepColumn[] = ['preparing', 'confirmed', 'placed', 'done']

/** S-S8 Preparation sheet: portions per dish split by status with a total (BR-25, CN-21); start preparing (BR-24). */
export function PrepScreen() {
  const { s, m, shopDay } = useApp()
  const [picked, setPicked] = useState<string[]>([])
  const rows = prepSheet(s, shopDay)
  const queue = dayOrders(s, shopDay).filter((o) => o.status === 'confirmed')
  const selected = picked.filter((id) => queue.some((o) => o.id === id))

  const table = (title: string, list: PrepRow[]) =>
    list.length > 0 && (
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-steel/70">
        <h2 className="px-4 pt-4 pb-2 text-lg font-bold">{title}</h2>
        {/* Phones: one row per dish with the status split underneath. */}
        <ul className="divide-y divide-tray border-t border-tray sm:hidden">
          {list.map((r) => (
            <li key={`${r.kind}-${r.dishId}`} className="px-4 py-2.5">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{dishName(s, r.dishId)}</span>
                <span className="text-xl font-bold">{r.total}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                {COLUMNS.map((c) => (
                  <span key={c} className={r.counts[c] > 0 ? 'text-ink' : undefined}>
                    {m.prep[c]} <b>{r.counts[c]}</b>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
          <table className="w-full text-[15px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-y border-tray bg-paper text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-semibold">
                  {m.prep.dish}
                </th>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 text-right font-semibold">
                    {m.prep[c]}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-bold text-ink">
                  {m.prep.total}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.kind}-${r.dishId}`} className="border-b border-tray last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                    {dishName(s, r.dishId)}
                  </th>
                  {COLUMNS.map((c) => (
                    <td
                      key={c}
                      className={`px-2 py-2.5 text-right ${r.counts[c] === 0 ? 'text-steel' : c === 'preparing' ? 'font-bold' : ''}`}
                    >
                      {r.counts[c]}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-lg font-bold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )

  return (
    <>
      <PageTitle title={m.prep.title} intro={m.prep.intro} />
      <ShopDayBar />
      <div className="grid gap-5 xl:grid-cols-[1fr_26rem] xl:items-start">
        <div className="flex flex-col gap-4">
          {rows.length === 0 ? (
            <Card>
              <p>{m.prep.empty}</p>
            </Card>
          ) : (
            <>
              {table(
                m.prep.fixed,
                rows.filter((r) => r.kind === 'fixed'),
              )}
              {table(
                m.prep.components,
                rows.filter((r) => r.kind === 'component'),
              )}
            </>
          )}
        </div>
        <section>
          <h2 className="mb-2 text-lg font-bold">
            {m.prep.queue} <span className="text-muted">({queue.length})</span>
          </h2>
          {queue.length === 0 ? (
            <Card>
              <p className="text-[15px]">{m.prep.queueEmpty}</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {queue.map((o) => (
                <ShopOrderCard
                  key={o.id}
                  order={o}
                  selectable
                  selected={selected.includes(o.id)}
                  onSelect={(on) => setPicked(on ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
                />
              ))}
            </div>
          )}
          {selected.length > 0 && <StartBar ids={selected} onDone={() => setPicked([])} />}
        </section>
      </div>
    </>
  )
}
