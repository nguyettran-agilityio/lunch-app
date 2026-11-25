// Tests for the design round (docs/design.md): the money state block (UI3–UI5), our own dish drawings
// (UI6) and the empty-screen illustrations. They check what the block says for each state the spec defines;
// how it looks is checked by hand in the Browser pane.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { drawnDishes } from '../src/components/art'
import { orderTotal } from '../src/domain/logic'
import { seed } from '../src/proto/seed'
import { vietnamNow } from '../src/domain/time'
import type { Order } from '../src/domain/types'
import type { ProtoState as State } from '../src/proto/types'

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), path: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => nav.params,
}))

const KEY = 'lunch-prototype-v5'
const today = vietnamNow(new Date()).today

async function load(state: State) {
  window.localStorage.setItem(KEY, JSON.stringify(state))
  vi.resetModules()
  const { AppShell } = await import('../src/components/AppShell')
  const { ProtoProvider } = await import('../src/proto/ProtoProvider')
  return (children: ReactNode) =>
    render(
      <ProtoProvider>
        <AppShell>{children}</AppShell>
      </ProtoProvider>,
    )
}

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

afterEach(() => cleanup())

const base = seed(today).orders[0]
const total = orderTotal(base)
const clean: Order = { ...base, status: 'confirmed', received: 0, reports: [], refunds: [], missing: [], endReason: null }
const refund = (amount: number, refundedAt: string | null = null) => ({
  id: 'r1',
  amount,
  reason: 'cancel' as const,
  createdAt: `${today} 08:00`,
  refundedAt,
  method: refundedAt ? ('transfer' as const) : null,
})

async function showBlock(order: Order) {
  const show = await load(seed(today))
  const { MoneyState } = await import('../src/components/money')
  show(<MoneyState order={order} />)
  return screen.getByTestId('money-state')
}

/** The label of the stop marked as the current one, per bar. */
const currentStops = (block: HTMLElement) => [...block.querySelectorAll('[aria-current="step"]')].map((li) => li.textContent)
const money = (v: number) => `${v.toLocaleString('vi-VN')} ₫`

