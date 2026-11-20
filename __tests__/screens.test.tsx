// Screen tests for the prototype feedback: repeated "Add" on the day menu, the money shown on a
// paid order that was cancelled (customer and shop order detail), and reported transfers (CN-37 – CN-42).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { cancelOrder, confirmPayment, editOrder, reportNotReceived, reportTransfer, type Result } from '../src/proto/logic'
import { seed } from '../src/proto/seed'
import { vietnamNow } from '../src/proto/time'
import type { Line, State } from '../src/proto/types'

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), path: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => nav.params,
}))

const KEY = 'lunch-prototype-v4'
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

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã hoàn' }))
    expect(row('Shop đã nhận')).toBe('45.000 ₫')
    expect(row('Đang chờ hoàn')).toBeNull()
    expect(row('Đã hoàn')).toBe('45.000 ₫')
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
