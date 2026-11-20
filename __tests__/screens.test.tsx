// Screen tests for the prototype feedback: repeated "Add" on the day menu, the money shown on a
// paid order that was cancelled (customer and shop order detail), and reported transfers (CN-37 – CN-42).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { addToCart, cancelOrder, confirmOrder, markRefunded, placeOrder, confirmPayment, editOrder, setRefundTo, reportNotReceived, reportTransfer, type Result } from '../src/proto/logic'
import { seed } from '../src/proto/seed'
import { addDays, vietnamNow } from '../src/proto/time'
import type { Line, State } from '../src/proto/types'

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), path: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => nav.params,
}))

const KEY = 'lunch-prototype-v5'
const today = vietnamNow(new Date()).today

/** Store a state, then load fresh modules so the store reads it (the store caches its state). */
async function load(state: State) {
  window.localStorage.setItem(KEY, JSON.stringify(state))
  vi.resetModules()
  const { AppShell } = await import('../src/components/AppShell')
  return (children: ReactNode) => render(<AppShell>{children}</AppShell>)
}

/** The value next to a label in an order's detail list. */
function row(label: string): string | null {
  const dt = screen.queryByText(label, { selector: 'dt' })
  return dt?.nextElementSibling?.textContent ?? null
}

// Node 26 leaves jsdom without a working localStorage; give each test an in-memory one.
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

afterEach(() => {
  cleanup()
})

describe('day menu', () => {
  test('tapping "Add" again on a dish already in the cart gives feedback with the new quantity', async () => {
    nav.path = '/day'
    nav.params = new URLSearchParams({ d: today })
    const show = await load(seed(today))
    const { DayScreen } = await import('../src/screens/customer/DayScreen')
    show(<DayScreen />)

    const card = screen.getByText('Bún bò Huế').closest('li')!
    const add = within(card).getByRole('button', { name: 'Thêm' })
    fireEvent.click(add)
    expect(within(card).getByText(/Đã thêm 1 Bún bò Huế\. Trong giỏ có 1 phần món này\./)).toBeDefined()
    fireEvent.click(add)
    expect(within(card).getByText(/Đã thêm 1 Bún bò Huế\. Trong giỏ có 2 phần món này\./)).toBeDefined()
    // Still one cart line, now with 2 portions.
    const stored = JSON.parse(window.localStorage.getItem(KEY)!) as State
    expect(stored.carts[today]).toEqual([expect.objectContaining({ dishId: 'd-bunbo', qty: 2 })])
  })
})

describe('paid order cancelled by the customer', () => {
  // Seed: Trần Văn Bình (c2) paid 45,000 for an order, then cancelled it; the refund is still pending.
  const cancelledId = `o-${today}-8`

  test('customer order detail shows the money received and the refund pending, not 0', async () => {
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: cancelledId })
    const show = await load({ ...seed(today), me: 'c2' })
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    expect(row('Shop đã nhận')).toBe('45.000 ₫')
    expect(row('Đang chờ hoàn')).toBe('45.000 ₫')
    expect(row('Đã hoàn')).toBeNull()
  })

  test('shop order detail shows received and pending, then refunded once marked', async () => {
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: cancelledId })
    const show = await load(seed(today))
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    expect(row('Shop đã nhận')).toBe('45.000 ₫')
    expect(row('Đang chờ hoàn')).toBe('45.000 ₫')

    expect(screen.getByText('Chờ hoàn 45.000 ₫ · khách chưa chọn cách nhận')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Đã hoàn · chuyển khoản' }))
    expect(row('Shop đã nhận')).toBe('45.000 ₫')
    expect(row('Đang chờ hoàn')).toBeNull()
    expect(row('Đã hoàn')).toBe('45.000 ₫')
    // AC45, CN-54: how it was refunded is shown.
    expect(screen.getByText(/Đã hoàn 45\.000 ₫ bằng chuyển khoản/)).toBeDefined()
  })
})

