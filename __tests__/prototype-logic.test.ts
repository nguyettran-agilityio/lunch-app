// @vitest-environment node
// Business rules of the prototype against the acceptance criteria in docs/spec.md.
import { describe, expect, it } from 'vitest'
import {
  addBuilding,
  addPlateToDraft,
  addToCart,
  cancelOrder,
  matchesSearch,
  newestFirst,
  plain,
  cashAllowed,
  giveCashBack,
  refundReminder,
  seeRefundReminder,
  confirmOrder,
  confirmPayment,
  dayState,
  declineBuilding,
  declinePreview,
  dishName,
  deliveryList,
  editOrder,
  findOrder,
  keepOrder,
  markDelivered,
  markDelivering,
  markRefunded,
  moneySummary,
  setDeliveryTime,
  owed,
  paymentState,
  placeOrder,
  platePrice,
  plateValid,
  prepSheet,
  refundState,
  rejectOrder,
  reportedTotal,
  reportNotReceived,
  reportTransfer,
  reviewList,
  canReject,
  setRefundTo,
  startEdit,
  startPreparing,
  toPay,
  type DraftResult,
  type Result,
} from '../src/domain/logic'
import { seed as protoSeed } from '../src/proto/seed'
import { addDays, vietnamNow } from '../src/domain/time'
import type { EditDraft, Line, NewId, State } from '../src/domain/types'

const TODAY = '2026-11-19'
const TOMORROW = addDays(TODAY, 1)

/** The prototype's fake data, seen as the domain State the rules work on (B24, B29). */
const seed = (today: string, minutes?: number): State => protoSeed(today, minutes)

/** Ids for records the rules create (B30): unique across the whole file. */
let idSeq = 1000
const newId: NewId = (prefix) => `${prefix}${++idSeq}`

function must(r: Result): State {
  if (!r.ok) throw new Error(`action failed: ${r.error}`)
  return r.state
}

function mustDraft(r: DraftResult): EditDraft {
  if (!r.ok) throw new Error(`draft failed: ${r.error}`)
  return r.draft
}

const at = (s: State, minutes: number): State => ({ ...s, clock: { ...s.clock, minutes } })

/** Place a fresh order for the current customer and return [state, orderId]. */
function place(s: State, date: string, dishId = 'd-thitkho', qty = 1): [State, string] {
  let st = must(addToCart(s, date, { kind: 'fixed', dishId, qty, unitPrice: s.dishes.find((d) => d.id === dishId)!.price! }, newId))
  const r = placeOrder(st, date, 'b-bitexco', 'Tầng 3', newId)
  st = must(r)
  return [st, (r as { id: string }).id]
}

describe('ordering and cutoff', () => {
  it('AC1: a placed order is Placed, Unpaid, owes the exact total, with an LA code', () => {
    const [s, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    const o = findOrder(s, id)!
    expect(o.status).toBe('placed')
    expect(paymentState(o)).toBe('unpaid')
    expect(owed(o)).toBe(90000)
    expect(o.code).toMatch(/^LA1119\d{3}$/)
  })

  it('AC2: past the cutoff, placing, editing and cancelling are refused', () => {
    let s = seed(TODAY)
    const [s1, id] = place(s, TODAY)
    s = at(s1, 9 * 60 + 31)
    expect(dayState(s, TODAY)).toBe('pastCutoff')
    expect(addToCart(s, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }, newId)).toEqual({
      ok: false,
      error: 'pastCutoff',
    })
    expect(cancelOrder(s, id, newId)).toEqual({ ok: false, error: 'pastCutoff' })
    expect(editOrder(s, id, findOrder(s, id)!.lines, 'b-bitexco', '', newId)).toEqual({ ok: false, error: 'pastCutoff' })
  })

  it('a cutoff override applies to its own day only', () => {
    const s = at(seed(TODAY), 9 * 60 + 45)
    expect(dayState(s, TODAY)).toBe('pastCutoff')
    expect(dayState(s, addDays(TODAY, 2))).toBe('open')
  })

  it('days without a menu and closed days do not take orders', () => {
    const s = seed(TODAY)
    expect(dayState(s, addDays(TODAY, 4))).toBe('noMenu')
    expect(dayState(s, addDays(TODAY, 5))).toBe('closed')
  })

  it('AC4: two orders for the same day each have their own total and code', () => {
    const [s1, a] = place(seed(TODAY), TOMORROW, 'd-thitkho')
    const [s2, b] = place(s1, TOMORROW, 'd-comga')
    expect(findOrder(s2, a)!.code).not.toBe(findOrder(s2, b)!.code)
    expect(owed(findOrder(s2, a)!)).toBe(40000)
    expect(owed(findOrder(s2, b)!)).toBe(45000)
  })

  it('AC21: one cart per day; placing one day leaves the other cart', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }, newId))
    s = must(addToCart(s, TOMORROW, { kind: 'fixed', dishId: 'd-comga', qty: 1, unitPrice: 45000 }, newId))
    s = must(placeOrder(s, TOMORROW, 'b-bitexco', '', newId))
    expect(s.carts[TOMORROW]).toBeUndefined()
    expect(s.carts[TODAY]).toHaveLength(1)
  })

  it('AC17: today and the time are taken in Asia/Ho_Chi_Minh', () => {
    // 2026-11-18 20:30 UTC is 2026-11-19 03:30 in Vietnam.
    expect(vietnamNow(new Date('2026-11-18T20:30:00Z'))).toEqual({ today: '2026-11-19', minutes: 3 * 60 + 30 })
  })
})

