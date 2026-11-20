'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { FakeQr } from '@/components/parts'
import { Button, Card, LinkButton, Notice, OrderBadges, PageTitle } from '@/components/ui'
import { findOrder, netPaid, owed, paymentState, reportTransfer } from '@/proto/logic'
import { run } from '@/proto/store'
import { useApp } from '@/proto/useApp'

/** S-C7 Payment: fake VietQR with the amount and order code, "I have transferred" (BR-19, BR-20). */
export function PayScreen() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const { s, m, money } = useApp()
  const [qrAgain, setQrAgain] = useState(params.get('qr') === '1')
  const order = findOrder(s, id)
  if (!order) return <PageTitle title={m.detail.notFound} />

  const due = owed(order)
  const pay = paymentState(order)
  const { bank } = s.settings
  // VietQR-style content: bank account, amount, transfer note = order code (CN-5, CN-20).
  const payload = `${bank.name}|${bank.account}|${due}|${order.code}`
  // Once reported, the QR is hidden before and after the cutoff, unless asked for again (CN-34).
  const showQr = due > 0 && (pay !== 'reported' || qrAgain)

  return (
    <>
      <PageTitle title={m.pay.title} intro={m.detail.title(order.code)}>
        <OrderBadges order={order} />
      </PageTitle>
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
        {showQr ? (
          <Card className="flex flex-col items-center gap-3 md:w-80">
            <FakeQr payload={payload} label={m.pay.fake} />
            <p className="text-center text-xs text-muted">{m.pay.fake}</p>
          </Card>
        ) : null}
        <Card>
          {due > 0 && pay === 'reported' && !qrAgain ? (
            <>
              <Notice tone="leaf">{m.pay.waiting(money(due))}</Notice>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setQrAgain(true)}>
                  {m.pay.showQr}
                </Button>
                <LinkButton href={`/order?id=${order.id}`} variant="secondary">
                  {m.orders.open}
                </LinkButton>
              </div>
            </>
          ) : due > 0 ? (
            <>
              {netPaid(order) > 0 && (
                <div className="mb-4">
                  <Notice>{m.pay.topUp(money(due))}</Notice>
                </div>
              )}
              <p className="mb-4 text-[15px]">{m.pay.scan}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
                <dt className="text-muted">{m.pay.amount}</dt>
                <dd className="text-2xl font-bold">{money(due)}</dd>
                <dt className="text-muted">{m.pay.note}</dt>
                <dd className="font-bold tracking-wide">{order.code}</dd>
                <dt className="text-muted">{m.pay.bank}</dt>
                <dd>{bank.name}</dd>
                <dt className="text-muted">{m.pay.account}</dt>
                <dd>{bank.account}</dd>
                <dt className="text-muted">{m.pay.holder}</dt>
                <dd>{bank.holder}</dd>
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                {pay === 'reported' ? (
                  <Button variant="ghost" onClick={() => setQrAgain(false)}>
                    {m.pay.hideQr}
                  </Button>
                ) : (
                  <Button onClick={() => run((st) => reportTransfer(st, order.id))}>{m.pay.done}</Button>
                )}
                <LinkButton href={`/order?id=${order.id}`} variant="secondary">
                  {m.pay.later}
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <Notice tone="leaf">{pay === 'paid' && order.received > 0 ? m.pay.paid : m.pay.nothing}</Notice>
              <LinkButton href={`/order?id=${order.id}`} variant="secondary" className="mt-4">
                {m.orders.open}
              </LinkButton>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