describe('money state block (UI3–UI5)', () => {
  test('Unpaid: stop 1, the amount to transfer', async () => {
    const block = await showBlock(clean)
    expect(currentStops(block)).toEqual(['Chưa trả'])
    expect(within(block).getByText(`Cần chuyển ${money(total)}`)).toBeDefined()
  })

  test('Reported: stop 2, the amount reported, waiting for the shop', async () => {
    const block = await showBlock({ ...clean, reports: [{ id: 'p1', amount: total, at: `${today} 08:10` }] })
    expect(currentStops(block)).toEqual(['Đã báo chuyển'])
    expect(within(block).getByText(`Đã báo chuyển ${money(total)}, chờ shop xác nhận`)).toBeDefined()
  })

  test('Paid: stop 3 in green', async () => {
    const block = await showBlock({ ...clean, received: total })
    expect(currentStops(block)).toEqual(['Shop đã nhận'])
    expect(block.querySelector('[data-state="paid"]')).not.toBeNull()
    expect(within(block).getByText('Shop đã nhận đủ tiền')).toBeDefined()
  })

  test('Underpaid: stays at stop 3, red, with the amount still owed (UI4)', async () => {
    const block = await showBlock({ ...clean, received: total - 10000 })
    expect(currentStops(block)).toEqual(['Shop đã nhận'])
    expect(block.querySelector('[data-state="underpaid"]')).not.toBeNull()
    expect(within(block).getByText('Còn thiếu 10.000 ₫')).toBeDefined()
  })

  test('active order with a refund pending: the payment bar and the refund bar', async () => {
    const block = await showBlock({ ...clean, received: total + 10000, refunds: [refund(10000)] })
    expect(currentStops(block)).toEqual(['Shop đã nhận', 'Cần hoàn'])
    expect(within(block).getByText('Shop cần hoàn 10.000 ₫')).toBeDefined()
  })

  test('Cancelled with a refund: only the refund bar, then Refunded with how (UI5)', async () => {
    const cancelled: Order = { ...clean, status: 'cancelled', received: total, refunds: [refund(total)] }
    let block = await showBlock(cancelled)
    expect(block.querySelector('[data-state="unpaid"], [data-state="paid"]')).toBeNull()
    expect(currentStops(block)).toEqual(['Cần hoàn'])
    cleanup()
    block = await showBlock({ ...cancelled, refunds: [refund(total, `${today} 09:00`)] })
    expect(currentStops(block)).toEqual(['Đã hoàn'])
    expect(within(block).getByText(`Đã hoàn ${money(total)} bằng chuyển khoản`)).toBeDefined()
  })

  test('Rejected with nothing to settle: one line (UI5); a report still open is said instead', async () => {
    let block = await showBlock({ ...clean, status: 'rejected' })
    expect(block.querySelectorAll('ol')).toHaveLength(0)
    expect(within(block).getByText('Không còn khoản nào')).toBeDefined()
    cleanup()
    block = await showBlock({ ...clean, status: 'rejected', reports: [{ id: 'p1', amount: total, at: `${today} 08:10` }] })
    expect(within(block).getByText(`Đã báo chuyển ${money(total)}, chờ shop xác nhận`)).toBeDefined()
  })

  const report = (amount: number) => ({ id: 'p1', amount, at: `${today} 08:10` })

  test('CN-47, UI7: Paid with a report still open says the report inside the block', async () => {
    const block = await showBlock({ ...clean, received: total, reports: [report(40000)] })
    expect(currentStops(block)).toEqual(['Shop đã nhận'])
    expect(within(block).getByText('Khách báo đã chuyển 40.000 ₫, chờ xác nhận')).toBeDefined()
  })

  test('CN-39, UI8: Cancelled with a refund and a report still open shows the refund bar and the report line', async () => {
    const block = await showBlock({ ...clean, status: 'cancelled', received: total, refunds: [refund(total)], reports: [report(40000)] })
    expect(currentStops(block)).toEqual(['Cần hoàn'])
    expect(within(block).getByText('Đã báo chuyển 40.000 ₫, chờ shop xác nhận')).toBeDefined()
  })

  test('CN-24, UI9: Underpaid then reported stays at stop 2 and says what the shop received', async () => {
    const block = await showBlock({ ...clean, received: total - 10000, reports: [report(10000)] })
    expect(currentStops(block)).toEqual(['Đã báo chuyển'])
    expect(within(block).getByText(`Shop đã nhận ${money(total - 10000)}`)).toBeDefined()
  })

  test('UI10: the shop order detail uses the shop wording', async () => {
    const state = seed(today)
    const order = { ...clean, id: state.orders[0].id }
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: order.id })
    const show = await load({ ...state, orders: [order, ...state.orders.slice(1)] })
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    expect(within(screen.getByTestId('money-state')).getByText(`Khách còn nợ ${money(total)}`)).toBeDefined()
  })

  test('shown on the Payment screen, the customer order detail and the shop order detail (UI3)', async () => {
    const state = seed(today)
    const id = state.orders[0].id
    nav.params = new URLSearchParams({ id })
    for (const [path, mod, name] of [
      ['/pay', '../src/screens/customer/PayScreen', 'PayScreen'],
      ['/order', '../src/screens/customer/OrderScreen', 'OrderScreen'],
      ['/shop/order', '../src/screens/shop/ShopOrderScreen', 'ShopOrderScreen'],
    ] as const) {
      nav.path = path
      const show = await load({ ...state, me: state.orders[0].customerId })
      const Screen = (await import(mod))[name] as () => ReactNode
      show(<Screen />)
      expect(screen.getByTestId('money-state')).toBeDefined()
      cleanup()
    }
  })
})

