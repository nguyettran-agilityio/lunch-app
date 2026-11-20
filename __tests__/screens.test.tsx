// Screen tests for the prototype feedback: repeated "Add" on the day menu, and the money shown on a
// paid order that was cancelled (customer and shop order detail).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { seed } from '../src/proto/seed'
import { vietnamNow } from '../src/proto/time'
import type { State } from '../src/proto/types'

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), path: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => nav.params,
}))

const KEY = 'lunch-prototype-v3'
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
