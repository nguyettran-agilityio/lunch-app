// @vitest-environment node
// Business rules of the prototype against the acceptance criteria in docs/spec.md.
import { describe, expect, it } from 'vitest'
import {
  addToCart,
  cancelOrder,
  confirmOrder,
  confirmPayment,
  dayState,
  declineBuilding,
  deliveryList,
  editOrder,
  findOrder,
  keepOrder,
  markDelivered,
  markDelivering,
  markRefunded,
  setDeliveryTime,
  owed,
  paymentState,
  placeOrder,
  platePrice,
  plateValid,
  prepSheet,
  refundState,
  rejectOrder,
  reviewList,
  startPreparing,
  type Result,
} from '../src/proto/logic'
import { seed } from '../src/proto/seed'
import { addDays, vietnamNow } from '../src/proto/time'
import type { Line, State } from '../src/proto/types'

const TODAY = '2026-11-19'
const TOMORROW = addDays(TODAY, 1)

function must(r: Result): State {
  if (!r.ok) throw new Error(`action failed: ${r.error}`)
  return r.state
}

const at = (s: State, minutes: number): State => ({ ...s, clock: { ...s.clock, minutes } })

/** Place a fresh order for the current customer and return [state, orderId]. */
function place(s: State, date: string, dishId = 'd-thitkho', qty = 1): [State, string] {
  let st = must(addToCart(s, date, { kind: 'fixed', dishId, qty, unitPrice: s.dishes.find((d) => d.id === dishId)!.price! }))
  const r = placeOrder(st, date, 'b-bitexco', 'Tầng 3')
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
    expect(addToCart(s, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 })).toEqual({ ok: false, error: 'pastCutoff' })
    expect(cancelOrder(s, id)).toEqual({ ok: false, error: 'pastCutoff' })
    expect(editOrder(s, id, findOrder(s, id)!.lines, 'b-bitexco', '')).toEqual({ ok: false, error: 'pastCutoff' })
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
    s = must(addToCart(s, TODAY, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }))
    s = must(addToCart(s, TOMORROW, { kind: 'fixed', dishId: 'd-comga', qty: 1, unitPrice: 45000 }))
    s = must(placeOrder(s, TOMORROW, 'b-bitexco', ''))
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
    expect(addToCart(s, TODAY, { kind: 'plate', picks: ['d-raumuong'], qty: 1, unitPrice: 35000 })).toEqual({
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
    return [must(confirmPayment(must(confirmOrder(s, id)), id)), id]
  }

  it('AC5: editing a Shop confirmed order sends it back to Placed', () => {
    const [s, id] = paidOrder()
    const o = findOrder(s, id)!
    const s2 = must(editOrder(s, id, o.lines.map((l) => ({ ...l, qty: 1 })), 'b-viettel', 'Tầng 9'))
    expect(findOrder(s2, id)!.status).toBe('placed')
    expect(findOrder(s2, id)!.buildingId).toBe('b-viettel')
  })

  it('AC6: a paid 50k order edited up to 65k is Underpaid with 15k owed', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }))
    const r = placeOrder(s, TODAY, 'b-bitexco', '')
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id))
    const lines: Line[] = [...findOrder(s, id)!.lines, { id: 'x', kind: 'fixed', dishId: 'd-suon', qty: 1, unitPrice: 15000 }]
    s = must(editOrder(s, id, lines, 'b-bitexco', ''))
    const o = findOrder(s, id)!
    expect(paymentState(o)).toBe('underpaid')
    expect(owed(o)).toBe(15000)
  })

  it('AC7: a paid 50k order edited down to 40k needs a 10k refund for "edit"', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }))
    const r = placeOrder(s, TODAY, 'b-bitexco', '')
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id))
    const lines: Line[] = [{ id: 'y', kind: 'plate', picks: ['d-suon', 'd-raumuong'], qty: 1, unitPrice: 40000 }]
    s = must(editOrder(s, id, lines, 'b-bitexco', ''))
    const o = findOrder(s, id)!
    expect(refundState(o)).toBe('needsRefund')
    expect(o.refunds).toEqual([expect.objectContaining({ amount: 10000, reason: 'edit' })])
    expect(paymentState(o)).toBe('paid')
  })

  it('AC8: cancelling or rejecting a paid order records a refund of the paid amount', () => {
    const [s, id] = paidOrder('d-bunbo')
    const cancelled = findOrder(must(cancelOrder(s, id)), id)!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'cancel' })])
    const rejected = findOrder(must(rejectOrder(s, id)), id)!
    expect(rejected.status).toBe('rejected')
    expect(rejected.refunds).toEqual([expect.objectContaining({ amount: 45000, reason: 'reject' })])
  })

  it('AC22: the shop can confirm an Unpaid order the customer never reported', () => {
    const [s, id] = place(seed(TODAY), TODAY)
    expect(paymentState(findOrder(s, id)!)).toBe('unpaid')
    expect(paymentState(findOrder(must(confirmPayment(s, id)), id)!)).toBe('paid')
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
    expect(cancelOrder(s2, mine.id)).toEqual({ ok: false, error: 'preparing' })
    expect(editOrder(s2, mine.id, mine.lines, mine.buildingId, '')).toEqual({ ok: false, error: 'preparing' })
    expect(rejectOrder(s2, mine.id)).toEqual({ ok: false, error: 'cannotReject' })
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
    s = must(confirmPayment(s, lan.id))
    s = must(declineBuilding(s, 'b-pearl'))
    const after = findOrder(s, lan.id)!
    expect(after.status).toBe('rejected')
    expect(after.refunds).toEqual([expect.objectContaining({ amount: 40000, reason: 'building' })])
  })

  it('a refund for a lowered total is dropped when the order is edited back up (section 4.3)', () => {
    let s = seed(TODAY)
    s = must(addToCart(s, TODAY, { kind: 'plate', picks: ['d-suon', 'd-raumuong', 'd-trung'], qty: 1, unitPrice: 50000 }))
    const r = placeOrder(s, TODAY, 'b-bitexco', '')
    const id = (r as { id: string }).id
    s = must(confirmPayment(must(r), id))
    const original = findOrder(s, id)!.lines
    s = must(editOrder(s, id, [{ id: 'y', kind: 'plate', picks: ['d-suon', 'd-raumuong'], qty: 1, unitPrice: 40000 }], 'b-bitexco', ''))
    s = must(editOrder(s, id, original, 'b-bitexco', ''))
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
})