describe('build-your-own plates', () => {
  it('AC3: 35k base, ribs +5k and a vegetable = 40k; an egg as a second main = 50k', () => {
    const s = seed(TODAY)
    expect(platePrice(s, ['d-suon', 'd-raumuong'])).toBe(40000)
    expect(platePrice(s, ['d-suon', 'd-raumuong', 'd-trung'])).toBe(50000)
    expect(plateValid(s, TODAY, ['d-suon', 'd-raumuong', 'd-trung'])).toBe(true)
  })

  it('AC3: 0 mains or 2 vegetables cannot be added', () => {
    const s = seed(TODAY)
    expect(plateValid(s, TODAY, ['d-raumuong'])).toBe(false)
    expect(plateValid(s, TODAY, ['d-suon', 'd-raumuong', 'd-caithia'])).toBe(false)
    expect(addToCart(s, TODAY, { kind: 'plate', picks: ['d-raumuong'], qty: 1, unitPrice: 35000 }, newId)).toEqual({
      ok: false,
      error: 'invalidPlate',
    })
  })

  it('a plate only takes components on that day’s menu', () => {
    expect(plateValid(seed(TODAY), TODAY, ['d-ga', 'd-raumuong'])).toBe(false)
  })
})

describe('editing, payment and refunds', () => {
  function paidOrder(total: 'd-thitkho' | 'd-bunbo' = 'd-thitkho'): [State, string] {
    const [s, id] = place(seed(TODAY), TODAY, total)
    return [must(confirmPayment(must(confirmOrder(s, id)), id, undefined, newId)), id]
  }

  it('AC5: editing a Shop confirmed order sends it back to Placed', () => {
    const [s, id] = paidOrder()
    const o = findOrder(s, id)!
    const s2 = must(
      editOrder(
        s,
        id,
        o.lines.map((l) => ({ ...l, qty: 1 })),
        'b-viettel',
        'Tầng 9',
        newId,
      ),
    )
    expect(findOrder(s2, id)!.status).toBe('placed')
    expect(findOrder(s2, id)!.buildingId).toBe('b-viettel')
  })

  it('AC6: a paid 50k order edited up to 65k is Underpaid with 15k owed', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }, newId))
    const r = placeOrder(s, TODAY, 'b-bitexco', '', newId)
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id, undefined, newId))
    const lines: Line[] = [...findOrder(s, id)!.lines, { id: 'x', kind: 'fixed', dishId: 'd-suon', qty: 1, unitPrice: 15000 }]
    s = must(editOrder(s, id, lines, 'b-bitexco', '', newId))
    const o = findOrder(s, id)!
    expect(paymentState(o)).toBe('underpaid')
    expect(owed(o)).toBe(15000)
  })

  it('AC7: a paid 50k order edited down to 40k needs a 10k refund for "edit"', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }, newId))
    const r = placeOrder(s, TODAY, 'b-bitexco', '', newId)
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id, undefined, newId))
    const lines: Line[] = [{ id: 'y', kind: 'plate', picks: ['d-suon', 'd-raumuong'], qty: 1, unitPrice: 40000 }]
    s = must(editOrder(s, id, lines, 'b-bitexco', '', newId))
    const o = findOrder(s, id)!
    expect(refundState(o)).toBe('needsRefund')
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 10000, reason: 'edit' })])
    expect(paymentState(o)).toBe('paid')
  })

  it('AC8: cancelling or rejecting a paid order records a refund of the paid amount', () => {
    const [s, id] = paidOrder('d-bunbo')
    const cancelled = findOrder(must(cancelOrder(s, id, newId)), id)!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'cancel' })])
    const rejected = findOrder(must(rejectOrder(s, id, 'reject', newId)), id)!
    expect(rejected.status).toBe('rejected')
    expect(rejected.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'reject' })])
  })

  it('AC22: the shop can confirm an Unpaid order the customer never reported', () => {
    const [s, id] = place(seed(TODAY), TODAY)
    expect(paymentState(findOrder(s, id)!)).toBe('unpaid')
    expect(paymentState(findOrder(must(confirmPayment(s, id, undefined, newId)), id)!)).toBe('paid')
  })
})

