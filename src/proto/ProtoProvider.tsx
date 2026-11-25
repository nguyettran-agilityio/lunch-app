'use client'

// The prototype provider of useApp() and useActions() (plan.md section 1.2): runs the logic.ts
// functions on the localStorage state, with readable ids from a counter (B30), under the '/proto' base path (B34).
import { useMemo, useState, type ReactNode } from 'react'
import * as logic from '@/domain/logic'
import { messages, money } from '@/domain/i18n'
import type { NewId, State } from '@/domain/types'
import { ActionsContext, AppContext, type ActionResult, type Actions, type AppValue } from '@/screens/app'
import { getSnapshot, setLastError, setState, useProto } from './store'
import type { ProtoState } from './types'

export const PROTO_BASE = '/proto'

export const protoHref = (path: string): string => (path === '/' ? PROTO_BASE : `${PROTO_BASE}${path}`)

export function protoRoute(pathname: string): string {
  if (pathname === PROTO_BASE) return '/'
  return pathname.startsWith(`${PROTO_BASE}/`) ? pathname.slice(PROTO_BASE.length) : pathname
}

/** Run a rule on the stored state; on success save it with the advanced id counter, on error show it. */
function apply(fn: (s: ProtoState, newId: NewId) => logic.Result, after?: (next: ProtoState) => ProtoState): ActionResult {
  const current = getSnapshot()
  let seq = current.seq
  const newId: NewId = (prefix) => `${prefix}${++seq}`
  const r = fn(current, newId)
  if (!r.ok) {
    setLastError(r.error)
    return r
  }
  const next: ProtoState = { ...current, ...r.state, seq }
  setState(after ? after(next) : next)
  setLastError(null)
  return { ok: true, id: r.id }
}

/** Change only prototype data (drafts, shop day, language): always succeeds. */
function change(fn: (s: ProtoState) => ProtoState): ActionResult {
  setState(fn(getSnapshot()))
  return { ok: true }
}

function withoutDraft(s: ProtoState, id: string): ProtoState {
  const drafts = { ...s.drafts }
  delete drafts[id]
  return { ...s, drafts }
}

/** The edit in progress is kept in the prototype store (B33). */
function applyDraft(
  id: string,
  fn: (s: State, current: ProtoState['drafts'][string] | undefined, newId: NewId) => logic.DraftResult,
): ActionResult {
  const current = getSnapshot()
  let seq = current.seq
  const newId: NewId = (prefix) => `${prefix}${++seq}`
  const r = fn(current, current.drafts[id], newId)
  if (!r.ok) {
    setLastError(r.error)
    return r
  }
  setState({ ...current, seq, drafts: { ...current.drafts, [id]: r.draft } })
  setLastError(null)
  return { ok: true, id: r.id }
}

const protoActions: { [K in keyof Actions]: (...args: Parameters<Actions[K]>) => ActionResult } = {
  addToCart: (date, line) => apply((s, newId) => logic.addToCart(s, date, line, newId)),
  setCartQty: (date, lineId, qty) => apply((s) => logic.setCartQty(s, date, lineId, qty)),
  proposeBuilding: (name, address) => apply((s, newId) => logic.proposeBuilding(s, name, address, newId)),
  placeOrder: (date, buildingId, note) => apply((s, newId) => logic.placeOrder(s, date, buildingId, note, newId)),
  reportTransfer: (id) => apply((s, newId) => logic.reportTransfer(s, id, newId)),
  cancelOrder: (id) => apply((s, newId) => logic.cancelOrder(s, id, newId)),
  editOrder: (id, lines, buildingId, note) => {
    const r = apply(
      (s, newId) => logic.editOrder(s, id, lines, buildingId, note, newId),
      (next) => withoutDraft(next, id),
    )
    return r.ok ? { ...r, order: logic.findOrder(getSnapshot(), id) } : r
  },
  startEdit: (id) => applyDraft(id, (s, current) => logic.startEdit(s, id, current)),
  setDraft: (id, draft) => change((s) => ({ ...s, drafts: { ...s.drafts, [id]: draft } })),
  discardEdit: (id) => change((s) => withoutDraft(s, id)),
  addPlateToDraft: (id, plate) => applyDraft(id, (s, current, newId) => logic.addPlateToDraft(s, id, current, plate, newId)),
  setRefundTo: (id, to) => apply((s) => logic.setRefundTo(s, id, to)),
  confirmOrder: (id) => apply((s) => logic.confirmOrder(s, id)),
  confirmPayment: (id, reportId) => apply((s, newId) => logic.confirmPayment(s, id, reportId, newId)),
  reportNotReceived: (id, reportId) => apply((s) => logic.reportNotReceived(s, id, reportId)),
  rejectOrder: (id, reason = 'reject') => apply((s, newId) => logic.rejectOrder(s, id, reason, newId)),
  keepOrder: (id) => apply((s) => logic.keepOrder(s, id)),
  startPreparing: (ids) => apply((s) => logic.startPreparing(s, ids)),
  markDelivering: (ids) => apply((s) => logic.markDelivering(s, ids)),
  markDelivered: (ids, note) => apply((s) => logic.markDelivered(s, ids, note)),
  markRefunded: (orderId, refundId, method) => apply((s) => logic.markRefunded(s, orderId, refundId, method)),
  giveCashBack: (id) => apply((s) => logic.giveCashBack(s, id)),
  seeRefundReminder: () => change((s) => ({ ...s, ...logic.seeRefundReminder(s) })),
  addBuilding: (name, address, deliveryTime) => apply((s, newId) => logic.addBuilding(s, name, address, deliveryTime, newId)),
  approveBuilding: (id, deliveryTime) => apply((s) => logic.approveBuilding(s, id, deliveryTime)),
  setDeliveryTime: (id, deliveryTime) => apply((s) => logic.setDeliveryTime(s, id, deliveryTime)),
  declineBuilding: (id) => apply((s, newId) => logic.declineBuilding(s, id, newId)),
  setShopDay: (date) => change((s) => ({ ...s, shopDay: date })),
  setLang: (lang) => change((s) => ({ ...s, lang })),
}

export function ProtoProvider({ children }: { children: ReactNode }) {
  const s = useProto()
  const [running, setRunning] = useState(0)

  const actions = useMemo(() => {
    const wrapped = {} as Actions
    for (const key of Object.keys(protoActions) as (keyof Actions)[]) {
      const run = protoActions[key] as (...args: unknown[]) => ActionResult
      wrapped[key] = (async (...args: unknown[]) => {
        setRunning((n) => n + 1)
        try {
          return run(...args)
        } finally {
          setRunning((n) => n - 1)
        }
      }) as never
    }
    return wrapped
  }, [])

  const actionsValue = useMemo(() => ({ ...actions, pending: running > 0 }), [actions, running])
  const app = useMemo<AppValue | null>(
    () =>
      s && {
        s,
        m: messages[s.lang],
        money: (v: number) => money(v, s.lang),
        now: s.clock,
        shopDay: s.shopDay,
        drafts: s.drafts,
        href: protoHref,
        route: protoRoute,
      },
    [s],
  )

  if (!app) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted" aria-busy="true">
        Cơm Lá
      </div>
    )
  }
  return (
    <AppContext.Provider value={app}>
      <ActionsContext.Provider value={actionsValue}>{children}</ActionsContext.Provider>
    </AppContext.Provider>
  )
}
