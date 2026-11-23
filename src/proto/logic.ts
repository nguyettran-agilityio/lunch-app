// Business rules of docs/spec.md as pure functions on the prototype state.
// Every action returns a new state or an error code; nothing is mutated.
import { orderCode } from './seed'
import { addDays, stamp, stampMinutes } from './time'
import type {
  Building,
  Customer,
  DateStr,
  Dish,
  DishGroup,
  EditChange,
  EditDraft,
  Line,
  NewLine,
  Order,
  PaymentState,
  PlateLine,
  RefundMethod,
  RefundReason,
  RefundTo,
  ServiceDay,
  State,
  Status,
} from './types'

export type ErrorCode =
  | 'dayNotOpen'
  | 'pastCutoff'
  | 'preparing'
  | 'notActive'
  | 'emptyCart'
  | 'invalidPlate'
  | 'buildingPending'
  | 'buildingMissing'
  | 'notPlaced'
  | 'notConfirmed'
  | 'notPreparing'
  | 'notDelivering'
  | 'nothingOwed'
  | 'nothingReported'
  | 'cannotReject'
  | 'cannotKeep'
  | 'noRefundDue'
  | 'refundToMissing'
  | 'cashNotAllowed'
  | 'notFound'

export type Result = { ok: true; state: State; id?: string } | { ok: false; error: ErrorCode }

const ok = (state: State, id?: string): Result => ({ ok: true, state, id })
const fail = (error: ErrorCode): Result => ({ ok: false, error })

// ---------- Lookups ----------

export const findDish = (s: State, id: string): Dish | undefined => s.dishes.find((d) => d.id === id)
export const findGroup = (s: State, id: string): DishGroup | undefined => s.groups.find((g) => g.id === id)
export const findBuilding = (s: State, id: string): Building | undefined => s.buildings.find((b) => b.id === id)
export const findCustomer = (s: State, id: string): Customer | undefined => s.customers.find((c) => c.id === id)
export const findOrder = (s: State, id: string): Order | undefined => s.orders.find((o) => o.id === id)
export const findDay = (s: State, date: DateStr): ServiceDay | undefined => s.days.find((d) => d.date === date)

/** Dish name in the interface language: the optional English name in English, else the Vietnamese one (CN-31). */
export function dishName(s: State, id: string): string {
  const d = findDish(s, id)
  if (!d) return ''
  return s.lang === 'en' && d.nameEn ? d.nameEn : d.name
}

export function dishDescription(s: State, id: string): string {
  const d = findDish(s, id)
  if (!d) return ''
  return s.lang === 'en' && d.descriptionEn ? d.descriptionEn : d.description
}

// ---------- Days and cutoff (BR-3, BR-4, D6) ----------

export function week(s: State): DateStr[] {
  return Array.from({ length: 7 }, (_, i) => addDays(s.clock.today, i))
}

export function cutoffOf(s: State, date: DateStr): number {
  return findDay(s, date)?.cutoff ?? s.settings.defaultCutoff
}

/** True while orders for `date` can still be placed, edited or cancelled (time only). */
export function beforeCutoff(s: State, date: DateStr): boolean {
  if (date > s.clock.today) return true
  if (date < s.clock.today) return false
  return s.clock.minutes < cutoffOf(s, date)
}

export type DayState = 'open' | 'pastCutoff' | 'closed' | 'noMenu' | 'outOfRange'

export function dayState(s: State, date: DateStr): DayState {
  // Only today and the next 6 days take orders (BR-3, CN-7).
  if (date < s.clock.today || date > addDays(s.clock.today, 6)) return 'outOfRange'
  const day = findDay(s, date)
  if (day?.closed) return 'closed'
  if (!day?.menu) return 'noMenu'
  if (!beforeCutoff(s, date)) return 'pastCutoff'
  return 'open'
}

// ---------- Build-your-own plates (BR-7 – BR-9) ----------

