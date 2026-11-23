'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { MoneyState } from '@/components/money'
import { DayLabel, LineText, LinesList, MissingNotice, OrderHistory, PaidRows, RefundState, RefundToView } from '@/components/parts'
import { Button, Card, ConfirmButton, LinkButton, Notice, OrderBadges, PageTitle, QtyStepper, TextInput, cx } from '@/components/ui'
import {
  cancelOrder,
  cashAllowed,
  customerChangeBlock,
  discardEdit,
  dishName,
  editOrder,
  findBuilding,
  findDay,
  findDish,
  isActive,
  linesTotal,
  netPaid,
  orderTotal,
  refundState,
  reportedTotal,
  setDraft,
  setRefundTo,
  startEdit,
  toPay,
} from '@/proto/logic'
import { run, update } from '@/proto/store'
import type { Order, RefundTo } from '@/proto/types'
import { useApp } from '@/proto/useApp'
import { BuildingPicker } from './BuildingPicker'

/** S-C9 Order detail: lines, total, building, history; edit and cancel before the cutoff while not Preparing. */
export function OrderScreen() {
  const id = useSearchParams().get('id') ?? ''
  const { s, m, money } = useApp()
  const order = s.orders.find((o) => o.id === id && o.customerId === s.me)
  if (!order) return <PageTitle title={m.detail.notFound} />

  const block = customerChangeBlock(s, order)
  // What is left to transfer, after money confirmed and money already reported (CN-37).
  const due = toPay(order)
  const active = isActive(order.status)
  // An edit in progress stays open across the plate builder until it is saved or discarded (CN-29).
  const editing = !block && !!s.drafts[order.id]

  return (
    <>
      <PageTitle title={m.detail.title(order.code)}>
        <OrderBadges order={order} />
      </PageTitle>
      <p className="-mt-3 mb-5 text-[15px] text-muted">
        <DayLabel date={order.date} long />
      </p>
      {/* The money state at a glance (docs/design.md, UI3). */}
      <div className="mb-5 max-w-xl">
        <MoneyState order={order} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {editing ? (
            <EditOrder order={order} />
          ) : (
            <Card>
              <h2 className="mb-1 font-bold">{m.detail.lines}</h2>
              <LinesList lines={order.lines} art />
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-tray pt-3 text-[15px]">
                <dt className="text-muted">{m.detail.total}</dt>
                <dd className="text-right text-lg font-bold">{money(orderTotal(order))}</dd>
                <PaidRows order={order} />
                {due > 0 && (
                  <>
                    <dt className="font-semibold text-chili">{m.detail.owed}</dt>
                    <dd className="text-right font-semibold text-chili">{money(due)}</dd>
                  </>
                )}
                <dt className="text-muted">{m.detail.building}</dt>
                <dd className="text-right">{findBuilding(s, order.buildingId)?.name}</dd>
                {order.note && (
                  <>
                    <dt className="text-muted">{m.detail.note}</dt>
                    <dd className="text-right">{order.note}</dd>
                  </>
                )}
                {order.shopNote && (
                  <>
                    <dt className="text-muted">{m.detail.shopNote}</dt>
                    <dd className="text-right">{order.shopNote}</dd>
                  </>
                )}
              </dl>
              {/* "Transfer reported, waiting for the shop" is said in the money block above (CN-34, CN-39, UI7, UI8). */}
              {/* The shop did not find the last transfer reported (CN-41). */}
              {order.missing.length > 0 && (
                <div className="mt-4">
                  <MissingNotice order={order} />
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {due > 0 ? (
                  <LinkButton href={`/pay?id=${order.id}`}>{m.detail.pay}</LinkButton>
                ) : (
                  reportedTotal(order) > 0 &&
                  active && (
                    <LinkButton href={`/pay?id=${order.id}&qr=1`} variant="ghost">
                      {m.pay.showQr}
                    </LinkButton>
                  )
                )}
                {!block && (
                  <>
                    <Button variant="secondary" onClick={() => run((st) => startEdit(st, order.id))}>
                      {m.detail.edit}
                    </Button>
                    <ConfirmButton label={m.detail.cancel} question={m.detail.cancelConfirm} onConfirm={() => run((st) => cancelOrder(st, order.id))} />
                  </>
                )}
              </div>
              {block === 'pastCutoff' && (
                <div className="mt-4">
                  <Notice tone="chili">{m.detail.lockedCutoff}</Notice>
                </div>
              )}
              {block === 'preparing' && (
                <div className="mt-4">
                  <Notice>{m.detail.lockedPreparing}</Notice>
                </div>
              )}
            </Card>
          )}

          {order.refunds.length > 0 && (
            <Card>
              <h2 className="mb-2 font-bold">{m.detail.refunds}</h2>
              <ul className="flex flex-col gap-1.5 text-[15px]">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {money(r.amount)} · {m.reason[r.reason]}
                    </span>
                    <RefundState refund={r} />
                  </li>
                ))}
              </ul>
              {refundState(order) === 'needsRefund' && <RefundToForm order={order} />}
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-3 font-bold">{m.detail.history}</h2>
          <OrderHistory history={order.history} />
        </Card>
      </div>
    </>
  )
}

/** All changes of one edit are kept in a draft and saved together with one "Save" (CN-29). */
function EditOrder({ order }: { order: Order }) {
  const { s, m, money } = useApp()
  const router = useRouter()
  const draft = s.drafts[order.id]
  const { lines, buildingId, note } = draft
  const fixed = findDay(s, order.date)?.menu?.fixed ?? []
  const save = (patch: Partial<typeof draft>) => update((st) => setDraft(st, order.id, { ...draft, ...patch }))
  const changed =
    buildingId !== order.buildingId ||
    note.trim() !== order.note ||
    JSON.stringify(lines.filter((l) => l.qty > 0)) !== JSON.stringify(order.lines)
  const setQty = (id: string, qty: number) => save({ lines: lines.map((l) => (l.id === id ? { ...l, qty } : l)) })
  const addFixed = (dishId: string) => {
    const existing = lines.find((l) => l.kind === 'fixed' && l.dishId === dishId)
    if (existing) return setQty(existing.id, existing.qty + 1)
    // A newly added dish takes today's price; existing lines keep theirs (BR-6).
    save({ lines: [...lines, { id: `new-${dishId}-${lines.length}`, kind: 'fixed', dishId, qty: 1, unitPrice: findDish(s, dishId)?.price ?? 0 }] })
  }

  return (
    <Card>
      <h2 className="mb-1 font-bold">{m.detail.edit}</h2>
      <div className="mb-3">
        <Notice>{m.detail.editNote}</Notice>
      </div>
      <ul className="divide-y divide-tray">
        {lines.map((l) => {
          const isNew = !order.lines.some((o) => o.id === l.id)
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-48 text-[15px]">
                <LineText line={l} />
                {isNew && <span className="ml-2 rounded bg-leaf-soft px-1.5 text-xs font-semibold text-leaf-dark">{m.detail.newLine}</span>}
                <p className="text-sm text-muted">{money(l.unitPrice)}</p>
              </div>
              <QtyStepper value={l.qty} onChange={(v) => setQty(l.id, v)} />
            </li>
          )
        })}
      </ul>
      <p className="mt-4 mb-2 text-sm font-medium text-muted">{m.detail.addDish}</p>
      <div className="flex flex-wrap gap-2">
        {fixed.map((id) => (
          <Button key={id} variant="secondary" onClick={() => addFixed(id)}>
            + {dishName(s, id)}
          </Button>
        ))}
        <LinkButton href={`/plate?order=${order.id}`} variant="secondary">
          + {m.detail.addPlate}
        </LinkButton>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-tray pt-4">
        <BuildingPicker id={`edit-${order.id}`} value={buildingId} onChange={(v) => save({ buildingId: v })} />
        <TextInput label={m.cart.note} placeholder={m.cart.notePlaceholder} value={note} onChange={(e) => save({ note: e.target.value })} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="text-sm text-muted">{m.cart.total} </span>
          <span className="text-2xl font-bold">{money(linesTotal(lines.filter((l) => l.qty > 0)))}</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => update((st) => discardEdit(st, order.id))}>
            {m.detail.discard}
          </Button>
          <Button
            // Saving without a change is not an edit and must not send the order back to Placed (BR-14).
            disabled={!changed}
            onClick={() => {
              const r = run((st) => editOrder(st, order.id, lines, buildingId, note))
              if (!r.ok) return
              const after = r.state.orders.find((o) => o.id === order.id)
              // Money already paid or reported: go straight to the difference to transfer (BR-20, CN-37).
              if (after && toPay(after) > 0 && (netPaid(after) > 0 || reportedTotal(after) > 0)) router.push(`/pay?id=${order.id}`)
            }}
          >
            {m.detail.save}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Longest side of an uploaded QR photo, so it stays small in localStorage. */
const QR_MAX = 480

function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, QR_MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not an image'))
    }
    img.src = url
  })
}