describe('reported transfer, not confirmed (CN-37 – CN-42)', () => {
  // Seed: Trần Văn Bình (c2) ordered one Bún bò Huế (45,000) and reported the transfer.
  const reportedId = `o-${today}-2`
  const thitkho: Line = { id: 'l-extra', kind: 'fixed', dishId: 'd-thitkho', qty: 1, unitPrice: 40000 }
  // Before the cutoff, so the customer can still edit or cancel.
  const morning = (): State => ({ ...seed(today), me: 'c2', clock: { today, minutes: 8 * 60 } })
  const must = (r: Result): State => {
    if (!r.ok) throw new Error(r.error)
    return r.state
  }

  test('AC30, CN-37: after an edit the payment screen keeps the report and asks only for the difference', async () => {
    const s0 = morning()
    const o = s0.orders.find((x) => x.id === reportedId)!
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(must(editOrder(s0, reportedId, [...o.lines, thitkho], o.buildingId, o.note)))
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
    expect(screen.getByText('Đã báo chuyển 45.000 ₫, chờ shop xác nhận. Đơn đã sửa tăng tiền: cần chuyển thêm 40.000 ₫.')).toBeDefined()
    expect(row('Số tiền')).toBe('40.000 ₫')
    expect(screen.getByRole('button', { name: 'Tôi đã chuyển khoản' })).toBeDefined()
  })

  test('AC32, CN-39: a cancelled order still shows the transfer reported and waiting for the shop', async () => {
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(must(cancelOrder(morning(), reportedId)))
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    expect(row('Đã báo chuyển, chờ shop xác nhận')).toBe('45.000 ₫')
    expect(screen.getByText('Đã báo chuyển 45.000 ₫, chờ shop xác nhận.')).toBeDefined()
    expect(row('Đang chờ hoàn')).toBeNull()
    // CN-52: a closed order asks for no transfer, so no "Show QR again".
    expect(screen.queryByRole('link', { name: 'Xem lại QR' })).toBeNull()
  })

  test('CN-42, CN-41: the shop sees the amounts, and "Not received yet" clears the report', async () => {
    const s0 = morning()
    const o = s0.orders.find((x) => x.id === reportedId)!
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(must(editOrder(s0, reportedId, [...o.lines, thitkho], o.buildingId, o.note)))
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    expect(screen.getByText('Chưa xác nhận 85.000 ₫ · khách báo đã chuyển 45.000 ₫, còn thiếu 40.000 ₫')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Đã nhận tiền · 45.000 ₫' })).toBeDefined()
    // CN-48: the unreported 40,000 can be confirmed on its own.
    expect(screen.getByRole('button', { name: 'Đã nhận phần còn lại · 40.000 ₫' })).toBeDefined()
    expect([row('Chưa xác nhận'), row('Đã báo chuyển, chờ shop xác nhận'), row('Còn thiếu')]).toEqual(['85.000 ₫', '45.000 ₫', '40.000 ₫'])

    fireEvent.click(screen.getByRole('button', { name: 'Chưa thấy tiền' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Chưa thấy tiền' }))
    expect(screen.queryByRole('button', { name: 'Chưa thấy tiền' })).toBeNull()
    expect(screen.getByText('Shop chưa thấy khoản chuyển 45.000 ₫')).toBeDefined()
    // Back to Unpaid: "Payment received" now records the full amount owed (CN-28).
    expect(screen.getByRole('button', { name: 'Đã nhận tiền · 85.000 ₫' })).toBeDefined()
  })

  test('AC34, CN-41: after "Not received yet" the customer sees the notice and the QR again', async () => {
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(must(reportNotReceived(morning(), reportedId, 'p-seed')))
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
    expect(screen.getByText(/Shop chưa thấy khoản chuyển 45\.000 ₫\./)).toBeDefined()
    expect(row('Số tiền')).toBe('45.000 ₫')
    expect(screen.getByRole('button', { name: 'Tôi đã chuyển khoản' })).toBeDefined()
  })

  test('CN-34: "Show QR again" on an Underpaid order whose difference is reported says it waits, never 0 owed', async () => {
    let s = must(confirmPayment(morning(), reportedId, 'p-seed'))
    const o = s.orders.find((x) => x.id === reportedId)!
    s = must(reportTransfer(must(editOrder(s, reportedId, [...o.lines, thitkho], o.buildingId, o.note)), reportedId))
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: reportedId, qr: '1' })
    const show = await load(s)
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
    expect(screen.getByText('Đã báo chuyển 40.000 ₫, chờ shop xác nhận.')).toBeDefined()
    expect(screen.queryByText(/0 ₫\.$/)).toBeNull()
    expect(screen.queryByText(/còn thiếu 0/)).toBeNull()
  })

  test('CN-49: "Show QR again" with two open reports carries the latest one', async () => {
    const s0 = morning()
    const o = s0.orders.find((x) => x.id === reportedId)!
    const s = must(reportTransfer(must(editOrder(s0, reportedId, [...o.lines, thitkho], o.buildingId, o.note)), reportedId))
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: reportedId, qr: '1' })
    const show = await load(s)
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
    expect(row('Số tiền')).toBe('40.000 ₫')
    expect(screen.getByText('Đã báo chuyển 40.000 ₫, chờ shop xác nhận.')).toBeDefined()
  })

  test('S-C7: after "Not received yet" on one of two reports, no "the edit costs more" notice', async () => {
    const s0 = morning()
    const o = s0.orders.find((x) => x.id === reportedId)!
    let s = must(reportTransfer(must(editOrder(s0, reportedId, [...o.lines, thitkho], o.buildingId, o.note)), reportedId))
    s = must(reportNotReceived(s, reportedId, 'p-seed'))
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(s)
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
    expect(screen.getByText('Shop chưa thấy khoản chuyển 45.000 ₫. Bạn kiểm tra lại.')).toBeDefined()
    expect(screen.queryByText(/sửa tăng tiền/)).toBeNull()
    expect(screen.getByText('Đã báo chuyển 40.000 ₫, chờ shop xác nhận.')).toBeDefined()
    expect(row('Số tiền')).toBe('45.000 ₫')
  })

  test('AC38, CN-47, CN-51: a Paid order with a report open; turned down, the customer gets the notice without a QR', async () => {
    // Paid 45,000, edited to 85,000, 40,000 reported, edited back to 45,000.
    let s = must(confirmPayment(morning(), reportedId, 'p-seed'))
    const o = s.orders.find((x) => x.id === reportedId)!
    s = must(reportTransfer(must(editOrder(s, reportedId, [...o.lines, thitkho], o.buildingId, o.note)), reportedId))
    s = must(editOrder(s, reportedId, o.lines, o.buildingId, o.note))
    const reportId = s.orders.find((x) => x.id === reportedId)!.reports[0].id

    nav.path = '/shop'
    nav.params = new URLSearchParams()
    let show = await load({ ...s, shopDay: today })
    const { ShopOrdersScreen } = await import('../src/screens/shop/ShopOrdersScreen')
    show(<ShopOrdersScreen />)
    fireEvent.change(screen.getByLabelText('Thanh toán'), { target: { value: 'reported' } })
    expect(screen.getByText('Khách báo chuyển 40.000 ₫, chờ xác nhận')).toBeDefined()
    expect(screen.queryByText(/Chưa xác nhận 0/)).toBeNull()
    cleanup()

    nav.path = '/order'
    nav.params = new URLSearchParams({ id: reportedId })
    show = await load(must(reportNotReceived(s, reportedId, reportId)))
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    expect(screen.getByText('Shop chưa thấy khoản chuyển 40.000 ₫. Bạn kiểm tra lại hoặc gọi shop.')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Thanh toán' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Xem lại QR' })).toBeNull()
  })

  test('CN-39: the shop\'s "Reported" filter keeps a cancelled order whose transfer is still reported', async () => {
    nav.path = '/shop'
    nav.params = new URLSearchParams()
    const s = { ...must(cancelOrder(morning(), reportedId)), shopDay: today }
    const code = s.orders.find((x) => x.id === reportedId)!.code
    const show = await load(s)
    const { ShopOrdersScreen } = await import('../src/screens/shop/ShopOrdersScreen')
    show(<ShopOrdersScreen />)
    fireEvent.change(screen.getByLabelText('Thanh toán'), { target: { value: 'reported' } })
    expect(screen.getByRole('link', { name: code })).toBeDefined()
  })

  test('AC37, CN-44: a cancelled order shows the customer that the shop has not found the transfer', async () => {
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: reportedId })
    const show = await load(must(reportNotReceived(must(cancelOrder(morning(), reportedId)), reportedId, 'p-seed')))
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    expect(screen.getByText('Shop chưa thấy khoản chuyển 45.000 ₫. Bạn kiểm tra lại hoặc gọi shop.')).toBeDefined()
    // AC37, CN-44: nothing is owed on a closed order, so no QR and no payment link.
    expect(screen.queryByRole('link', { name: 'Thanh toán' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Xem lại QR' })).toBeNull()
    expect(row('Đang chờ hoàn')).toBeNull()
  })
})