export function groupCounts(s: State, picks: string[]): Map<string, number> {
  const counts = new Map<string, number>(s.groups.map((g) => [g.id, 0]))
  for (const id of picks) {
    const g = findDish(s, id)?.groupId
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return counts
}

/** Base price + every chosen dish's surcharge + the extra dish fee beyond each group's included count. */
export function platePrice(s: State, picks: string[]): number {
  let price = s.settings.basePrice
  for (const id of picks) price += findDish(s, id)?.surcharge ?? 0
  for (const [groupId, n] of groupCounts(s, picks)) {
    const g = findGroup(s, groupId)
    if (g && n > g.included) price += (n - g.included) * g.extraFee
  }
  return price
}

export function plateValid(s: State, date: DateStr, picks: string[]): boolean {
  const components = findDay(s, date)?.menu?.components ?? []
  if (picks.some((id) => !components.includes(id))) return false
  for (const [groupId, n] of groupCounts(s, picks)) {
    const g = findGroup(s, groupId)
    if (g && (n < g.min || n > g.max)) return false
  }
  return true
}

// ---------- Money (BR-19 – BR-21, section 4.2 and 4.3) ----------

export const lineTotal = (l: Line): number => l.unitPrice * l.qty
export const linesTotal = (lines: Line[]): number => lines.reduce((sum, l) => sum + lineTotal(l), 0)
export const orderTotal = (o: Order): number => linesTotal(o.lines)

export const isActive = (st: Status): boolean => st !== 'rejected' && st !== 'cancelled'

/** Money the shop holds for the order: confirmed receipts minus refunds recorded. */
export const netPaid = (o: Order): number => o.received - o.refunds.reduce((sum, r) => sum + r.amount, 0)

/**
 * What happened to the customer's money, for display: everything the shop confirmed it received,
 * refunds still to send back, and refunds already sent. A refund does not lower "received".
 */
export function moneySummary(o: Order): { received: number; reported: number; pendingRefund: number; refunded: number } {
  const sum = (done: boolean) => o.refunds.filter((r) => (r.refundedAt !== null) === done).reduce((n, r) => n + r.amount, 0)
  return { received: o.received, reported: reportedTotal(o), pendingRefund: sum(false), refunded: sum(true) }
}

/** Money of an active order the shop has not confirmed yet; reported money is not confirmed (CN-6, CN-42). */
export function owed(o: Order): number {
  if (!isActive(o.status)) return 0
  return Math.max(0, orderTotal(o) - netPaid(o))
}

/** All transfers reported and not yet confirmed or turned down (CN-37, CN-43). */
export const reportedTotal = (o: Order): number => o.reports.reduce((sum, r) => sum + r.amount, 0)

/** What the customer still has to transfer: not confirmed, minus what they already reported (CN-37). */
export function toPay(o: Order): number {
  return Math.max(0, owed(o) - reportedTotal(o))
}

export function paymentState(o: Order): PaymentState {
  if (netPaid(o) >= orderTotal(o)) return 'paid'
  if (o.reports.length > 0) return 'reported'
  if (netPaid(o) > 0) return 'underpaid'
  return 'unpaid'
}

export type RefundState = 'none' | 'needsRefund' | 'refunded'

export function refundState(o: Order): RefundState {
  if (o.refunds.length === 0) return 'none'
  return o.refunds.some((r) => r.refundedAt === null) ? 'needsRefund' : 'refunded'
}

// ---------- Guards ----------

/** Can the customer edit or cancel this order now? (BR-13, OQ6, CN-12) */
export function customerChangeBlock(s: State, o: Order): ErrorCode | null {
  if (!isActive(o.status)) return 'notActive'
  if (o.status !== 'placed' && o.status !== 'confirmed') return 'preparing'
  if (!beforeCutoff(s, o.date)) return 'pastCutoff'
  return null
}

export const canReject = (o: Order): boolean => o.status === 'placed' || o.status === 'confirmed'

// ---------- Helpers ----------

function now(s: State): string {
  return stamp(s.clock.today, s.clock.minutes)
}

function nextId(s: State, prefix: string): [State, string] {
  const seq = s.seq + 1
  return [{ ...s, seq }, `${prefix}${seq}`]
}

function patchOrder(s: State, id: string, fn: (o: Order) => Order): State {
  return { ...s, orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) }
}

