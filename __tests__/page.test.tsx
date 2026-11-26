import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ProtoLayout from '../src/app/proto/layout'
import ProtoHome from '../src/app/proto/page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/proto',
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  window.localStorage?.clear?.()
})

test('the prototype week view at /proto opens in Vietnamese and switches app text to English (AC18)', () => {
  render(
    <ProtoLayout params={Promise.resolve({})}>
      <ProtoHome />
    </ProtoLayout>,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Hôm nay ăn gì?' })).toBeDefined()
  // The demo bar says the data is not real (B36).
  expect(screen.getByText('Dữ liệu thử')).toBeDefined()
  // Seven days are listed: today + the next 6 (BR-3).
  expect(screen.getAllByRole('listitem').length).toBe(7)
  // Links stay inside the prototype (B34).
  expect(screen.getAllByRole('link').every((a) => a.getAttribute('href')?.startsWith('/proto'))).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'en' }))
  expect(screen.getByRole('heading', { level: 1, name: 'What’s for lunch?' })).toBeDefined()
  expect(screen.getByText('Prototype data')).toBeDefined()
  // A dish with an English name shows it; one without keeps the name as entered (CN-31).
  expect(screen.getAllByText(/Caramelised pork ribs/).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Sườn ram mặn ngọt/)).toBeNull()
  expect(screen.getAllByText(/Bún chả/).length).toBeGreaterThan(0)
})