describe('refunds: shown, reminded, cash or transfer (CN-53, CN-54)', () => {
  // Seed: Lê Thu Hà (c3) paid 90,000 for two Cơm gà; edited down to one, the order is confirmed again.
  const haId = `o-${today}-3`
  const cancelledId = `o-${today}-8`
  const must = (r: Result): State => {
    if (!r.ok) throw new Error(r.error)
    return r.state
  }
  function editedDown(): State {
    const s0: State = { ...seed(today), me: 'c3', clock: { today, minutes: 8 * 60 }, shopDay: today }
    const o = s0.orders.find((x) => x.id === haId)!
    return must(confirmOrder(must(editOrder(s0, haId, [{ ...o.lines[0], qty: 1 }], o.buildingId, o.note)), haId))
  }

  test('AC41, AC44, CN-53, CN-54: the delivery list shows the cash to give back; "Cash given back" records it', async () => {
    nav.path = '/shop/delivery'
    nav.params = new URLSearchParams()
    const show = await load(must(setRefundTo(editedDown(), haId, { kind: 'cash' })))
    const { DeliveryScreen } = await import('../src/screens/shop/DeliveryScreen')
    show(<DeliveryScreen />)
    expect(screen.getByText('Chờ hoàn 45.000 ₫ · trả tiền mặt khi giao')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Đã trả tiền mặt · 45.000 ₫' }))
    expect(screen.queryByText(/Chờ hoàn 45\.000/)).toBeNull()
    const stored = JSON.parse(window.localStorage.getItem(KEY)!) as State
    expect(stored.orders.find((o) => o.id === haId)!.refunds[0].method).toBe('cash')
  })

  test('AC44, CN-54: with no choice yet the delivery list says so, and still offers cash', async () => {
    nav.path = '/shop/delivery'
    nav.params = new URLSearchParams()
    const show = await load(editedDown())
    const { DeliveryScreen } = await import('../src/screens/shop/DeliveryScreen')
    show(<DeliveryScreen />)
    expect(screen.getByText('Chờ hoàn 45.000 ₫ · khách chưa chọn cách nhận')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Đã trả tiền mặt · 45.000 ₫' })).toBeDefined()
  })

  test('AC41, CN-53: the Orders screen shows the pending refund on the order', async () => {
    nav.path = '/shop'
    nav.params = new URLSearchParams()
    const show = await load(must(setRefundTo(editedDown(), haId, { kind: 'account', bank: 'ACB', account: '123', holder: 'LE THU HA' })))
    const { ShopOrdersScreen } = await import('../src/screens/shop/ShopOrdersScreen')
    show(<ShopOrdersScreen />)
    expect(screen.getByText('Chờ hoàn 45.000 ₫ · chuyển khoản')).toBeDefined()
  })

  test('CN-55: no "Cash given back" on the delivery list when the customer chose bank transfer', async () => {
    nav.path = '/shop/delivery'
    nav.params = new URLSearchParams()
    const show = await load(must(setRefundTo(editedDown(), haId, { kind: 'account', bank: 'ACB', account: '123', holder: 'LE THU HA' })))
    const { DeliveryScreen } = await import('../src/screens/shop/DeliveryScreen')
    show(<DeliveryScreen />)
    expect(screen.getByText('Chờ hoàn 45.000 ₫ · chuyển khoản')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Đã trả tiền mặt/ })).toBeNull()
  })

  test('AC42, CN-53: the reminder bar shows on shop screens and "Seen" hides it', async () => {
    nav.path = '/shop/refunds'
    nav.params = new URLSearchParams()
    // The seed's refund was recorded yesterday, so it is more than an hour old.
    const show = await load({ ...seed(today), clock: { today, minutes: 8 * 60 } })
    const { RefundsScreen } = await import('../src/screens/shop/RefundsBuildingsScreens')
    show(<RefundsScreen />)
    expect(screen.getByRole('link', { name: /Còn 1 đơn chưa hoàn, tổng 45\.000 ₫/ })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Đã xem' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('AC41, AC45, CN-53, CN-54: the shop detail shows the pending refund; marked from the Refunds screen, both sides see how', async () => {
    const s = must(setRefundTo(editedDown(), haId, { kind: 'cash' }))
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: haId })
    let show = await load(s)
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    expect(screen.getByText('Chờ hoàn 45.000 ₫ · trả tiền mặt khi giao')).toBeDefined()
    cleanup()

    // The shipper had no cash: the shop transfers and records it from the Refunds screen.
    nav.path = '/shop/refunds'
    nav.params = new URLSearchParams()
    show = await load(s)
    const { RefundsScreen } = await import('../src/screens/shop/RefundsBuildingsScreens')
    show(<RefundsScreen />)
    const card = screen.getByRole('link', { name: s.orders.find((o) => o.id === haId)!.code }).closest('li')!
    expect(within(card).getByRole('button', { name: 'Đã hoàn · tiền mặt' })).toBeDefined()
    fireEvent.click(within(card).getByRole('button', { name: 'Đã hoàn · chuyển khoản' }))
    expect(screen.getByText(/Đã hoàn 45\.000 ₫ bằng chuyển khoản/)).toBeDefined()
    cleanup()

    nav.path = '/order'
    nav.params = new URLSearchParams({ id: haId })
    show = await load(JSON.parse(window.localStorage.getItem(KEY)!) as State)
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    expect(screen.getByText(/Đã hoàn 45\.000 ₫ bằng chuyển khoản/)).toBeDefined()
  })

  test('CN-54: cash chosen, order now delivering: changing the choice starts from an account', async () => {
    let s = must(setRefundTo(editedDown(), haId, { kind: 'cash' }))
    const { startPreparing, markDelivering } = await import('../src/proto/logic')
    s = must(markDelivering(must(startPreparing(s, [haId])), [haId]))
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: haId })
    const show = await load(s)
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Đổi' }))
    expect(screen.getByRole('button', { name: 'Nhập tài khoản' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Ngân hàng')).toBeDefined()
  })

  test('AC43, CN-54: the customer can choose cash for an order still to be delivered, not for a cancelled one', async () => {
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: haId })
    let show = await load(editedDown())
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt khi giao' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi cho shop' }))
    expect(screen.getByText('Tiền mặt khi giao', { selector: 'p' })).toBeDefined()
    cleanup()

    nav.params = new URLSearchParams({ id: cancelledId })
    show = await load({ ...seed(today), me: 'c2' })
    const fresh = await import('../src/screens/customer/OrderScreen')
    show(<fresh.OrderScreen />)
    expect(screen.getByRole('button', { name: 'Tải ảnh QR' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Tiền mặt khi giao' })).toBeNull()
  })
})