function moveTo(s: State, o: Order, status: Status): Order {
  return { ...o, status, history: [...o.history, { kind: 'status', status, at: now(s) }] }
}

function withRefund(s: State, o: Order, amount: number, reason: RefundReason, createdAt = now(s)): [State, Order] {
  if (amount <= 0) return [s, o]
  const [s2, id] = nextId(s, 'r')
  return [s2, { ...o, refunds: [...o.refunds, { id, amount, reason, createdAt, refundedAt: null, method: null }] }]
}

/** Cash at delivery can be chosen only for an order still to be delivered (CN-54). */
export const cashAllowed = (o: Order): boolean => o.status === 'placed' || o.status === 'confirmed' || o.status === 'preparing'

/** A closed order is not delivered: a cash choice goes back to not chosen (CN-54). */
const dropCash = (o: Order): Order => (o.refundTo?.kind === 'cash' ? { ...o, refundTo: null } : o)

/** How the customer wants the refund, as the default way the shop records it (CN-54). */
export const customerRefundMethod = (o: Order): RefundMethod => (o.refundTo?.kind === 'cash' ? 'cash' : 'transfer')

// ---------- Customer actions ----------

export function addToCart(s: State, date: DateStr, line: NewLine): Result {
  if (dayState(s, date) !== 'open') return fail(dayState(s, date) === 'pastCutoff' ? 'pastCutoff' : 'dayNotOpen')
  if (line.kind === 'plate' && !plateValid(s, date, line.picks)) return fail('invalidPlate')
  const [s2, id] = nextId(s, 'l')
  const cart = s2.carts[date] ?? []
  // Same fixed dish again: add to the existing line.
  if (line.kind === 'fixed') {
    const same = cart.find((l) => l.kind === 'fixed' && l.dishId === line.dishId)
    if (same) return setCartQty(s, date, same.id, same.qty + line.qty)
  }
  return ok({ ...s2, carts: { ...s2.carts, [date]: [...cart, { ...line, id } as Line] } }, id)
}

export function setCartQty(s: State, date: DateStr, lineId: string, qty: number): Result {
  const cart = s.carts[date] ?? []
  const next = qty <= 0 ? cart.filter((l) => l.id !== lineId) : cart.map((l) => (l.id === lineId ? { ...l, qty } : l))
  return ok({ ...s, carts: { ...s.carts, [date]: next } })
}

export function proposeBuilding(s: State, name: string, address: string): Result {
  const [s2, id] = nextId(s, 'b-new-')
  const b: Building = { id, name: name.trim(), address: address.trim(), deliveryTime: null, state: 'pending', proposedBy: s.me, past: [] }
  return ok({ ...s2, buildings: [...s2.buildings, b] }, id)
}

/** Approved buildings, or a pending one proposed by this customer (BR-16, CN-25). */
function usableBuilding(s: State, id: string): boolean {
  const b = findBuilding(s, id)
  return !!b && (b.state === 'approved' || (b.state === 'pending' && b.proposedBy === s.me))
}

export function placeOrder(s: State, date: DateStr, buildingId: string, note: string): Result {
  const state = dayState(s, date)
  if (state === 'pastCutoff') return fail('pastCutoff')
  if (state !== 'open') return fail('dayNotOpen')
  const cart = s.carts[date] ?? []
  if (cart.length === 0) return fail('emptyCart')
  if (!usableBuilding(s, buildingId)) return fail('buildingMissing')
  const n = s.orders.filter((o) => o.date === date).length + 1
  const [s2, id] = nextId(s, 'o')
  const order: Order = {
    id,
    code: orderCode(date, n),
    customerId: s.me,
    date,
    buildingId,
    note: note.trim(),
    lines: cart,
    status: 'placed',
    received: 0,
    reports: [],
    missing: [],
    endReason: null,
    refunds: [],
    kept: false,
    history: [{ kind: 'status', status: 'placed', at: now(s) }],
    shopNote: '',
    refundTo: null,
  }
  const carts = { ...s2.carts }
  delete carts[date]
  return ok({ ...s2, orders: [...s2.orders, order], carts }, id)
}