describe('shop day run', () => {
  it('AC9: after the cutoff the review lists Placed and unpaid orders; a kept order leaves it', () => {
    const before = seed(TODAY)
    expect(reviewList(before, TODAY)).toEqual([])
    const s = at(before, 9 * 60 + 31)
    const codes = (st: State) => reviewList(st, TODAY).map((o) => o.customerId)
    // c2 Placed+Reported, c4 confirmed Unpaid, c5 Placed (pending building), c7 Placed Unpaid.
    expect(codes(s).sort()).toEqual(['c2', 'c4', 'c5', 'c7'])
    const c4 = reviewList(s, TODAY).find((o) => o.customerId === 'c4')!
    const kept = must(keepOrder(s, c4.id))
    expect(codes(kept)).not.toContain('c4')
    expect(owed(findOrder(kept, c4.id)!)).toBe(45000)
  })

  it('AC10: a Shop confirmed order moves to Preparing; a Placed one cannot and does not block it', () => {
    const s = seed(TODAY)
    const placed = s.orders.find((o) => o.date === TODAY && o.status === 'placed')!
    const confirmed = s.orders.find((o) => o.date === TODAY && o.status === 'confirmed')!
    expect(startPreparing(s, [placed.id])).toEqual({ ok: false, error: 'notConfirmed' })
    expect(findOrder(must(startPreparing(s, [confirmed.id])), confirmed.id)!.status).toBe('preparing')
  })

  it('AC11: a Preparing order cannot be edited, cancelled or rejected, and counts in the Preparing column', () => {
    const s = seed(TODAY)
    const mine = s.orders.find((o) => o.customerId === 'c1' && o.date === TODAY)!
    const s2 = must(startPreparing(s, [mine.id]))
    expect(cancelOrder(s2, mine.id, newId)).toEqual({ ok: false, error: 'preparing' })
    expect(editOrder(s2, mine.id, mine.lines, mine.buildingId, '', newId)).toEqual({ ok: false, error: 'preparing' })
    expect(rejectOrder(s2, mine.id, 'reject', newId)).toEqual({ ok: false, error: 'cannotReject' })
    const suon = prepSheet(s2, TODAY).find((r) => r.kind === 'component' && r.dishId === 'd-suon')!
    expect(suon.counts.preparing).toBe(1)
  })

  it('AC11, CN-21: the prep sheet splits by status, adds Done, and skips cancelled orders', () => {
    let s = seed(TODAY)
    const tam = s.orders.find((o) => o.customerId === 'c6' && o.date === TODAY)! // Preparing, 1 bún chả
    s = must(markDelivering(s, [tam.id]))
    const buncha = prepSheet(s, TODAY).find((r) => r.kind === 'fixed' && r.dishId === 'd-buncha')!
    // c5 Placed 1 + c6 Done 1.
    expect(buncha.counts).toEqual({ preparing: 0, confirmed: 0, placed: 1, done: 1 })
    expect(buncha.total).toBe(2)
    // The cancelled cơm gà order of c2 is not counted; c3's two portions are.
    expect(prepSheet(s, TODAY).find((r) => r.dishId === 'd-comga')!.total).toBe(2)
  })

  it('AC12, AC23: the delivery list groups by building in delivery time order, from Shop confirmed onwards', () => {
    const s = seed(TODAY)
    const groups = deliveryList(s, TODAY)
    expect(groups.map((g) => g.building.id)).toEqual(['b-bitexco', 'b-viettel', 'b-etown'])
    const statuses = groups.flatMap((g) => g.orders.map((o) => o.status))
    expect(statuses).not.toContain('placed')
    expect(statuses).toContain('confirmed')
    const confirmed = groups[0].orders.find((o) => o.status === 'confirmed')!
    expect(markDelivering(s, [confirmed.id])).toEqual({ ok: false, error: 'notPreparing' })
  })

  it('AC12, CN-13: Delivering then Delivered with a note', () => {
    let s = seed(TODAY)
    const tam = s.orders.find((o) => o.customerId === 'c6' && o.date === TODAY)!
    s = must(markDelivered(must(markDelivering(s, [tam.id])), [tam.id], 'Để ở lễ tân'))
    expect(findOrder(s, tam.id)).toMatchObject({ status: 'delivered', shopNote: 'Để ở lễ tân' })
  })

  it('AC14: an order to a pending building cannot be confirmed; declining rejects it', () => {
    let s = seed(TODAY)
    const lan = s.orders.find((o) => o.customerId === 'c5')!
    expect(confirmOrder(s, lan.id)).toEqual({ ok: false, error: 'buildingPending' })
    s = must(confirmPayment(s, lan.id, undefined, newId))
    s = must(declineBuilding(s, 'b-pearl', newId))
    const after = findOrder(s, lan.id)!
    expect(after.status).toBe('rejected')
    expect(after.refunds).toEqual([expect.objectContaining({ amount: 40000, reason: 'building' })])
  })

  it('a refund for a lowered total is dropped when the order is edited back up (section 4.3)', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }, newId))
    const r = placeOrder(s, TODAY, 'b-bitexco', '', newId)
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id, undefined, newId))
    const original = findOrder(s, id)!.lines
    s = must(
      editOrder(s, id, [{ id: 'y', kind: 'plate', picks: ['d-suon', 'd-raumuong'], qty: 1, unitPrice: 40000 }], 'b-bitexco', '', newId),
    )
    s = must(editOrder(s, id, original, 'b-bitexco', '', newId))
    const o = findOrder(s, id)!
    expect(o.refunds).toEqual([])
    expect(owed(o)).toBe(0)
    expect(paymentState(o)).toBe('paid')
  })

  it('AC8: after the shop marks a refund it is Refunded', () => {
    const s = seed(TODAY)
    const cancelled = s.orders.find((o) => o.status === 'cancelled')!
    const after = must(markRefunded(s, cancelled.id, cancelled.refunds[0].id))
    expect(refundState(findOrder(after, cancelled.id)!)).toBe('refunded')
  })

  it('CN-22: a Placed unpaid order cannot be kept; once confirmed it stays on the review until kept', () => {
    const s = at(seed(TODAY), 9 * 60 + 31)
    const yen = s.orders.find((o) => o.customerId === 'c7')!
    expect(keepOrder(s, yen.id)).toEqual({ ok: false, error: 'cannotKeep' })
    const confirmed = must(confirmOrder(s, yen.id))
    expect(reviewList(confirmed, TODAY).map((o) => o.id)).toContain(yen.id)
    expect(reviewList(must(keepOrder(confirmed, yen.id)), TODAY).map((o) => o.id)).not.toContain(yen.id)
  })

  it('keep is refused before the cutoff', () => {
    const s = seed(TODAY)
    const huy = s.orders.find((o) => o.customerId === 'c4')!
    expect(keepOrder(s, huy.id)).toEqual({ ok: false, error: 'cannotKeep' })
  })

  it('BR-18: a new delivery time skips days already past their cutoff', () => {
    const s = must(setDeliveryTime(at(seed(TODAY), 10 * 60), 'b-etown', 11 * 60))
    const timeOf = (date: string) => deliveryList(s, date).find((g) => g.building.id === 'b-etown')?.time
    expect(timeOf(TODAY)).toBe(12 * 60)
    const before = must(setDeliveryTime(seed(TODAY), 'b-etown', 11 * 60))
    expect(deliveryList(before, TODAY).find((g) => g.building.id === 'b-etown')!.time).toBe(11 * 60)
  })

  it('CN-7: days outside today + 6 do not take orders', () => {
    const s = seed(TODAY)
    expect(dayState(s, addDays(TODAY, 7))).toBe('outOfRange')
    expect(dayState(s, addDays(TODAY, -1))).toBe('outOfRange')
  })

  it('CN-23, CN-29: plates go into the edit in progress; the order changes once, on Save', () => {
    let s = seed(TODAY)
    const mine = s.orders.find((o) => o.customerId === 'c1' && o.date === TODAY)!
    const plate = { kind: 'plate' as const, picks: ['d-thitkho', 'd-raumuong'], qty: 1, unitPrice: 35000 }
    // The draft is kept by the caller and passed back in (B33).
    const first = mustDraft(addPlateToDraft(s, mine.id, undefined, plate, newId))
    const draft = mustDraft(addPlateToDraft(s, mine.id, first, plate, newId))
    // Nothing is saved yet: the order is unchanged and still Shop confirmed.
    expect(findOrder(s, mine.id)).toMatchObject({ status: 'confirmed', lines: mine.lines })
    expect(new Set(draft.lines.map((l) => l.id)).size).toBe(3)
    s = must(editOrder(s, mine.id, draft.lines, draft.buildingId, draft.note, newId))
    const o = findOrder(s, mine.id)!
    expect(o.lines.length).toBe(3)
    expect(o.status).toBe('placed')
    expect(owed(o)).toBe(70000)
    expect(o.history.filter((h) => h.kind === 'edit').length).toBe(1)
  })

  it('CN-29: an edit starts from the order, keeps the edit in progress, and changes nothing until saved', () => {
    const s = seed(TODAY)
    const mine = s.orders.find((o) => o.customerId === 'c1' && o.date === TODAY)!
    const started = mustDraft(startEdit(s, mine.id))
    expect(started).toEqual({ lines: mine.lines, buildingId: mine.buildingId, note: mine.note })
    const changed = { ...started, note: 'Tầng 5' }
    expect(startEdit(s, mine.id, changed)).toEqual({ ok: true, draft: changed })
    // Discarding is dropping the draft: the order is as it was.
    expect(findOrder(s, mine.id)!.note).toBe(mine.note)
  })

  it('a plate cannot be added to an order that is past its cutoff', () => {
    const s = at(seed(TODAY), 9 * 60 + 31)
    const mine = s.orders.find((o) => o.customerId === 'c1' && o.date === TODAY)!
    const plate = { kind: 'plate' as const, picks: ['d-thitkho', 'd-raumuong'], qty: 1, unitPrice: 35000 }
    expect(addPlateToDraft(s, mine.id, undefined, plate, newId)).toEqual({ ok: false, error: 'pastCutoff' })
  })

  it('AC26, CN-32: a saved edit is recorded with the old and new total and each change, then Placed', () => {
    let s = seed(TODAY)
    const mine = s.orders.find((o) => o.customerId === 'c1' && o.date === TODAY)!
    const [plateLine] = mine.lines
    const lines: Line[] = [
      { ...plateLine, qty: 2 },
      { id: 'new-1', kind: 'fixed', dishId: 'd-buncha', qty: 1, unitPrice: 40000 },
    ]
    s = must(editOrder(s, mine.id, lines, 'b-viettel', 'Tầng 9', newId))
    const o = findOrder(s, mine.id)!
    const [edit, back] = o.history.slice(-2)
    expect(edit).toMatchObject({
      kind: 'edit',
      fromTotal: 40000,
      toTotal: 120000,
      changes: [
        { type: 'qty', from: 1, to: 2 },
        { type: 'added', line: { dishId: 'd-buncha' } },
        { type: 'building', from: 'b-bitexco', to: 'b-viettel' },
        { type: 'note', from: 'Tầng 21, phòng 2103', to: 'Tầng 9' },
      ],
    })
    expect(back).toMatchObject({ kind: 'status', status: 'placed' })
  })

  it('CN-32: removing a line is recorded', () => {
    let s = seed(TODAY)
    const huy = s.orders.find((o) => o.customerId === 'c4')!
    s = must(
      editOrder(
        s,
        huy.id,
        [...huy.lines, { id: 'x', kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }],
        huy.buildingId,
        huy.note,
        newId,
      ),
    )
    s = must(editOrder(s, huy.id, [findOrder(s, huy.id)!.lines[1]], huy.buildingId, huy.note, newId))
    const last = findOrder(s, huy.id)!
      .history.filter((h) => h.kind === 'edit')
      .at(-1)!
    expect(last).toMatchObject({ kind: 'edit', changes: [{ type: 'removed', line: { kind: 'plate' } }] })
  })

  it('AC24, CN-26: declining a building previews each order and its refund before rejecting', () => {
    let s = seed(TODAY)
    const lan = s.orders.find((o) => o.customerId === 'c5')!
    s = must(addToCart({ ...s, me: 'c5' }, TOMORROW, { kind: 'fixed', dishId: 'd-comga', qty: 1, unitPrice: 45000 }, newId))
    const r = placeOrder(s, TOMORROW, 'b-pearl', '', newId)
    s = must(r)
    const second = (r as { id: string }).id
    s = must(confirmPayment(s, second, undefined, newId))
    expect(declinePreview(s, 'b-pearl')).toEqual([
      { order: expect.objectContaining({ id: lan.id }), refund: 0, reported: 0 },
      { order: expect.objectContaining({ id: second }), refund: 45000, reported: 0 },
    ])
    // The preview changes nothing.
    expect(findOrder(s, lan.id)!.status).toBe('placed')
    s = must(declineBuilding(s, 'b-pearl', newId))
    expect(findOrder(s, lan.id)!.status).toBe('rejected')
    expect(findOrder(s, second)!.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'building' })])
  })

  it('AC25, CN-27: an unpaid order already Preparing can be kept at the review but not rejected', () => {
    let s = at(seed(TODAY), 9 * 60 + 31)
    const huy = s.orders.find((o) => o.customerId === 'c4')!
    s = must(startPreparing(s, [huy.id]))
    const o = findOrder(s, huy.id)!
    expect(reviewList(s, TODAY).map((x) => x.id)).toContain(huy.id)
    expect(canReject(o)).toBe(false)
    expect(rejectOrder(s, huy.id, 'reject', newId)).toEqual({ ok: false, error: 'cannotReject' })
    expect(reviewList(must(keepOrder(s, huy.id)), TODAY).map((x) => x.id)).not.toContain(huy.id)
  })

  it('CN-38: payment received on a reported order records the amount of that report', () => {
    const s = seed(TODAY)
    const binh = s.orders.find((o) => o.customerId === 'c2' && o.status === 'placed')!
    const after = findOrder(must(confirmPayment(s, binh.id, binh.reports[0].id, newId)), binh.id)!
    expect(after.received).toBe(45000)
    expect(paymentState(after)).toBe('paid')
  })

  it('AC27, CN-33: the customer gives a refund account or a QR photo for an order that needs a refund', () => {
    const s = seed(TODAY)
    const cancelled = s.orders.find((o) => o.status === 'cancelled')!
    expect(cancelled.refundTo).toBeNull()
    expect(setRefundTo(s, cancelled.id, { kind: 'account', bank: 'ACB', account: '', holder: 'TRAN VAN BINH' })).toEqual({
      ok: false,
      error: 'refundToMissing',
    })
    const withAccount = must(setRefundTo(s, cancelled.id, { kind: 'account', bank: ' ACB ', account: '123456', holder: 'TRAN VAN BINH' }))
    expect(findOrder(withAccount, cancelled.id)!.refundTo).toEqual({
      kind: 'account',
      bank: 'ACB',
      account: '123456',
      holder: 'TRAN VAN BINH',
    })
    const withQr = must(setRefundTo(s, cancelled.id, { kind: 'qr', image: 'data:image/jpeg;base64,AAAA' }))
    expect(findOrder(withQr, cancelled.id)!.refundTo).toMatchObject({ kind: 'qr' })
    // Without a destination the shop can still mark it refunded.
    expect(refundState(findOrder(must(markRefunded(s, cancelled.id, cancelled.refunds[0].id)), cancelled.id)!)).toBe('refunded')
  })

  it('CN-33: no refund destination for an order with nothing to refund', () => {
    const s = seed(TODAY)
    const mine = s.orders.find((o) => o.customerId === 'c1')!
    expect(setRefundTo(s, mine.id, { kind: 'account', bank: 'ACB', account: '1', holder: 'A' })).toEqual({
      ok: false,
      error: 'noRefundDue',
    })
  })

  it('CN-25: a pending building can be used only by the customer who proposed it', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }, newId))
    expect(placeOrder(s, TODAY, 'b-pearl', '', newId)).toEqual({ ok: false, error: 'buildingMissing' })
    expect(placeOrder({ ...s, me: 'c5', carts: s.carts }, TODAY, 'b-pearl', '', newId).ok).toBe(true)
  })

  it('CN-32: editing an order that is already Placed still logs the edit then Placed', () => {
    let s = seed(TODAY)
    const lan = s.orders.find((o) => o.customerId === 'c7')!
    s = must(editOrder({ ...s, me: 'c7' }, lan.id, lan.lines, lan.buildingId, 'Tầng 2', newId))
    expect(
      findOrder(s, lan.id)!
        .history.slice(-2)
        .map((h) => h.kind),
    ).toEqual(['edit', 'status'])
  })

  it('a paid order cancelled keeps showing what the shop received, with the refund pending then sent', () => {
    const [placed, id] = place(seed(TODAY), TODAY, 'd-bunbo')
    let s = must(confirmPayment(placed, id, undefined, newId))
    s = must(cancelOrder(s, id, newId))
    expect(moneySummary(findOrder(s, id)!)).toEqual({ received: 45000, reported: 0, pendingRefund: 45000, refunded: 0 })
    const refund = findOrder(s, id)!.refunds[0]
    s = must(markRefunded(s, id, refund.id))
    expect(moneySummary(findOrder(s, id)!)).toEqual({ received: 45000, reported: 0, pendingRefund: 0, refunded: 45000 })
  })

  it('an edit that lowers the total shows the full amount received and the difference pending', () => {
    let s = seed(TODAY)
    const [s1, id] = place(s, TODAY, 'd-bunbo', 2)
    s = must(confirmPayment(s1, id, undefined, newId))
    const line = findOrder(s, id)!.lines[0]
    s = must(editOrder(s, id, [{ ...line, qty: 1 }], 'b-bitexco', '', newId))
    expect(moneySummary(findOrder(s, id)!)).toEqual({ received: 90000, reported: 0, pendingRefund: 45000, refunded: 0 })
  })

  it('AC29, CN-31: dishes show their English name in English when they have one', () => {
    const s = seed(TODAY)
    expect(dishName(s, 'd-bunbo')).toBe('Bún bò Huế')
    const en: State = { ...s, lang: 'en' }
    expect(dishName(en, 'd-bunbo')).toBe('Hue beef noodle soup')
    expect(dishName(en, 'd-buncha')).toBe('Bún chả')
  })
})