describe('our own drawings (UI6)', () => {
  test('every seeded dish has its own drawing', () => {
    const missing = seed(today).dishes.filter((d) => !drawnDishes.includes(d.id))
    expect(missing).toEqual([])
  })

  test('day menu cards and the plate builder chips show the dish drawings', async () => {
    nav.path = '/day'
    nav.params = new URLSearchParams({ d: today })
    let show = await load(seed(today))
    const { DayScreen } = await import('../src/screens/customer/DayScreen')
    show(<DayScreen />)
    const card = screen.getByText('Bún bò Huế').closest('li')!
    expect(card.querySelector('svg[data-dish="d-bunbo"]')).not.toBeNull()
    cleanup()

    nav.path = '/plate'
    show = await load(seed(today))
    const { PlateScreen } = await import('../src/screens/customer/PlateScreen')
    show(<PlateScreen />)
    const chip = screen.getByRole('button', { name: /Rau muống xào tỏi/ })
    expect(chip.querySelector('svg[data-dish="d-raumuong"]')).not.toBeNull()
  })

  test('empty cart and no orders show an illustration and a way back to the week', async () => {
    const state: State = { ...seed(today), carts: {}, me: 'c-none' }
    nav.path = '/cart'
    let show = await load(state)
    const { CartScreen } = await import('../src/screens/customer/CartScreen')
    show(<CartScreen />)
    expect(document.querySelector('main svg')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Xem thực đơn tuần' })).toBeDefined()
    cleanup()

    nav.path = '/orders'
    show = await load(state)
    const { OrdersScreen } = await import('../src/screens/customer/OrdersScreen')
    show(<OrdersScreen />)
    expect(screen.getByText('Bạn chưa có đơn nào.')).toBeDefined()
    expect(document.querySelector('main svg')).not.toBeNull()
  })
})

describe('shop wording on the shop order detail (UI10, UI12)', () => {
  test('CN-39, UI12: a cancelled order with a refund and a report open speaks to the shop', async () => {
    const state = seed(today)
    const order: Order = {
      ...clean,
      id: state.orders[0].id,
      status: 'cancelled',
      received: total,
      refunds: [refund(total)],
      reports: [{ id: 'p1', amount: 40000, at: `${today} 08:10` }],
    }
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: order.id })
    const show = await load({ ...state, orders: [order, ...state.orders.slice(1)] })
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    const block = screen.getByTestId('money-state')
    expect(within(block).getByText(`Cần hoàn cho khách ${money(total)}`)).toBeDefined()
    expect(within(block).getByText('Khách báo đã chuyển 40.000 ₫, chờ bạn xác nhận')).toBeDefined()
  })

  test('CN-47, UI12: a Paid order with a report open speaks to the shop', async () => {
    const state = seed(today)
    const order: Order = { ...clean, id: state.orders[0].id, received: total, reports: [{ id: 'p1', amount: 40000, at: `${today} 08:10` }] }
    nav.path = '/shop/order'
    nav.params = new URLSearchParams({ id: order.id })
    const show = await load({ ...state, orders: [order, ...state.orders.slice(1)] })
    const { ShopOrderScreen } = await import('../src/screens/shop/ShopOrderScreen')
    show(<ShopOrderScreen />)
    const block = screen.getByTestId('money-state')
    expect(within(block).getByText('Đã nhận đủ tiền của khách')).toBeDefined()
    expect(within(block).getByText('Khách báo đã chuyển 40.000 ₫, chờ bạn xác nhận')).toBeDefined()
  })
})

describe('Payment screen branches with the money block', () => {
  const payWith = async (order: Order) => {
    const state = seed(today)
    nav.path = '/pay'
    nav.params = new URLSearchParams({ id: order.id })
    const show = await load({ ...state, me: order.customerId, orders: [order, ...state.orders.filter((o) => o.id !== order.id)] })
    const { PayScreen } = await import('../src/screens/customer/PayScreen')
    show(<PayScreen />)
  }
  const reportOf = (amount: number) => ({ id: 'p1', amount, at: `${today} 08:10` })

  test('AC28, CN-34: Reported, opened without qr=1: no QR, waiting text in the block, "Show QR again"', async () => {
    await payWith({ ...clean, reports: [reportOf(total)] })
    expect(screen.queryByRole('img', { name: 'Mã QR giả cho bản thử' })).toBeNull()
    expect(within(screen.getByTestId('money-state')).getByText(`Đã báo chuyển ${money(total)}, chờ shop xác nhận`)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Xem lại QR' })).toBeDefined()
  })

  test('CN-52: a cancelled order with a report open has no "Show QR again" on the Payment screen', async () => {
    await payWith({ ...clean, status: 'cancelled', reports: [reportOf(total)] })
    expect(screen.queryByRole('button', { name: 'Xem lại QR' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Mã QR giả cho bản thử' })).toBeNull()
  })

  test('CN-44, CN-46: the "not found" notice shows on the Payment screen also when nothing is left to pay', async () => {
    await payWith({ ...clean, status: 'cancelled', missing: [40000] })
    expect(screen.getByText('Shop chưa thấy khoản chuyển 40.000 ₫. Bạn kiểm tra lại hoặc gọi shop.')).toBeDefined()
  })
})