export function reportTransfer(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  // The amount reported is the amount the app asks for at this moment (CN-37).
  const amount = toPay(o)
  if (amount === 0) return fail('nothingOwed')
  // Each tap is its own report, answered on its own by the shop (CN-43).
  const [s2, reportId] = nextId(s, 'p')
  const report = { id: reportId, amount, at: now(s) }
  return ok(patchOrder(s2, id, (x) => ({ ...x, reports: [...x.reports, report], missing: [] })))
}

export function cancelOrder(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  const block = customerChangeBlock(s, o)
  if (block) return fail(block)
  // Only confirmed money is refunded now; a reported transfer waits for the shop (CN-39).
  const [s2, withR] = withRefund(s, o, netPaid(o), 'cancel')
  return ok(patchOrder(s2, id, () => dropCash({ ...moveTo(s2, withR, 'cancelled'), endReason: 'cancel' })))
}

/**
 * Edit returns the order to Placed (BR-14); the money difference is topped up or refunded (BR-20).
 * A reported transfer is kept (CN-37); refunds not yet sent are recalculated (CN-40).
 */
export function editOrder(s: State, id: string, lines: Line[], buildingId: string, note: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  const block = customerChangeBlock(s, o)
  if (block) return fail(block)
  const kept = lines.filter((l) => l.qty > 0)
  if (kept.length === 0) return fail('emptyCart')
  if (!usableBuilding(s, buildingId) && buildingId !== o.buildingId) return fail('buildingMissing')
  const newTotal = linesTotal(kept)
  // Refunds not yet paid back are recomputed from scratch: a refund is needed only while the
  // money the shop confirmed is more than the new total (section 4.3, BR-20).
  const edited: Order = {
    ...o,
    lines: kept,
    buildingId,
    note: note.trim(),
    refunds: o.refunds.filter((r) => r.refundedAt !== null),
  }
  // A refund recalculated by the edit keeps the time the earliest dropped one was recorded, so the reminder does not restart (CN-53).
  const dropped = o.refunds
    .filter((r) => r.refundedAt === null)
    .map((r) => r.createdAt)
    .sort()[0]
  const [s2, withR] = withRefund(s, edited, netPaid(edited) - newTotal, 'edit', dropped ?? now(s))
  // Every saved edit is recorded with what changed, then the order is back to Placed (CN-32).
  const entry = {
    kind: 'edit' as const,
    at: now(s),
    fromTotal: orderTotal(o),
    toTotal: newTotal,
    changes: editChanges(o, kept, buildingId, note.trim()),
  }
  const logged = { ...withR, history: [...withR.history, entry] }
  // The Lead's wording: "Order edited", then the line "Placed", also when it was already Placed (CN-32).
  const next = moveTo(s2, logged, 'placed')
  const drafts = { ...s2.drafts }
  delete drafts[id]
  return ok({ ...patchOrder(s2, id, () => next), drafts })
}

/** What one edit changed: lines added or removed, quantities, building, note (CN-32). */
export function editChanges(o: Order, lines: Line[], buildingId: string, note: string): EditChange[] {
  const changes: EditChange[] = []
  for (const old of o.lines) {
    const cur = lines.find((l) => l.id === old.id)
    if (!cur) changes.push({ type: 'removed', line: old })
    else if (cur.qty !== old.qty) changes.push({ type: 'qty', line: old, from: old.qty, to: cur.qty })
  }
  for (const l of lines) if (!o.lines.some((old) => old.id === l.id)) changes.push({ type: 'added', line: l })
  if (buildingId !== o.buildingId) changes.push({ type: 'building', from: o.buildingId, to: buildingId })
  if (note !== o.note) changes.push({ type: 'note', from: o.note, to: note })
  return changes
}