describe('money with a reported transfer (CN-37 – CN-42)', () => {
  // Two Bún bò Huế: 90,000. The extra line is one Thịt kho trứng: 40,000.
  const thitkho: Line = { id: 'l-extra', kind: 'fixed', dishId: 'd-thitkho', qty: 1, unitPrice: 40000 }

  /** A 90,000 order the customer has reported as transferred; the shop has not confirmed it. */
  function reported(): [State, string] {
    const [s, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    return [must(reportTransfer(s, id, newId)), id]
  }
  /** The first transfer report of an order, answered by the shop (CN-43). */
  const first = (s: State, id: string) => findOrder(s, id)!.reports[0].id
  const editTo = (s: State, id: string, lines: Line[]) => must(editOrder(s, id, lines, 'b-bitexco', '', newId))
  const lines = (s: State, id: string) => findOrder(s, id)!.lines

  it('CN-37: the report records the amount the app asked for', () => {
    const [s, id] = reported()
    const o = findOrder(s, id)!
    expect(reportedTotal(o)).toBe(90000)
    expect(paymentState(o)).toBe('reported')
    expect(toPay(o)).toBe(0)
  })

  it('AC30, CN-37: an edit after reporting keeps the report and asks only for the difference', () => {
    const [start, id] = reported()
    let s = start
    s = editTo(s, id, [...lines(s, id), thitkho])
    let o = findOrder(s, id)!
    expect(reportedTotal(o)).toBe(90000)
    expect(paymentState(o)).toBe('reported')
    expect(owed(o)).toBe(130000)
    expect(toPay(o)).toBe(40000)
    // The customer reports again, for the 40,000 only.
    s = must(reportTransfer(s, id, newId))
    o = findOrder(s, id)!
    expect(reportedTotal(o)).toBe(130000)
    expect(toPay(o)).toBe(0)
  })

  it('AC36, CN-43: each report is its own line; the shop confirms one and turns down the other', () => {
    const [start, id] = reported()
    let s = editTo(start, id, [...lines(start, id), thitkho])
    s = must(reportTransfer(s, id, newId))
    const [r90, r40] = findOrder(s, id)!.reports
    expect([r90.amount, r40.amount]).toEqual([90000, 40000])
    // Everything is reported: there is no unreported rest to confirm (CN-48).
    expect(confirmPayment(s, id, undefined, newId)).toEqual({ ok: false, error: 'nothingOwed' })
    s = must(confirmPayment(s, id, r90.id, newId))
    s = must(reportNotReceived(s, id, r40.id))
    const o = findOrder(s, id)!
    expect(o.received).toBe(90000)
    expect(o.reports).toEqual([])
    expect(o.missing).toEqual([40000])
    expect(paymentState(o)).toBe('underpaid')
    expect(toPay(o)).toBe(40000)
  })

  it('AC31, CN-38: "Payment received" records the amount reported; the order costing more is Underpaid', () => {
    const [start, id] = reported()
    let s = start
    s = editTo(s, id, [...lines(s, id), thitkho])
    s = must(confirmPayment(s, id, first(s, id), newId))
    const o = findOrder(s, id)!
    expect(o.received).toBe(90000)
    expect(reportedTotal(o)).toBe(0)
    expect(paymentState(o)).toBe('underpaid')
    expect(owed(o)).toBe(40000)
    expect(o.refunds).toEqual([])
  })

  it('AC31, CN-38: "Payment received" records the amount reported; the order costing less Needs refund', () => {
    const [start, id] = reported()
    let s = start
    s = editTo(s, id, [{ ...lines(s, id)[0], qty: 1 }])
    s = must(confirmPayment(s, id, first(s, id), newId))
    const o = findOrder(s, id)!
    expect(o.received).toBe(90000)
    expect(paymentState(o)).toBe('paid')
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'edit', refundedAt: null })])
  })

  it('CN-28 still holds without a report: "Payment received" records the full amount owed', () => {
    const [s, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    expect(findOrder(must(confirmPayment(s, id, undefined, newId)), id)!.received).toBe(90000)
  })

  it('AC32, CN-39: cancelling with a report records no refund until the shop confirms it received the money', () => {
    const [start, id] = reported()
    let s = start
    s = must(cancelOrder(s, id, newId))
    let o = findOrder(s, id)!
    expect(o.refunds).toEqual([])
    expect(reportedTotal(o)).toBe(90000)
    expect(owed(o)).toBe(0)
    expect(reportTransfer(s, id, newId)).toEqual({ ok: false, error: 'nothingOwed' })
    s = must(confirmPayment(s, id, first(s, id), newId))
    o = findOrder(s, id)!
    expect(reportedTotal(o)).toBe(0)
    expect(o.received).toBe(90000)
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 90000, reason: 'cancel' })])
  })

  it.each([
    ['reject', (s: State, id: string) => rejectOrder(s, id, 'reject', newId)],
    ['closedDay', (s: State, id: string) => rejectOrder(s, id, 'closedDay', newId)],
  ] as const)('AC32, CN-39: a reported order rejected (%s) is refunded with that reason once confirmed', (reason, reject) => {
    const [start, id] = reported()
    let s = start
    s = must(reject(s, id))
    expect(findOrder(s, id)!.refunds).toEqual([])
    s = must(confirmPayment(s, id, first(s, id), newId))
    expect(findOrder(s, id)!.refunds).toEqual([expect.objectContaining({ amount: 90000, reason })])
  })

  it('AC32, CN-39: declining a building lists the amount reported, and refunds it with that reason once confirmed', () => {
    let s = must(addToCart({ ...seed(TODAY), me: 'c5' }, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }, newId))
    const r = placeOrder(s, TODAY, 'b-pearl', '', newId)
    const id = (r as { id: string }).id
    s = must(reportTransfer(must(r), id, newId))
    expect(declinePreview(s, 'b-pearl')).toContainEqual({ order: expect.objectContaining({ id }), refund: 0, reported: 45000 })
    s = must(declineBuilding(s, 'b-pearl', newId))
    expect(findOrder(s, id)!.refunds).toEqual([])
    s = must(confirmPayment(s, id, first(s, id), newId))
    expect(findOrder(s, id)!.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'building' })])
  })

  it('AC33, CN-40: a refund not yet sent is dropped when the total goes back up', () => {
    const [start, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    let s = start
    s = must(confirmPayment(s, id, undefined, newId))
    const bunbo = lines(s, id)[0]
    s = editTo(s, id, [{ ...bunbo, qty: 1 }])
    expect(findOrder(s, id)!.refunds).toEqual([expect.objectContaining({ amount: 45000, refundedAt: null })])
    s = editTo(s, id, [bunbo, thitkho])
    const o = findOrder(s, id)!
    expect(o.refunds).toEqual([])
    expect(owed(o)).toBe(40000)
  })

  it('AC33, CN-40: a refund already marked Refunded is kept when the total goes back up', () => {
    const [start, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    let s = start
    s = must(confirmPayment(s, id, undefined, newId))
    const bunbo = lines(s, id)[0]
    s = editTo(s, id, [{ ...bunbo, qty: 1 }])
    s = must(markRefunded(s, id, findOrder(s, id)!.refunds[0].id))
    s = editTo(s, id, [bunbo, thitkho])
    const o = findOrder(s, id)!
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 45000 })])
    expect(owed(o)).toBe(85000)
  })

  it('AC34, CN-41: "Not received yet" clears the report, tells the customer and logs it', () => {
    const [start, id] = reported()
    let s = start
    s = must(reportNotReceived(s, id, first(s, id)))
    let o = findOrder(s, id)!
    expect(reportedTotal(o)).toBe(0)
    expect(o.missing).toEqual([90000])
    expect(paymentState(o)).toBe('unpaid')
    expect(toPay(o)).toBe(90000)
    expect(o.history.at(-1)).toMatchObject({ kind: 'reportMissing', amount: 90000 })
    // Reporting again clears the notice.
    s = must(reportTransfer(s, id, newId))
    o = findOrder(s, id)!
    expect(o.missing).toEqual([])
    expect(reportedTotal(o)).toBe(90000)
  })

  it('AC36, CN-43: answered in the other order, the "not found" 40,000 stays after the 90,000 is confirmed', () => {
    const [start, id] = reported()
    let s = editTo(start, id, [...lines(start, id), thitkho])
    s = must(reportTransfer(s, id, newId))
    const [r90, r40] = findOrder(s, id)!.reports
    s = must(reportNotReceived(s, id, r40.id))
    s = must(confirmPayment(s, id, r90.id, newId))
    expect(findOrder(s, id)!.missing).toEqual([40000])
  })

  it('CN-43: two reports turned down are both shown', () => {
    const [start, id] = reported()
    let s = editTo(start, id, [...lines(start, id), thitkho])
    s = must(reportTransfer(s, id, newId))
    const [r90, r40] = findOrder(s, id)!.reports
    s = must(reportNotReceived(must(reportNotReceived(s, id, r90.id)), id, r40.id))
    expect(findOrder(s, id)!.missing).toEqual([90000, 40000])
  })

  it('CN-47: a Paid order with a report still open stays Paid; confirming the report records a refund', () => {
    const [start, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    let s = must(confirmPayment(start, id, undefined, newId))
    const bunbo = lines(s, id)[0]
    s = must(reportTransfer(editTo(s, id, [bunbo, thitkho]), id, newId))
    s = editTo(s, id, [bunbo])
    let o = findOrder(s, id)!
    expect(paymentState(o)).toBe('paid')
    expect(o.reports).toHaveLength(1)
    s = must(confirmPayment(s, id, first(s, id), newId))
    o = findOrder(s, id)!
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 40000, reason: 'edit' })])
  })

  it('CN-48: the shop confirms the unreported rest while a report is still open', () => {
    const [start, id] = reported()
    let s = editTo(start, id, [...lines(start, id), thitkho])
    s = must(confirmPayment(s, id, undefined, newId))
    const o = findOrder(s, id)!
    expect(o.received).toBe(40000)
    expect(o.reports.map((r) => r.amount)).toEqual([90000])
    expect(toPay(o)).toBe(0)
  })

  it('CN-46: the "not found" notice clears when the shop confirms the unreported money', () => {
    const [start, id] = reported()
    let s = must(reportNotReceived(start, id, first(start, id)))
    s = must(confirmPayment(s, id, undefined, newId))
    expect(findOrder(s, id)!.missing).toEqual([])
  })

  it('CN-46: the "not found" notice stays through an edit', () => {
    const [start, id] = reported()
    let s = must(reportNotReceived(start, id, first(start, id)))
    s = editTo(s, id, [...lines(s, id), thitkho])
    expect(findOrder(s, id)!.missing).toEqual([90000])
  })

  it('CN-41: an Underpaid order goes back to Underpaid, and there must be a report to turn down', () => {
    const [start, id] = place(seed(TODAY), TODAY, 'd-bunbo', 2)
    let s = start
    s = must(confirmPayment(s, id, undefined, newId))
    expect(reportNotReceived(s, id, 'p-none')).toEqual({ ok: false, error: 'nothingReported' })
    s = editTo(s, id, [...lines(s, id), thitkho])
    s = must(reportTransfer(s, id, newId))
    s = must(reportNotReceived(s, id, first(s, id)))
    expect(paymentState(findOrder(s, id)!)).toBe('underpaid')
  })

  it('AC35, CN-42: a reported order still counts as not Paid at the cutoff review', () => {
    const [start, id] = reported()
    let s = start
    s = editTo(s, id, [...lines(s, id), thitkho])
    s = must(confirmOrder(s, id))
    const after = at(s, 23 * 60)
    expect(reviewList(after, TODAY).map((o) => o.id)).toContain(id)
    const o = findOrder(after, id)!
    expect([owed(o), reportedTotal(o), toPay(o)]).toEqual([130000, 90000, 40000])
  })
})

