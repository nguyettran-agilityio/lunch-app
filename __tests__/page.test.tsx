import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from '../src/components/AppShell'
import { WeekScreen } from '../src/screens/customer/WeekScreen'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  window.localStorage?.clear?.()
})

test('week view opens in Vietnamese and switches app text to English (AC18)', () => {
  render(
    <AppShell>
      <WeekScreen />
    </AppShell>,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Hôm nay ăn gì?' })).toBeDefined()
  // Seven days are listed: today + the next 6 (BR-3).
  expect(screen.getAllByRole('listitem').length).toBe(7)
  fireEvent.click(screen.getByRole('button', { name: 'en' }))
  expect(screen.getByRole('heading', { level: 1, name: 'What’s for lunch?' })).toBeDefined()
  // Shop-entered dish names stay as entered.
  expect(screen.getAllByText(/Sườn ram mặn ngọt/).length).toBeGreaterThan(0)
})