// ---------- Edit drafts: change everything, then save once (CN-29) ----------

export function startEdit(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  const block = customerChangeBlock(s, o)
  if (block) return fail(block)
  if (s.drafts[id]) return ok(s)
  return ok({ ...s, drafts: { ...s.drafts, [id]: { lines: o.lines, buildingId: o.buildingId, note: o.note } } })
}

export function setDraft(s: State, id: string, draft: EditDraft): State {
  return { ...s, drafts: { ...s.drafts, [id]: draft } }
}

export function discardEdit(s: State, id: string): State {
  const drafts = { ...s.drafts }
  delete drafts[id]
  return { ...s, drafts }
}

/** A new build-your-own plate goes into the edit in progress, not straight into the order (CN-23, CN-29). */
export function addPlateToDraft(s: State, id: string, plate: Omit<PlateLine, 'id'>): Result {
  const started = startEdit(s, id)
  if (!started.ok) return started
  const o = findOrder(started.state, id)!
  if (!plateValid(started.state, o.date, plate.picks)) return fail('invalidPlate')
  const [s2, lineId] = nextId(started.state, 'l')
  const draft = s2.drafts[id]
  return ok(setDraft(s2, id, { ...draft, lines: [...draft.lines, { ...plate, id: lineId }] }), lineId)
}

/** How the customer wants the refund of this order: an account or QR photo (CN-33), or cash at delivery (CN-54). */
export function setRefundTo(s: State, id: string, to: RefundTo): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  if (refundState(o) !== 'needsRefund') return fail('noRefundDue')
  if (to.kind === 'cash') return cashAllowed(o) ? ok(patchOrder(s, id, (x) => ({ ...x, refundTo: to }))) : fail('cashNotAllowed')
  const filled = to.kind === 'account' ? [to.bank, to.account, to.holder].every((v) => v.trim() !== '') : to.image.startsWith('data:image/')
  if (!filled) return fail('refundToMissing')
  const clean: RefundTo =
    to.kind === 'account' ? { kind: 'account', bank: to.bank.trim(), account: to.account.trim(), holder: to.holder.trim() } : to
  return ok(patchOrder(s, id, (x) => ({ ...x, refundTo: clean })))
}

// ---------- Shop actions ----------

export function confirmOrder(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  if (o.status !== 'placed') return fail('notPlaced')
  if (findBuilding(s, o.buildingId)?.state !== 'approved') return fail('buildingPending')
  return ok(patchOrder(s, id, (x) => moveTo(s, x, 'confirmed')))
}

/**
 * Shop confirms receipt from Unpaid, Reported or Underpaid (BR-19, CN-17).
 * - With a report id: exactly that report's amount (CN-38, CN-43), also on a Cancelled or Rejected order (CN-39).
 * - Without one: the full amount owed that the customer has not reported (CN-28, CN-48); this also
 *   clears the "not found" notice (CN-46).
 * Money beyond what the order now needs is recorded as Needs refund.
 */
export function confirmPayment(s: State, id: string, reportId?: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  let amount: number
  let reports = o.reports
  let missing = o.missing
  if (reportId !== undefined) {
    const report = o.reports.find((r) => r.id === reportId)
    if (!report) return fail('nothingReported')
    amount = report.amount
    reports = o.reports.filter((r) => r.id !== reportId)
  } else {
    amount = toPay(o)
    missing = []
  }
  if (amount === 0) return fail('nothingOwed')
  const paid = { ...o, received: o.received + amount, reports, missing }
  const active = isActive(o.status)
  const extra = netPaid(paid) - (active ? orderTotal(paid) : 0)
  const [s2, withR] = withRefund(s, paid, extra, active ? 'edit' : (o.endReason ?? 'reject'))
  return ok(patchOrder(s2, id, () => withR))
}