describe('refunds: never blocking, reminded, cash or transfer (CN-53, CN-54)', () => {
  /** A paid 90,000 order (two Bún bò Huế) edited down to 45,000 at 9:00: 45,000 Needs refund. Seed refunds already made. */
  function editedDown(): [State, string] {
    let s = at(seed(TODAY), 8 * 60)
    for (const o of s.orders) for (const r of o.refunds) s = must(markRefunded(s, o.id, r.id))
    const [placed, id] = place(s, TODAY, 'd-bunbo', 2)
    s = at(must(confirmPayment(placed, id, undefined, newId)), 9 * 60)
    const line = findOrder(s, id)!.lines[0]
    s = must(editOrder(s, id, [{ ...line, qty: 1 }], 'b-bitexco', '', newId))
    return [s, id]
  }

  it('AC41, CN-53: a pending refund does not block confirming, cooking or delivering the order', () => {
    const [start, id] = editedDown()
    expect(refundState(findOrder(start, id)!)).toBe('needsRefund')
    let s = must(confirmOrder(start, id))
    s = must(startPreparing(s, [id]))
    s = must(markDelivering(s, [id]))
    s = must(markDelivered(s, [id]))
    // Delivered does not record the refund (CN-54).
    expect(refundState(findOrder(s, id)!)).toBe('needsRefund')
  })

  it('AC42, CN-53: the reminder shows one hour after the refund, hides for an hour after "Seen", and stops once refunded', () => {
    const [s, id] = editedDown()
    expect(refundReminder(at(s, 9 * 60 + 59))).toBeNull()
    expect(refundReminder(at(s, 10 * 60))).toEqual({ orders: 1, total: 45000 })
    const seen = seeRefundReminder(at(s, 10 * 60))
    expect(refundReminder(at(seen, 10 * 60 + 59))).toBeNull()
    expect(refundReminder(at(seen, 11 * 60))).toEqual({ orders: 1, total: 45000 })
    const done = must(markRefunded(at(seen, 11 * 60), id, findOrder(seen, id)!.refunds[0].id))
    expect(refundReminder(at(done, 12 * 60))).toBeNull()
  })

  it('CN-55: once one refund is an hour old, the reminder counts every refund not made, new ones too', () => {
    const [start] = editedDown()
    let s = at(start, 10 * 60)
    // A second paid order cancelled at 10:00: its refund is new, and still counted.
    const [placed, id2] = place(at(s, 9 * 60 + 10), TODAY, 'd-thitkho')
    s = must(cancelOrder(must(confirmPayment(placed, id2, undefined, newId)), id2, newId))
    expect(refundReminder(at(s, 10 * 60))).toEqual({ orders: 2, total: 85000 })
  })

  it('CN-53: a refund recalculated by another edit keeps its time, so the reminder does not restart', () => {
    const [start, id] = editedDown()
    let s = at(start, 9 * 60 + 20)
    s = must(editOrder(s, id, findOrder(s, id)!.lines, 'b-bitexco', 'Tầng 2', newId))
    expect(findOrder(s, id)!.refunds[0].createdAt).toBe(`${TODAY} 09:00`)
    expect(refundReminder(at(s, 10 * 60))).not.toBeNull()
  })

  it('AC43, CN-54: cash only for an order still to be delivered; a rejected order goes back to not chosen', () => {
    const [start, id] = editedDown()
    expect(cashAllowed(findOrder(start, id)!)).toBe(true)
    let s = must(setRefundTo(start, id, { kind: 'cash' }))
    expect(findOrder(s, id)!.refundTo).toEqual({ kind: 'cash' })
    s = must(rejectOrder(s, id, 'reject', newId))
    expect(findOrder(s, id)!.refundTo).toBeNull()
    expect(setRefundTo(s, id, { kind: 'cash' })).toEqual({ ok: false, error: 'cashNotAllowed' })
    expect(setRefundTo(s, id, { kind: 'account', bank: 'ACB', account: '1', holder: 'A' }).ok).toBe(true)
  })

  it('AC43, CN-54: a delivered order offers bank transfer only', () => {
    const [start, id] = editedDown()
    let s = must(confirmOrder(start, id))
    s = must(markDelivering(must(startPreparing(s, [id])), [id]))
    expect(cashAllowed(findOrder(s, id)!)).toBe(false)
    expect(setRefundTo(s, id, { kind: 'cash' })).toEqual({ ok: false, error: 'cashNotAllowed' })
  })

  it('AC44, CN-54: "Cash given back" marks the pending refund Refunded by cash', () => {
    const [start, id] = editedDown()
    const s = must(giveCashBack(start, id))
    expect(findOrder(s, id)!.refunds[0]).toMatchObject({ method: 'cash', refundedAt: `${TODAY} 09:00` })
    expect(giveCashBack(s, id)).toEqual({ ok: false, error: 'noRefundDue' })
  })

  it('AC45, CN-54: the shop records how it refunded; the default follows the customer', () => {
    const [start, id] = editedDown()
    const cash = must(setRefundTo(start, id, { kind: 'cash' }))
    const refundId = findOrder(cash, id)!.refunds[0].id
    expect(findOrder(must(markRefunded(cash, id, refundId)), id)!.refunds[0].method).toBe('cash')
    expect(findOrder(must(markRefunded(cash, id, refundId, 'transfer')), id)!.refunds[0].method).toBe('transfer')
    expect(findOrder(must(markRefunded(start, id, refundId)), id)!.refunds[0].method).toBe('transfer')
  })
})

