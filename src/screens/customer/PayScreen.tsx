'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { FakeQr, MissingNotice } from '@/components/parts'
import { Button, Card, LinkButton, Notice, OrderBadges, PageTitle } from '@/components/ui'
import { findOrder, netPaid, paymentState, reportedTotal, reportTransfer, toPay } from '@/proto/logic'
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

  // Only what is not yet reported is asked for; a report survives an edit (CN-37).
  const more = toPay(order)
  const reported = reportedTotal(order)
  const pay = paymentState(order)
  // "Show QR again" carries the latest report only (CN-45, CN-49).
  const last = order.reports.at(-1)?.amount ?? 0
  const due = more > 0 ? more : last
  const { bank } = s.settings
  // VietQR-style content: bank account, amount, transfer note = order code (CN-5, CN-20).
  const payload = `${bank.name}|${bank.account}|${due}|${order.code}`
  // Once everything is reported, the QR is hidden before and after the cutoff, unless asked for again (CN-34).
  const showQr = more > 0 || (reported > 0 && qrAgain)

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
          {more === 0 && reported > 0 && !qrAgain ? (
            <>
              <Notice tone="leaf">{m.pay.waiting(money(reported))}</Notice>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setQrAgain(true)}>
                  {m.pay.showQr}
                </Button>
                <LinkButton href={`/order?id=${order.id}`} variant="secondary">
                  {m.orders.open}
                </LinkButton>
              </div>
            </>
          ) : showQr ? (
            <>
              {/* The "not found" notice is shown next to the others, never instead of them (CN-41, CN-37). */}
              {order.missing.length > 0 && (
                <div className="mb-4">
                  <MissingNotice order={order} />
                </div>
              )}
              {/* "Transfer more after an edit" only when no report was turned down (S-C7, CN-37, CN-41). */}
              {reported > 0 && more > 0 && order.missing.length === 0 ? (
                <div className="mb-4">
                  <Notice>{m.pay.moreAfterReport(money(reported), money(more))}</Notice>
                </div>
              ) : reported > 0 ? (
                // Reports still waiting; on "Show QR again" the latest one: never "0 owed" (CN-34, CN-45).
                <div className="mb-4">
                  <Notice tone="leaf">{m.pay.waiting(money(more > 0 ? reported : last))}</Notice>
                </div>
              ) : (
                netPaid(order) > 0 && (
                  <div className="mb-4">
                    <Notice>{m.pay.topUp(money(more))}</Notice>
                  </div>
                )
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
                {more > 0 ? (
                  <Button onClick={() => run((st) => reportTransfer(st, order.id))}>{m.pay.done}</Button>
                ) : (
                  <Button variant="ghost" onClick={() => setQrAgain(false)}>
                    {m.pay.hideQr}
                  </Button>
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