describe('sorting and searching on the shop screens (CN-56)', () => {
  const must = (r: Result): State => {
    if (!r.ok) throw new Error(r.error)
    return r.state
  }
  /** Seed at 8:00 with a new order by Nguyễn Minh An (c1), placed after all the seed orders. */
  function withNewOrder(): [State, string] {
    let s: State = { ...seed(today), clock: { today, minutes: 8 * 60 }, shopDay: today }
    s = must(addToCart(s, today, { kind: 'fixed', dishId: 'd-bunbo', qty: 1, unitPrice: 45000 }))
    const r = placeOrder(s, today, 'b-bitexco', '')
    return [must(r), (r as { id: string }).id]
  }
  const codes = () => screen.queryAllByRole('link').map((l) => l.textContent).filter((c) => /^LA\d+$/.test(c ?? ''))

  test('AC46, AC47: Orders: newest first; the search keeps the filter and the day', async () => {
    const [s, id] = withNewOrder()
    nav.path = '/shop'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { ShopOrdersScreen } = await import('../src/screens/shop/ShopOrdersScreen')
    show(<ShopOrdersScreen />)
    const code = (oid: string) => s.orders.find((o) => o.id === oid)!.code
    expect(codes()[0]).toBe(code(id))
    expect(codes()[1]).toBe(code(`o-${today}-8`))

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'placed' } })
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'binh' } })
    // Bình has a Placed and a Cancelled order today: the filter keeps only the Placed one.
    expect(codes()).toEqual([code(`o-${today}-2`)])
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: '0912345' } })
    expect(codes()).toEqual([code(`o-${today}-2`)])
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: code(`o-${today}-4`).slice(-4) } })
    expect(codes()).toEqual([code(`o-${today}-4`)])
    // Saturday's order is not found from today's list.
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: s.orders.find((o) => o.date !== today)!.code } })
    expect(codes()).toEqual([])
  })

  test('AC46: Cutoff review: newest first in each group, and the search', async () => {
    const [s0] = withNewOrder()
    const s = { ...s0, clock: { today, minutes: 11 * 60 } }
    nav.path = '/shop/review'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { ReviewScreen } = await import('../src/screens/shop/ReviewScreen')
    show(<ReviewScreen />)
    const placedGroup = screen.getByRole('heading', { name: /Chưa xác nhận/ }).closest('section')!
    const groupCodes = within(placedGroup).getAllByRole('link').map((l) => l.textContent)
    const expected = s.orders.filter((o) => o.date === today && o.status === 'placed').map((o) => o.code).reverse()
    expect(groupCodes).toEqual(expected)
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'zzz' } })
    expect(screen.getByText('Không có đơn nào khớp.')).toBeDefined()
  })

  test('AC48: Refunds: search over every day in both parts, newest order first; one time format everywhere', async () => {
    let s: State = { ...seed(today), clock: { today, minutes: 8 * 60 } }
    // Lê Thu Hà (c3) cancels her paid Saturday order; Bình's refund of today is made.
    const sat = s.orders.find((o) => o.date === addDays(today, 1))!
    s = must(cancelOrder({ ...s, me: 'c3' }, sat.id))
    const binh = s.orders.find((o) => o.id === `o-${today}-8`)!
    s = must(markRefunded(s, binh.id, binh.refunds[0].id, 'transfer'))
    nav.path = '/shop/refunds'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { RefundsScreen } = await import('../src/screens/shop/RefundsBuildingsScreens')
    show(<RefundsScreen />)
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'thu ha' } })
    expect(codes()).toEqual([sat.code])
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'binh' } })
    expect(codes()).toEqual([binh.code])
    expect(screen.getByText(/lúc \d\d:\d\d, \d\d\/\d\d/)).toBeDefined()
    expect(screen.queryByText(/lúc \d{4}-/)).toBeNull()
  })

  test('AC47, CN-57: the code search keeps the filter; the search text stays when the day changes', async () => {
    const [s] = withNewOrder()
    nav.path = '/shop'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { ShopOrdersScreen } = await import('../src/screens/shop/ShopOrdersScreen')
    show(<ShopOrdersScreen />)
    const four = s.orders.find((o) => o.id === `o-${today}-4`)!
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'confirmed' } })
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: four.code.slice(-4) } })
    expect(codes()).toEqual([four.code])
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'placed' } })
    expect(codes()).toEqual([])
    // Change day: the text stays and searches Saturday.
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: '' } })
    const sat = s.orders.find((o) => o.date === addDays(today, 1))!
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'thu ha' } })
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes(`${sat.date.slice(8, 10)}/${sat.date.slice(5, 7)}`))!)
    expect((screen.getByLabelText('Tìm đơn') as HTMLInputElement).value).toBe('thu ha')
    expect(codes()).toEqual([sat.code])
  })

  test('AC46: Cutoff review: the not fully paid group is newest first too', async () => {
    let [s] = withNewOrder()
    // Confirm the new unpaid order so it joins Huy's unpaid order in the second group.
    s = must(confirmOrder(s, s.orders.at(-1)!.id))
    s = { ...s, clock: { today, minutes: 11 * 60 } }
    nav.path = '/shop/review'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { ReviewScreen } = await import('../src/screens/shop/ReviewScreen')
    show(<ReviewScreen />)
    const unpaid = screen.getByRole('heading', { name: /Chưa trả đủ/ }).closest('section')!
    expect(within(unpaid).getAllByRole('link').map((l) => l.textContent)).toEqual([s.orders.at(-1)!.code, s.orders.find((o) => o.id === `o-${today}-4`)!.code])
  })

  test('AC48, CN-57: Refunds: one customer in both parts, newest first; no result says "No order matches"', async () => {
    let s: State = { ...seed(today), clock: { today, minutes: 8 * 60 } }
    // Bình's seed refund is made; he then cancels his other, paid, order of today.
    const old = s.orders.find((o) => o.id === `o-${today}-8`)!
    s = must(markRefunded(s, old.id, old.refunds[0].id, 'transfer'))
    s = must(confirmPayment(s, `o-${today}-2`, 'p-seed'))
    s = must(cancelOrder({ ...s, me: 'c2' }, `o-${today}-2`))
    // Hà cancels her paid Saturday order, so two refunds are pending.
    const sat = s.orders.find((o) => o.date === addDays(today, 1))!
    s = must(cancelOrder({ ...s, me: 'c3' }, sat.id))
    nav.path = '/shop/refunds'
    nav.params = new URLSearchParams()
    const show = await load(s)
    const { RefundsScreen } = await import('../src/screens/shop/RefundsBuildingsScreens')
    show(<RefundsScreen />)
    const code = (id: string) => s.orders.find((o) => o.id === id)!.code
    // Not refunded: Saturday's order was created after order 2, at the same placed time, so it is first.
    expect(codes()).toEqual([sat.code, code(`o-${today}-2`), old.code])
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'binh' } })
    expect(codes()).toEqual([code(`o-${today}-2`), old.code])
    expect(screen.getByRole('heading', { name: 'Chưa hoàn' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Đã hoàn' })).toBeDefined()
    fireEvent.change(screen.getByLabelText('Tìm đơn'), { target: { value: 'zzz' } })
    expect(screen.getByText('Không có đơn nào khớp.')).toBeDefined()
    expect(screen.queryByText('Không có khoản nào cần hoàn.')).toBeNull()
  })

  test('CN-56: the Delivery screen has no search box', async () => {
    nav.path = '/shop/delivery'
    nav.params = new URLSearchParams()
    const show = await load({ ...seed(today), shopDay: today })
    const { DeliveryScreen } = await import('../src/screens/shop/DeliveryScreen')
    show(<DeliveryScreen />)
    expect(screen.queryByLabelText('Tìm đơn')).toBeNull()
    // Its order stays by delivery time.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.slice(0, 5))).toEqual(['11:30', '11:45', '12:00'])
  })

  test('refund time: the customer sees the same format as the shop', async () => {
    let s: State = { ...seed(today), me: 'c2', clock: { today, minutes: 8 * 60 } }
    const binh = s.orders.find((o) => o.id === `o-${today}-8`)!
    s = must(markRefunded(s, binh.id, binh.refunds[0].id, 'transfer'))
    nav.path = '/order'
    nav.params = new URLSearchParams({ id: binh.id })
    const show = await load(s)
    const { OrderScreen } = await import('../src/screens/customer/OrderScreen')
    show(<OrderScreen />)
    const [d, mo] = [today.slice(8, 10), today.slice(5, 7)]
    expect(screen.getByText(`Đã hoàn 45.000 ₫ bằng chuyển khoản lúc 08:00, ${d}/${mo}`)).toBeDefined()
  })
})