describe('sorting and searching orders (CN-56)', () => {
  it('AC46: newest placed order first; orders placed at the same minute keep the newest created first', () => {
    let s = at(seed(TODAY), 8 * 60)
    const [s1, early] = place(s, TODAY, 'd-bunbo')
    s = at(s1, 8 * 60 + 10)
    const [s2, late] = place(s, TODAY, 'd-thitkho')
    const sorted = newestFirst(
      s2,
      s2.orders.filter((o) => o.date === TODAY),
      (o) => o,
    ).map((o) => o.id)
    expect(sorted.slice(0, 2)).toEqual([late, early])
    // The seed orders were all placed at the same time: the one created last comes first.
    expect(sorted.at(-1)).toBe(`o-${TODAY}-1`)
  })

  it('AC47: search matches code, name or phone; contains, ignoring case, accents and phone spaces', () => {
    const s = seed(TODAY)
    const binh = s.orders.filter((o) => o.customerId === 'c2')
    const found = (q: string) => s.orders.filter((o) => o.date === TODAY && matchesSearch(s, o, q)).map((o) => o.id)
    expect(found('binh')).toEqual(binh.filter((o) => o.date === TODAY).map((o) => o.id))
    expect(found('TRẦN văn')).toEqual(found('binh'))
    expect(found('0912345')).toEqual(found('binh'))
    expect(found('0912 345 678')).toEqual(found('binh'))
    // Part of the code (here its last four characters, e.g. "9004" of LA1119004), any case.
    const code = s.orders.find((o) => o.id === `o-${TODAY}-4`)!.code
    expect(found(code.slice(-4))).toEqual([`o-${TODAY}-4`])
    expect(found(code.toLowerCase())).toEqual([`o-${TODAY}-4`])
    expect(found('')).toHaveLength(s.orders.filter((o) => o.date === TODAY).length)
    expect(found('zzz')).toEqual([])
    expect(plain('Đặng Thị Ánh')).toBe('dang thi anh')
  })
})

describe('the shop adds a building', () => {
  it('AC81: a building the shop adds is approved at once with its delivery time and can be used by any customer', () => {
    const s = seed('2026-11-23')
    const r = addBuilding(s, ' Tòa XYZ ', '12 Lê Lợi', 11 * 60 + 45, newId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.state.buildings.find((x) => x.id === r.id)!
    expect(b).toMatchObject({ name: 'Tòa XYZ', state: 'approved', deliveryTime: 705, proposedBy: null })
    expect(addBuilding(s, '  ', 'x', 700, newId)).toEqual({ ok: false, error: 'buildingMissing' })
  })
})
