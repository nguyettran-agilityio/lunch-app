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
  // A dish with an English name shows it; one without keeps the name as entered (CN-31).
  expect(screen.getAllByText(/Caramelised pork ribs/).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Sườn ram mặn ngọt/)).toBeNull()
  expect(screen.getAllByText(/Bún chả/).length).toBeGreaterThan(0)
})