/** The shop did not find one reported transfer: clear that report and tell the customer (CN-41, CN-43). */
export function reportNotReceived(s: State, id: string, reportId: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  const report = o.reports.find((r) => r.id === reportId)
  if (!report) return fail('nothingReported')
  const entry = { kind: 'reportMissing' as const, at: now(s), amount: report.amount }
  return ok(
    patchOrder(s, id, (x) => ({
      ...x,
      reports: x.reports.filter((r) => r.id !== reportId),
      missing: [...x.missing, report.amount],
      history: [...x.history, entry],
    })),
  )
}

export function rejectOrder(s: State, id: string, reason: RefundReason = 'reject'): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  if (!canReject(o)) return fail(isActive(o.status) ? 'cannotReject' : 'notActive')
  // Only confirmed money is refunded now; a reported transfer waits for the shop (CN-39).
  const [s2, withR] = withRefund(s, o, netPaid(o), reason)
  return ok(patchOrder(s2, id, () => dropCash({ ...moveTo(s2, withR, 'rejected'), endReason: reason })))
}

/** Keep an unpaid order at the cutoff review; it leaves the list (CN-18). */
export function keepOrder(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  if (!reviewList(s, o.date).some((x) => x.id === id) || o.status === 'placed') return fail('cannotKeep')
  return ok(patchOrder(s, id, (x) => ({ ...x, kept: true })))
}

function moveMany(s: State, ids: string[], from: Status, to: Status, error: ErrorCode, note?: string): Result {
  const orders = ids.map((id) => findOrder(s, id))
  if (orders.some((o) => !o)) return fail('notFound')
  if (orders.some((o) => o!.status !== from)) return fail(error)
  let next = s
  for (const id of ids) {
    next = patchOrder(next, id, (x) => ({ ...moveTo(next, x, to), shopNote: note?.trim() ? note.trim() : x.shopNote }))
  }
  return ok(next)
}

/** Each selected Shop confirmed order moves on its own; Placed orders cannot move (BR-24). */
export const startPreparing = (s: State, ids: string[]) => moveMany(s, ids, 'confirmed', 'preparing', 'notConfirmed')
export const markDelivering = (s: State, ids: string[]) => moveMany(s, ids, 'preparing', 'delivering', 'notPreparing')
export const markDelivered = (s: State, ids: string[], note?: string) => moveMany(s, ids, 'delivering', 'delivered', 'notDelivering', note)

/** Mark a refund made, recording how: bank transfer or cash, by default the customer's choice (CN-54). */
export function markRefunded(s: State, orderId: string, refundId: string, method?: RefundMethod): Result {
  const o = findOrder(s, orderId)
  if (!o) return fail('notFound')
  const how = method ?? customerRefundMethod(o)
  return ok(
    patchOrder(s, orderId, (x) => ({
      ...x,
      refunds: x.refunds.map((r) => (r.id === refundId && r.refundedAt === null ? { ...r, refundedAt: now(s), method: how } : r)),
    })),
  )
}

/** Money still to give back on an order. */
export const pendingRefund = (o: Order): number => o.refunds.filter((r) => r.refundedAt === null).reduce((n, r) => n + r.amount, 0)

/** "Cash given back" on the delivery list: every pending refund of the order is made in cash (CN-54). */
export function giveCashBack(s: State, id: string): Result {
  const o = findOrder(s, id)
  if (!o) return fail('notFound')
  if (pendingRefund(o) === 0) return fail('noRefundDue')
  let next = s
  for (const r of o.refunds) {
    if (r.refundedAt !== null) continue
    const res = markRefunded(next, id, r.id, 'cash')
    if (res.ok) next = res.state
  }
  return ok(next)
}

/**
 * The shop's reminder (CN-53): shown once any refund has been pending for an hour, hidden for an hour
 * after "Seen". Counts every order not refunded, with the total.
 */
