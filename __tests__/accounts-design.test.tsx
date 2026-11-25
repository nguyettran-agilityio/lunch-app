// The M1-D mockups of the account screens at /proto/accounts (UI16): every direction renders every
// screen, and the three directions show the same messages on the same fake data. Mockups only:
// these tests name no AC, since the real screens come in M1-2 to M1-5. Removed with the mockups.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ProtoLayout from '../src/app/proto/layout'
import Page from '../src/app/proto/accounts/page'
import { update } from '../src/proto/store'

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/proto/accounts',
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  // The prototype keeps its language in memory: back to Vietnamese for the next test.
  update((s) => ({ ...s, lang: 'vi' }))
})

function show(query: string) {
  nav.params = new URLSearchParams(query)
  render(
    <ProtoLayout params={Promise.resolve({})}>
      <Page />
    </ProtoLayout>,
  )
  return within(screen.getByTestId('mockup'))
}

const tapCase = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

const SCREENS = ['signIn', 'signUp', 'forgot', 'reset', 'expired', 'profile']

describe.each(['a', 'b', 'c'])('direction %s', (dir) => {
  test.each(SCREENS)('renders %s with a page title', (s) => {
    const mock = show(`dir=${dir}&screen=${s}`)
    expect(mock.getByRole('heading', { level: 1 })).toBeDefined()
  })

  test('sign in: empty fields, a wrong password, and an account not confirmed with its button', () => {
    const mock = show(`dir=${dir}&screen=signIn`)
    tapCase('Để trống')
    expect(mock.getAllByText('Bắt buộc').length).toBeGreaterThan(0)
    tapCase('Sai mật khẩu')
    expect(mock.getByRole('alert').textContent).toContain('Sai mật khẩu')
    tapCase('Chưa xác nhận')
    fireEvent.click(mock.getByRole('button', { name: 'Gửi lại link xác nhận' }))
    expect(mock.getByRole('heading', { level: 1, name: 'Kiểm tra email để xác nhận' })).toBeDefined()
    expect(mock.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toHaveProperty('disabled', true)
  })

  test('sign up: a waiting phone number and a Google email each get their own message', () => {
    const mock = show(`dir=${dir}&screen=signUp`)
    tapCase('SĐT chờ + email Google (AC83)')
    expect(mock.getAllByText('Số điện thoại này đang chờ xác nhận email').length).toBeGreaterThan(0)
    // Direction C asks one question per step: the email's message is on the next step.
    if (dir === 'c') fireEvent.click(mock.getByRole('button', { name: 'Tiếp tục' }))
    expect(mock.getAllByText('Email này đã có tài khoản (đăng nhập bằng Google)').length).toBeGreaterThan(0)
  })

  test('profile: a new email waits for its confirmation; a shop email is refused', () => {
    const mock = show(`dir=${dir}&screen=profile&profile=pending`)
    tapCase('Email của shop')
    expect(mock.getAllByText('Email này dành cho tài khoản của shop').length).toBeGreaterThan(0)
    tapCase('Đổi email')
    expect(mock.getByText(/Đang chờ xác nhận lan3@gmail.com/)).toBeDefined()
  })

  test('the expired email-change link is not drawn: it is not decided yet', () => {
    const mock = show(`dir=${dir}&screen=expired&type=email_change`)
    expect(mock.getByText(/Chưa quyết \(A1, A2, A3\)/)).toBeDefined()
    expect(mock.queryByRole('textbox')).toBeNull()
  })
})

test('the mockup follows the VI/EN switch', () => {
  const mock = show('dir=a&screen=signIn')
  fireEvent.click(screen.getByRole('button', { name: 'en' }))
  expect(mock.getByRole('heading', { level: 1, name: 'Sign in to order lunch' })).toBeDefined()
  tapCase('Wrong password')
  expect(mock.getByRole('alert').textContent).toContain('Wrong password')
})

describe('fixes from the spec-reviewer run', () => {
  test('a Google profile refuses the phone number of a confirmed account', () => {
    const mock = show('dir=a&screen=profile&profile=google')
    fireEvent.change(mock.getByLabelText('Số điện thoại'), { target: { value: '0912 345 678' } })
    fireEvent.change(mock.getByLabelText('Tòa nhà mặc định'), { target: { value: 'b-etown' } })
    fireEvent.click(mock.getByRole('button', { name: 'Lưu' }))
    expect(mock.getByText('Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop')).toBeDefined()
  })

  test('Google with someone’s waiting new email is refused, and what else shows is not decided (B2)', () => {
    const mock = show('dir=a&screen=signIn')
    tapCase('Google, email mới đang chờ của người khác')
    expect(mock.getByRole('alert').textContent).toContain('Email này đang chờ xác nhận')
    expect(mock.getByText(/Chưa quyết \(B2\)/)).toBeDefined()
  })

  test('a Google account with no phone number gets the profile first', () => {
    const mock = show('dir=a&screen=signIn')
    fireEvent.click(mock.getByRole('button', { name: 'Tiếp tục với Google' }))
    fireEvent.click(mock.getByRole('button', { name: 'minh@gmail.com' }))
    expect(mock.getByText(/hồ sơ \(S-C2\)/)).toBeDefined()
  })

  test('signing up again with the waiting account sends nothing, so "Send again" works at once', () => {
    const mock = show('dir=a&screen=signUp')
    tapCase('Đăng ký lại tài khoản chờ')
    expect(mock.getByRole('button', { name: 'Gửi lại' })).toHaveProperty('disabled', false)
  })

  test('a declined building shows the profile, not the completion wording', () => {
    const mock = show('dir=a&screen=profile&profile=declined')
    expect(mock.getByRole('heading', { level: 1, name: 'Hồ sơ' })).toBeDefined()
    expect(mock.getByText('Shop không giao tới Tòa ABC; hãy chọn tòa khác')).toBeDefined()
  })

  test('typing again the address already waiting sends nothing more; it is not decided (E5)', () => {
    const mock = show('dir=a&screen=profile&profile=pending')
    fireEvent.change(mock.getByLabelText('Email'), { target: { value: 'lan2@gmail.com' } })
    fireEvent.click(mock.getByRole('button', { name: 'Lưu' }))
    expect(mock.getByText(/Chưa quyết \(E5\)/)).toBeDefined()
    expect(mock.getByRole('button', { name: 'Gửi lại' })).toHaveProperty('disabled', false)
  })

  test('saving a complete profile: where it goes is not decided (E6), the new email still waits', () => {
    const mock = show('dir=a&screen=profile&profile=pending')
    tapCase('Đổi email')
    expect(mock.getByText(/Chưa quyết \(E6\)/)).toBeDefined()
    expect(mock.getByText(/Đang chờ xác nhận lan3@gmail.com/)).toBeDefined()
  })

  test('a shop account goes to the shop screens', () => {
    const mock = show('dir=a&screen=signIn')
    tapCase('Tài khoản shop')
    expect(mock.getByText(/màn của shop/)).toBeDefined()
  })

  test('only spaces are removed from a phone number', () => {
    const mock = show('dir=a&screen=signIn')
    fireEvent.change(mock.getByLabelText('Số điện thoại hoặc email'), { target: { value: '0912.345.678' } })
    fireEvent.click(mock.getByRole('button', { name: 'Đăng nhập' }))
    expect(mock.getByText('Số điện thoại không hợp lệ')).toBeDefined()
  })
})

test('phone numbers on the profile are shown 4-3-3', () => {
  const mock = show('dir=b&screen=profile&profile=new')
  expect((mock.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0912 345 678')
})