/** Where to send this order's refund: bank, account number and holder, or a QR photo, per order (CN-33). */
function RefundToForm({ order }: { order: Order }) {
  const { m } = useApp()
  const [changing, setChanging] = useState(false)
  const current = order.refundTo
  // Cash chosen earlier but the order is no longer to be delivered: start from an account instead (CN-54).
  const [kind, setKind] = useState<RefundTo['kind']>(current?.kind === 'cash' && !cashAllowed(order) ? 'account' : (current?.kind ?? 'account'))
  const [bank, setBank] = useState(current?.kind === 'account' ? current.bank : '')
  const [account, setAccount] = useState(current?.kind === 'account' ? current.account : '')
  const [holder, setHolder] = useState(current?.kind === 'account' ? current.holder : '')
  const [image, setImage] = useState(current?.kind === 'qr' ? current.image : '')

  if (current && !changing) {
    return (
      <div className="mt-4 border-t border-tray pt-3">
        <p className="mb-1 text-sm font-medium text-muted">{m.detail.refundSent}</p>
        <RefundToView to={current} />
        <Button variant="ghost" className="mt-2" onClick={() => setChanging(true)}>
          {m.detail.refundChange}
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-4 border-t border-tray pt-3">
      <h3 className="font-bold">{m.detail.refundTo}</h3>
      <p className="mb-3 text-sm text-muted">{m.detail.refundToIntro}</p>
      <div role="group" aria-label={m.detail.refundTo} className="mb-3 flex gap-1 rounded-lg p-0.5 ring-1 ring-steel">
        {/* Cash at delivery only for an order still to be delivered (CN-54). */}
        {(cashAllowed(order) ? (['account', 'qr', 'cash'] as const) : (['account', 'qr'] as const)).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cx('min-h-10 flex-1 rounded-md text-sm font-semibold', kind === k ? 'bg-ink text-on-ink' : 'text-muted')}
          >
            {k === 'account' ? m.detail.refundAccount : k === 'qr' ? m.detail.refundQr : m.detail.refundCash}
          </button>
        ))}
      </div>
      {kind === 'cash' ? (
        <p className="text-sm">{m.detail.refundCashNote}</p>
      ) : kind === 'account' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label={m.detail.refundBank} value={bank} onChange={(e) => setBank(e.target.value)} />
          <TextInput label={m.detail.refundNumber} inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)} />
          <TextInput label={m.detail.refundHolder} value={holder} onChange={(e) => setHolder(e.target.value)} />
        </div>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-medium text-muted">
          {m.detail.refundQrPick}
          <input
            type="file"
            accept="image/*"
            className="text-[15px] text-ink file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-4 file:font-semibold file:text-leaf-dark"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                setImage(await shrinkImage(file))
              } catch {
                setImage('')
              }
            }}
          />
          {image && <RefundToView to={{ kind: 'qr', image }} />}
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          onClick={() => {
            const to: RefundTo = kind === 'account' ? { kind, bank, account, holder } : kind === 'qr' ? { kind, image } : { kind: 'cash' }
            if (run((st) => setRefundTo(st, order.id, to)).ok) setChanging(false)
          }}
        >
          {m.detail.refundSave}
        </Button>
        {current && (
          <Button variant="ghost" onClick={() => setChanging(false)}>
            {m.detail.discard}
          </Button>
        )}
      </div>
    </div>
  )
}