export function refundReminder(s: State): { orders: number; total: number } | null {
  const at = stampMinutes(now(s))
  const pending = s.orders.flatMap((o) => o.refunds.filter((r) => r.refundedAt === null).map((r) => ({ o, r })))
  if (!pending.some(({ r }) => at - stampMinutes(r.createdAt) >= 60)) return null
  if (s.refundReminderSeen && at - stampMinutes(s.refundReminderSeen) < 60) return null
  return { orders: new Set(pending.map(({ o }) => o.id)).size, total: pending.reduce((n, { r }) => n + r.amount, 0) }
}

export function seeRefundReminder(s: State): State {
  return { ...s, refundReminderSeen: now(s) }
}

/** The shop adds a building itself: approved at once, with its delivery time, and every customer sees it (BR-16, BR-18, CN-61). */
export function addBuilding(s: State, name: string, address: string, deliveryTime: number): Result {
  if (!name.trim()) return fail('buildingMissing')
  const [s2, id] = nextId(s, 'b-new-')
  const b: Building = { id, name: name.trim(), address: address.trim(), deliveryTime, state: 'approved', proposedBy: null, past: [] }
  return ok({ ...s2, buildings: [...s2.buildings, b] }, id)
}

export function approveBuilding(s: State, id: string, deliveryTime: number): Result {
  if (!findBuilding(s, id)) return fail('notFound')
  return ok({ ...s, buildings: s.buildings.map((b) => (b.id === id ? { ...b, state: 'approved', deliveryTime } : b)) })
}

/** A new delivery time applies to days not yet past their cutoff (BR-18, OQ5). */
export function setDeliveryTime(s: State, id: string, deliveryTime: number): Result {
  if (!findBuilding(s, id)) return fail('notFound')
  const lastLocked = beforeCutoff(s, s.clock.today) ? addDays(s.clock.today, -1) : s.clock.today
  return ok({
    ...s,
    buildings: s.buildings.map((b) =>
      b.id === id ? { ...b, deliveryTime, past: [...b.past, { until: lastLocked, time: b.deliveryTime }] } : b,
    ),
  })
}

/** The delivery time that applies to a building on a given day. */
export function deliveryTimeOn(b: Building, date: DateStr): number | null {
  let best: Building['past'][number] | null = null
  for (const e of b.past) if (e.until >= date && (best === null || e.until < best.until)) best = e
  return best ? best.time : b.deliveryTime
}

/**
 * Orders that declining a building would reject, with the amount each would need refunded (CN-26),
 * and the amount reported but not confirmed, refunded only if the shop confirms it (CN-39).
 */
export function declinePreview(s: State, id: string): { order: Order; refund: number; reported: number }[] {
  return s.orders
    .filter((o) => o.buildingId === id && canReject(o))
    .map((order) => ({ order, refund: Math.max(0, netPaid(order)), reported: reportedTotal(order) }))
}

/** Decline a pending building and reject its active orders, with refunds if paid (BR-17, F5). */
export function declineBuilding(s: State, id: string): Result {
  if (!findBuilding(s, id)) return fail('notFound')
  let next: State = { ...s, buildings: s.buildings.map((b) => (b.id === id ? { ...b, state: 'declined' } : b)) }
  for (const o of next.orders) {
    if (o.buildingId === id && canReject(o)) {
      const r = rejectOrder(next, o.id, 'building')
      if (r.ok) next = r.state
    }
  }
  return ok(next)
}

// ---------- Shop views ----------

export function dayOrders(s: State, date: DateStr): Order[] {
  return s.orders.filter((o) => o.date === date)
}

/** Cutoff review (BR-22, BR-23, AC9): after the cutoff, orders still Placed and unpaid orders not yet kept. */
export function reviewList(s: State, date: DateStr): Order[] {
  if (beforeCutoff(s, date)) return []
  return dayOrders(s, date).filter((o) => isActive(o.status) && (o.status === 'placed' || (paymentState(o) !== 'paid' && !o.kept)))
}

export type PrepColumn = 'preparing' | 'confirmed' | 'placed' | 'done'
export type PrepRow = { dishId: string; kind: 'fixed' | 'component'; counts: Record<PrepColumn, number>; total: number }

const prepColumn = (st: Status): PrepColumn | null => {
  if (st === 'preparing' || st === 'confirmed' || st === 'placed') return st
  if (st === 'delivering' || st === 'delivered') return 'done'
  return null
}

/** Preparation sheet (BR-25, CN-21): portions per fixed dish and per component, by status. */
export function prepSheet(s: State, date: DateStr): PrepRow[] {
  const rows = new Map<string, PrepRow>()
  const add = (dishId: string, kind: PrepRow['kind'], col: PrepColumn, qty: number) => {
    const key = `${kind}:${dishId}`
    const row = rows.get(key) ?? { dishId, kind, counts: { preparing: 0, confirmed: 0, placed: 0, done: 0 }, total: 0 }
    row.counts[col] += qty
    row.total += qty
    rows.set(key, row)
  }
  for (const o of dayOrders(s, date)) {
    const col = prepColumn(o.status)
    if (!col) continue
    for (const l of o.lines) {
      if (l.kind === 'fixed') add(l.dishId, 'fixed', col, l.qty)
      else for (const d of l.picks) add(d, 'component', col, l.qty)
    }
  }
  const order = (r: PrepRow) => s.dishes.findIndex((d) => d.id === r.dishId)
  return [...rows.values()].sort((a, b) => (a.kind === b.kind ? order(a) - order(b) : a.kind === 'fixed' ? -1 : 1))
}

export type DeliveryGroup = { building: Building; time: number | null; orders: Order[] }

const DELIVERY_STATUSES: Status[] = ['confirmed', 'preparing', 'delivering', 'delivered']

/** Delivery list (BR-26, CN-19): orders from Shop confirmed onwards, by building and delivery time. */
export function deliveryList(s: State, date: DateStr): DeliveryGroup[] {
  const groups = new Map<string, DeliveryGroup>()
  for (const o of dayOrders(s, date)) {
    if (!DELIVERY_STATUSES.includes(o.status)) continue
    const building = findBuilding(s, o.buildingId)
    if (!building) continue
    const g = groups.get(building.id) ?? { building, time: deliveryTimeOn(building, date), orders: [] }
    g.orders.push(o)
    groups.set(building.id, g)
  }
  return [...groups.values()].sort((a, b) => (a.time ?? 9999) - (b.time ?? 9999))
}

export function refundList(s: State): { order: Order; refund: Order['refunds'][number] }[] {
  return s.orders.flatMap((order) => order.refunds.map((refund) => ({ order, refund })))
}

// ---------- Sorting and searching on the shop screens (CN-56) ----------

/** The time the customer placed the order: its first history line. */
export const placedAt = (o: Order): string => o.history[0]?.at ?? ''

/** Newest order first, by the time it was placed; orders placed at the same minute keep the newest created first. */
export function newestFirst<T>(s: State, items: T[], orderOf: (x: T) => Order): T[] {
  const index = new Map(s.orders.map((o, i) => [o.id, i]))
  return [...items].sort((a, b) => {
    const oa = orderOf(a)
    const ob = orderOf(b)
    const byTime = stampMinutes(placedAt(ob)) - stampMinutes(placedAt(oa))
    return byTime !== 0 ? byTime : (index.get(ob.id) ?? 0) - (index.get(oa.id) ?? 0)
  })
}

/** Lower case without Vietnamese accents, so "binh" matches "Bình". */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
}

/** Search by order code, customer name or phone number: contains, ignoring case, accents and spaces in the phone (CN-56). */
export function matchesSearch(s: State, o: Order, query: string): boolean {
  const q = plain(query.trim())
  if (q === '') return true
  const c = findCustomer(s, o.customerId)
  const digits = q.replace(/\s/g, '')
  return (
    plain(o.code).includes(q) || plain(c?.name ?? '').includes(q) || (digits !== '' && (c?.phone ?? '').replace(/\s/g, '').includes(digits))
  )
}
