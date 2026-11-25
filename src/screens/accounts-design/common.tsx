'use client'

// M1-D design round for the account screens (UI16, docs/design.md). Mockups only: fake accounts in
// memory, no server, no Supabase. Every direction renders the same flow below, so the directions
// differ only in layout and in how errors are shown (CN-64). Removed once the Lead has chosen.
// The texts are the spec's English; the Vietnamese is drafted by Claude for the Lead to review (CN-64).
import { useCallback, useEffect, useState } from 'react'
import type { Lang } from '@/domain/types'
import { useApp } from '@/screens/app'

export type Dir = 'a' | 'b' | 'c'
export type Screen = 'signIn' | 'signUp' | 'forgot' | 'reset' | 'expired' | 'profile'
export type ExpiredType = 'signup' | 'recovery' | 'email_change'
export type ProfileCase = 'new' | 'google' | 'pending' | 'declined'
export type Field = 'id' | 'phone' | 'email' | 'password' | 'name' | 'building' | 'propName' | 'propAddress'

const vi = {
  signIn: 'Đăng nhập',
  signUp: 'Đăng ký',
  signInTitle: 'Đăng nhập để đặt cơm',
  signUpTitle: 'Tạo tài khoản',
  signUpIntro: 'Chỉ cần số điện thoại, email và mật khẩu. Tên và tòa nhà bạn điền sau khi xác nhận email.',
  id: 'Số điện thoại hoặc email',
  phone: 'Số điện thoại',
  email: 'Email',
  password: 'Mật khẩu',
  newPassword: 'Mật khẩu mới',
  google: 'Tiếp tục với Google',
  or: 'hoặc',
  forgotLink: 'Quên mật khẩu?',
  noAccountYet: 'Chưa có tài khoản?',
  haveAccount: 'Đã có tài khoản?',
  next: 'Tiếp tục',
  back: 'Quay lại',
  step: (i: number, n: number) => `Bước ${i} trên ${n}`,
  required: 'Bắt buộc',
  phoneInvalid: 'Số điện thoại không hợp lệ',
  emailInvalid: 'Email không hợp lệ',
  passwordRule: 'Ít nhất 8 ký tự, có cả chữ và số',
  wrongPassword: 'Sai mật khẩu',
  noAccount: 'Không có tài khoản nào với số điện thoại hoặc email này',
  signsInWithGoogle: 'Tài khoản này đăng nhập bằng Google',
  notConfirmed: 'Bạn chưa xác nhận email',
  sendConfirm: 'Gửi lại link xác nhận',
  tooMany: 'Thử quá nhiều lần, vui lòng thử lại sau vài phút',
  checkEmail: 'Kiểm tra email để xác nhận',
  checkEmailBody: 'Bấm vào link trong email để xác nhận tài khoản. Link dùng được một lần, trong 1 giờ.',
  sendAgain: 'Gửi lại',
  sendAgainIn: (s: number) => `Gửi lại sau ${s} giây`,
  emailHasGoogle: 'Email này đã có tài khoản (đăng nhập bằng Google)',
  emailHasPhone: 'Email này đã có tài khoản (đăng nhập bằng số điện thoại)',
  phoneHasAccount: 'Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop',
  phoneWaiting: 'Số điện thoại này đang chờ xác nhận email',
  googleHasPhone: 'Email này đã có tài khoản đăng nhập bằng số điện thoại; hãy đăng nhập bằng số điện thoại và mật khẩu',
  googleWaiting: 'Email này có tài khoản đăng nhập bằng số điện thoại và chưa được xác nhận',
  emailTaken: 'Email này đã có tài khoản',
  emailShop: 'Email này dành cho tài khoản của shop',
  emailWaiting: 'Email này đang chờ xác nhận',
  waitingFor: (e: string) => `Đang chờ xác nhận ${e}`,
  forgotTitle: 'Quên mật khẩu',
  forgotIntro: 'Nhập số điện thoại hoặc email của tài khoản. Link đặt lại mật khẩu được gửi tới email của tài khoản.',
  sendReset: 'Gửi link đặt lại mật khẩu',
  resetSent: 'Đã gửi link đặt lại mật khẩu',
  resetSentBody: 'Mở email của tài khoản và bấm vào link. Link dùng được một lần, trong 1 giờ.',
  resetTitle: 'Đặt mật khẩu mới',
  resetIntro: 'Sau khi lưu, bạn được đăng nhập trên máy này và đăng xuất trên mọi máy khác.',
  saveNewPassword: 'Lưu mật khẩu mới',
  expiredTitle: 'Link đã hết hạn',
  expiredIntro: 'Nhập số điện thoại hoặc email của tài khoản để nhận link mới.',
  sendNewLink: 'Gửi link mới',
  alreadyConfirmed: 'Email của bạn đã được xác nhận, vui lòng đăng nhập',
  profileTitle: 'Hồ sơ',
  completeTitle: 'Hoàn tất hồ sơ',
  completeIntro: 'Cho shop biết tên bạn và tòa nhà giao cơm trước khi đặt món.',
  name: 'Tên',
  nameMax: 'Tối đa 80 ký tự',
  building: 'Tòa nhà mặc định',
  pickBuilding: 'Chọn tòa nhà',
  language: 'Ngôn ngữ',
  googleEmailNote: 'Email của tài khoản Google không đổi được.',
  emailChangeNote: 'Email mới chỉ có hiệu lực sau khi bạn bấm link gửi tới email đó.',
  declined: (b: string) => `Shop không giao tới ${b}; hãy chọn tòa khác`,
  save: 'Lưu',
  checkFields: (n: number) => `Kiểm tra lại ${n} chỗ bên dưới`,
}

type Strings = typeof vi

const en: Strings = {
  signIn: 'Sign in',
  signUp: 'Sign up',
  signInTitle: 'Sign in to order lunch',
  signUpTitle: 'Create an account',
  signUpIntro: 'Only a phone number, an email and a password. You add your name and building after confirming the email.',
  id: 'Phone number or email',
  phone: 'Phone number',
  email: 'Email',
  password: 'Password',
  newPassword: 'New password',
  google: 'Continue with Google',
  or: 'or',
  forgotLink: 'Forgot password?',
  noAccountYet: 'No account yet?',
  haveAccount: 'Already have an account?',
  next: 'Continue',
  back: 'Back',
  step: (i, n) => `Step ${i} of ${n}`,
  required: 'Required',
  phoneInvalid: 'Phone number is not valid',
  emailInvalid: 'Email is not valid',
  passwordRule: 'At least 8 characters, with both letters and digits',
  wrongPassword: 'Wrong password',
  noAccount: 'No account with this phone number or email',
  signsInWithGoogle: 'This account signs in with Google',
  notConfirmed: 'You have not confirmed your email',
  sendConfirm: 'Send the confirmation link again',
  tooMany: 'Too many attempts, please try again in a few minutes',
  checkEmail: 'Check your email to confirm',
  checkEmailBody: 'Tap the link in the email to confirm the account. The link works once, for 1 hour.',
  sendAgain: 'Send again',
  sendAgainIn: (s) => `Send again in ${s} s`,
  emailHasGoogle: 'This email already has an account (signs in with Google)',
  emailHasPhone: 'This email already has an account (signs in with a phone number)',
  phoneHasAccount: 'This phone number already has an account. If it is yours, call the shop',
  phoneWaiting: 'This phone number is waiting for its email to be confirmed',
  googleHasPhone: 'This email already has an account that signs in with a phone number; sign in with phone + password',
  googleWaiting: 'This email has an account that signs in with a phone number and is not confirmed yet',
  emailTaken: 'This email already has an account',
  emailShop: 'This email is for a shop account',
  emailWaiting: 'This email is waiting for its confirmation',
  waitingFor: (e) => `Waiting for confirmation of ${e}`,
  forgotTitle: 'Forgot password',
  forgotIntro: 'Enter the phone number or email of your account. The reset link goes to the email of the account.',
  sendReset: 'Send the reset link',
  resetSent: 'The reset link is sent',
  resetSentBody: 'Open the email of your account and tap the link. The link works once, for 1 hour.',
  resetTitle: 'Set a new password',
  resetIntro: 'Once it is saved, you are signed in on this device and signed out on every other device.',
  saveNewPassword: 'Save the new password',
  expiredTitle: 'The link has expired',
  expiredIntro: 'Enter the phone number or email of your account to get a new link.',
  sendNewLink: 'Send a new link',
  alreadyConfirmed: 'Your email is already confirmed, please sign in',
  profileTitle: 'Profile',
  completeTitle: 'Complete your profile',
  completeIntro: 'Tell the shop your name and the building to deliver to before you order.',
  name: 'Name',
  nameMax: 'At most 80 characters',
  building: 'Default building',
  pickBuilding: 'Pick a building',
  language: 'Language',
  googleEmailNote: 'The email of a Google account cannot be changed.',
  emailChangeNote: 'The new email takes effect only after you tap the link sent to it.',
  declined: (b) => `The shop does not deliver to ${b}; pick another building`,
  save: 'Save',
  checkFields: (n) => `Check ${n} fields below`,
}

/** Words of the mockup frame (switchers and notes), not of the app. */
const frameVi = {
  title: 'Màn tài khoản: chọn hướng giao diện',
  intro: 'Mockup trên dữ liệu giả (UI16). Chọn hướng, màn và một tình huống; bấm thử như thật.',
  dir: 'Hướng',
  screen: 'Màn',
  cases: 'Tình huống',
  linkType: 'Loại link',
  account: 'Tài khoản',
  startOver: 'Làm lại',
  skipWait: 'Bỏ qua 60 giây',
  mockup: 'Mockup',
  googlePick: 'Google sẽ hỏi chọn tài khoản nào:',
  undecided: (ids: string) => `Chưa quyết (${ids}): mockup không vẽ phần này.`,
  signedIn: (to: string) => `Đã đăng nhập. App mở ${to}.`,
  passwordSet:
    'Đã lưu mật khẩu mới. App đăng nhập máy này, đăng xuất các máy khác, rồi đi như sau khi đăng nhập: màn shop cho tài khoản shop, hồ sơ trước nếu chưa đủ, còn lại trang chủ (CN-65).',
  saved: 'Đã lưu hồ sơ. App mở trang đã gửi khách tới đây, hoặc trang chủ (CN-65).',
  toHome: 'trang đã gửi khách tới đăng nhập, hoặc trang chủ (CN-65)',
  toShop: 'màn của shop, không hỏi hồ sơ khách (AC57)',
  expiredSignedOut:
    'Khách chưa đăng nhập: app mở trang đăng nhập trước, rồi quay lại trang này; trang không hỏi số điện thoại hay email (CN-65).',
  langNew: 'C1',
  toProfile: 'hồ sơ (S-C2) vì chưa có tên và tòa nhà',
  dirs: { a: 'A · Gói lá', b: 'B · Dải lá lớn', c: 'C · Từng bước' },
  screens: {
    signIn: 'Đăng nhập',
    signUp: 'Đăng ký',
    forgot: 'Quên mật khẩu',
    reset: 'Đặt lại mật khẩu',
    expired: 'Link hết hạn',
    profile: 'Hồ sơ',
  },
  types: { signup: 'Xác nhận đăng ký', recovery: 'Đặt lại mật khẩu', email_change: 'Đổi email' },
  profiles: { new: 'Mới xác nhận (SĐT)', google: 'Google lần đầu', pending: 'Đang đổi email', declined: 'Tòa bị từ chối' },
}

const frameEn: typeof frameVi = {
  title: 'Account screens: pick a direction',
  intro: 'Mockups on fake data (UI16). Pick a direction, a screen and a case; try it like the real thing.',
  dir: 'Direction',
  screen: 'Screen',
  cases: 'Cases',
  linkType: 'Link type',
  account: 'Account',
  startOver: 'Start over',
  skipWait: 'Skip the 60 s',
  mockup: 'Mockup',
  googlePick: 'Google would ask which account:',
  undecided: (ids) => `Not decided (${ids}): the mockup does not draw this.`,
  signedIn: (to) => `Signed in. The app opens ${to}.`,
  passwordSet:
    'New password saved. The app signs this device in, signs out the others, then goes on as after signing in: the shop screens for a shop account, the profile first when incomplete, else the home page (CN-65).',
  saved: 'Profile saved. The app opens the page that sent the customer here, or the home page (CN-65).',
  toHome: 'the page that sent the customer to sign in, or the home page (CN-65)',
  toShop: 'the shop screens, with no customer profile asked (AC57)',
  expiredSignedOut:
    'Not signed in: the app opens the sign-in page first, then comes back to this page; the page asks for no phone number or email (CN-65).',
  langNew: 'C1',
  toProfile: 'the profile (S-C2), since there is no name or building yet',
  dirs: { a: 'A · Leaf parcel', b: 'B · Big leaf band', c: 'C · Step by step' },
  screens: {
    signIn: 'Sign in',
    signUp: 'Sign up',
    forgot: 'Forgot password',
    reset: 'Reset password',
    expired: 'Expired link',
    profile: 'Profile',
  },
  types: { signup: 'Sign-up confirmation', recovery: 'Password reset', email_change: 'Email change' },
  profiles: { new: 'Just confirmed (phone)', google: 'Google, first time', pending: 'Changing email', declined: 'Building declined' },
}

export function useT(): { t: Strings; f: typeof frameVi; lang: Lang } {
  const { s } = useApp()
  return { t: s.lang === 'en' ? en : vi, f: s.lang === 'en' ? frameEn : frameVi, lang: s.lang }
}

// ---------- Fake accounts ----------

type Account =
  { kind: 'phone'; phone: string; email: string; password: string; confirmed: boolean } | { kind: 'google'; email: string; name: string }

export const FAKE = {
  lan: { kind: 'phone', phone: '0912345678', email: 'lan@gmail.com', password: 'comla2026', confirmed: true },
  huy: { kind: 'phone', phone: '0905111222', email: 'huy@gmail.com', password: 'huy12345', confirmed: false },
  binh: { kind: 'phone', phone: '0977222333', email: 'binh@gmail.com', password: 'binh2026', confirmed: true },
  /** A Google account with no phone number yet: it gets the profile first (BR-15). */
  minh: { kind: 'google', email: 'minh@gmail.com', name: 'Lê Văn Minh' },
  /** The shop account: its email is in the shop list (AC57). */
  shop: { kind: 'phone', phone: '0901000111', email: 'comla.shop@gmail.com', password: 'shop2026', confirmed: true },
} satisfies Record<string, Account>

const ACCOUNTS: Account[] = Object.values(FAKE)
/** The configured shop list (SHOP_EMAILS). */
const SHOP_EMAILS = [FAKE.shop.email]
/** A new email another customer is waiting to confirm (CN-65). */
export const OTHER_PENDING = ['thu.moi@gmail.com']
/** A Google account that has no account here yet, with the name Google gives. */
export const NEW_GOOGLE = { email: 'an.nguyen@gmail.com', name: 'Nguyễn Văn An' }

/** Spaces removed and +84 becomes 0, nothing else (BR-29a). */
export const normalizePhone = (v: string) => v.replace(/\s/g, '').replace(/^\+84/, '0')
const validPhone = (v: string) => /^0[35789]\d{8}$/.test(normalizePhone(v))
const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
const validPassword = (v: string) => v.length >= 8 && /[a-zA-Z]/.test(v) && /\d/.test(v)
/** Phone numbers are shown 4-3-3 (BR-29a). */
export const groupPhone = (v: string) => {
  const p = normalizePhone(v)
  return p.length === 10 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : v
}
const byEmail = (e: string) => ACCOUNTS.find((a) => a.email === e.trim().toLowerCase())
const byPhone = (p: string) => ACCOUNTS.find((a) => a.kind === 'phone' && a.phone === normalizePhone(p))
const byId = (v: string) => (v.includes('@') ? byEmail(v) : byPhone(v))

// ---------- The flow every direction renders ----------

export type Values = Record<string, string>

/** A message about the whole action, not one field. */
export type ActionMsg = { text: string; tone: 'chili' | 'leaf'; then?: 'sendConfirm' | 'signIn' }

export type Flow = {
  screen: Screen
  values: Values
  set: (k: string, v: string) => void
  errors: Partial<Record<Field, string>>
  /** A field whose message carries "Send again" (AC83). */
  fieldSendAgain: Field | null
  action: ActionMsg | null
  /** Something was sent: the form gives way to this panel, with "Send again". */
  sent: { title: string; body: string } | null
  /** A new email is waiting on the profile (CN-64). */
  waitingEmail: string | null
  /** Mockup note: what the real app does next. */
  next: string | null
  undecided: string | null
  googleOpen: boolean
  setGoogleOpen: (v: boolean) => void
  submit: (v?: Values) => void
  /** Format checks of some fields only, for the steps of direction C. */
  check: (fields: Field[]) => boolean
  google: (email: string) => void
  sendConfirm: () => void
  sendAgain: () => void
  cooldown: number
  skipWait: () => void
  /** Counted on every try, so direction C can go to the step with the error. */
  tries: { n: number; via: 'form' | 'google' }
}

export const STARTS: Record<ProfileCase, Values> = {
  new: { name: '', phone: '0912 345 678', email: FAKE.lan.email, building: '' },
  google: { name: NEW_GOOGLE.name, phone: '', email: NEW_GOOGLE.email, building: '' },
  pending: { name: 'Trần Thị Lan', phone: '0912 345 678', email: FAKE.lan.email, building: 'b-bitexco' },
  declined: { name: 'Trần Thị Lan', phone: '0912 345 678', email: FAKE.lan.email, building: '' },
}

export function useFlow(screen: Screen, opts: { type: ExpiredType; profile: ProfileCase }): Flow {
  const { t, f } = useT()
  const start = useCallback((): Values => (screen === 'profile' ? { ...STARTS[opts.profile] } : {}), [screen, opts.profile])
  const [values, setValues] = useState<Values>(start)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [fieldSendAgain, setFieldSendAgain] = useState<Field | null>(null)
  const [action, setAction] = useState<ActionMsg | null>(null)
  const [sent, setSent] = useState<Flow['sent']>(null)
  const [waitingEmail, setWaitingEmail] = useState<string | null>(
    screen === 'profile' && opts.profile === 'pending' ? 'lan2@gmail.com' : null,
  )
  const [next, setNext] = useState<string | null>(null)
  const [undecided, setUndecided] = useState<string | null>(null)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [tries, setTries] = useState<Flow['tries']>({ n: 0, via: 'form' })

  useEffect(() => {
    if (sentAt === null) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [sentAt])
  const cooldown = sentAt === null ? 0 : Math.max(0, 60 - Math.floor((now - sentAt) / 1000))
  const startWait = () => {
    setSentAt(Date.now())
    setNow(Date.now())
  }

  const fieldError = (field: Field, v: string): string | undefined => {
    const x = (v ?? '').trim()
    if (field === 'propName' || field === 'propAddress') return undefined
    // A complete profile has a phone number too (BR-15), so a Google account fills it in here.
    if (x === '') return t.required
    if (field === 'id') return x.includes('@') ? (validEmail(x) ? undefined : t.emailInvalid) : validPhone(x) ? undefined : t.phoneInvalid
    if (field === 'phone') return validPhone(x) ? undefined : t.phoneInvalid
    if (field === 'email') return validEmail(x) ? undefined : t.emailInvalid
    if (field === 'password') return screen === 'signIn' || validPassword(v) ? undefined : t.passwordRule
    if (field === 'name') return [...x.normalize('NFC')].length > 80 ? t.nameMax : undefined
    return undefined
  }

  const fieldsOf: Record<Screen, Field[]> = {
    signIn: ['id', 'password'],
    signUp: ['phone', 'email', 'password'],
    forgot: ['id'],
    reset: ['password'],
    expired: opts.type === 'email_change' ? [] : ['id'],
    profile: opts.profile === 'google' ? ['name', 'phone', 'building'] : ['name', 'phone', 'email', 'building'],
  }

  const formatErrors = (fields: Field[], v: Values) => {
    const e: Partial<Record<Field, string>> = {}
    for (const field of fields) {
      const msg = fieldError(field, v[field] ?? '')
      if (msg) e[field] = msg
    }
    return e
  }

  const check = (fields: Field[]) => {
    const e = formatErrors(fields, values)
    // Messages of the other steps stay, so the next step still shows its own (AC83 in direction C).
    setErrors((old) => ({ ...Object.fromEntries(Object.entries(old).filter(([k]) => !fields.includes(k as Field))), ...e }))
    setAction(null)
    return Object.keys(e).length === 0
  }

  const reply = (r: {
    errors?: Partial<Record<Field, string>>
    fieldSendAgain?: Field
    action?: ActionMsg
    sent?: Flow['sent']
    /** True when nothing was sent now, so "Send again" is not held back (CN-60). */
    nothingSent?: boolean
    next?: string
    undecided?: string
  }) => {
    setErrors(r.errors ?? {})
    setFieldSendAgain(r.fieldSendAgain ?? null)
    setAction(r.action ?? null)
    setNext(r.next ?? null)
    setUndecided(r.undecided ?? null)
    if (r.sent) {
      setSent(r.sent)
      if (!r.nothingSent) startWait()
    }
  }

  const checkEmailSent = { title: t.checkEmail, body: t.checkEmailBody }
  const resetSentPanel = { title: t.resetSent, body: t.resetSentBody }

  const submit = (given?: Values) => {
    const v = given ? { ...start(), ...given } : values
    if (given) setValues(v)
    setTries((x) => ({ n: x.n + 1, via: 'form' }))
    setGoogleOpen(false)
    if (v.tooMany) return reply({ action: { text: t.tooMany, tone: 'chili' } })
    const e = formatErrors(fieldsOf[screen], v)
    if (Object.keys(e).length > 0) return reply({ errors: e })

    if (screen === 'signIn') {
      const a = byId(v.id)
      if (!a) return reply({ action: { text: t.noAccount, tone: 'chili' } })
      if (a.kind === 'google') return reply({ action: { text: t.signsInWithGoogle, tone: 'chili' } })
      if (a.password !== v.password) return reply({ action: { text: t.wrongPassword, tone: 'chili' } })
      if (!a.confirmed) return reply({ action: { text: t.notConfirmed, tone: 'chili', then: 'sendConfirm' } })
      return reply({ next: f.signedIn(SHOP_EMAILS.includes(a.email) ? f.toShop : f.toHome) })
    }

    if (screen === 'signUp') {
      const email = v.email.trim().toLowerCase()
      const p = byPhone(v.phone)
      const m = byEmail(email)
      const err: Partial<Record<Field, string>> = {}
      // Not decided: both fields of one confirmed account (E2), or a confirmed phone with the email of
      // another account still waiting (E3), docs/plan.md M1 "Open for the Lead".
      if (p?.kind === 'phone' && p.confirmed && m === p) return reply({ undecided: f.undecided('E2') })
      if (p?.kind === 'phone' && p.confirmed && m?.kind === 'phone' && !m.confirmed) return reply({ undecided: f.undecided('E3') })
      if (OTHER_PENDING.includes(email)) err.email = t.emailWaiting
      else if (m && (m.kind === 'google' || m.confirmed) && m !== p) err.email = m.kind === 'google' ? t.emailHasGoogle : t.emailHasPhone
      if (p && p.kind === 'phone' && p.confirmed) err.phone = t.phoneHasAccount
      if (Object.keys(err).length > 0) {
        // A phone number waiting for its email, next to another field's refusal, gets its own message (AC83).
        if (p && p.kind === 'phone' && !p.confirmed && !err.phone) {
          err.phone = t.phoneWaiting
          return reply({ errors: err, fieldSendAgain: 'phone' })
        }
        return reply({ errors: err })
      }
      // The same waiting account again: nothing new is sent, "Send again" sends (CN-60).
      if (p && p === m) return reply({ sent: checkEmailSent, nothingSent: true })
      // A new account, or a waiting account replaced (CN-62).
      return reply({ sent: checkEmailSent })
    }

    if (screen === 'forgot' || (screen === 'expired' && opts.type === 'recovery')) {
      const a = byId(v.id)
      if (!a) return reply({ action: { text: t.noAccount, tone: 'chili' } })
      if (a.kind === 'google') return reply({ action: { text: t.signsInWithGoogle, tone: 'chili' } })
      if (!a.confirmed) return reply({ action: { text: t.notConfirmed, tone: 'chili', then: 'sendConfirm' } })
      return reply({ sent: resetSentPanel })
    }

    if (screen === 'expired' && opts.type === 'signup') {
      const a = byId(v.id)
      if (!a) return reply({ action: { text: t.noAccount, tone: 'chili' } })
      if (a.kind === 'google') return reply({ undecided: f.undecided('E1') })
      if (a.confirmed) return reply({ action: { text: t.alreadyConfirmed, tone: 'leaf', then: 'signIn' } })
      return reply({ sent: checkEmailSent })
    }

    if (screen === 'reset') return reply({ next: f.passwordSet })

    if (screen === 'profile') {
      const err: Partial<Record<Field, string>> = {}
      const phone = (v.phone ?? '').trim()
      if (phone) {
        // Checked as at sign-up; a waiting account's number gets no "Send again" here (BR-29a, CN-63).
        const p = byPhone(phone)
        const own = opts.profile === 'google' ? null : FAKE.lan
        if (p && p.kind === 'phone' && p !== own) err.phone = p.confirmed ? t.phoneHasAccount : t.phoneWaiting
      }
      let newEmail: string | null = null
      const current = STARTS[opts.profile].email
      const email = (v.email ?? '').trim().toLowerCase()
      if (opts.profile !== 'google' && email !== current) {
        const m = byEmail(email)
        if (SHOP_EMAILS.includes(email)) err.email = t.emailShop
        else if (OTHER_PENDING.includes(email) || (m && m.kind === 'phone' && !m.confirmed)) err.email = t.emailWaiting
        else if (m) err.email = t.emailTaken
        else newEmail = email
      }
      // The email field keeps the current email: left as it is, nothing changes (B5 and C3 are not decided).
      if (Object.keys(err).length > 0) return reply({ errors: err })
      // Typing again the address already waiting is not decided (E5).
      if (newEmail && newEmail === waitingEmail) return reply({ undecided: f.undecided('E5') })
      setValues({ ...v, phone: groupPhone(phone), email: newEmail ? current : v.email })
      if (newEmail) {
        setWaitingEmail(newEmail)
        startWait()
      }
      // Where a save of a complete profile goes is not decided (E6); an incomplete one goes on (CN-65).
      if (opts.profile === 'pending') return reply({ undecided: f.undecided('E6') })
      return reply({ next: f.saved })
    }
  }

  const google = (email: string) => {
    setGoogleOpen(false)
    setTries((x) => ({ n: x.n + 1, via: 'google' }))
    const a = byEmail(email)
    // Someone's new email still waiting: refused (CN-65); what else the page shows is B2, not decided.
    if (OTHER_PENDING.includes(email)) return reply({ action: { text: t.emailWaiting, tone: 'chili' }, undecided: f.undecided('B2') })
    if (a?.kind === 'phone' && a.confirmed) return reply({ action: { text: t.googleHasPhone, tone: 'chili' } })
    if (a?.kind === 'phone') return reply({ action: { text: t.googleWaiting, tone: 'chili', then: 'sendConfirm' } })
    // The fake Google accounts have no phone number yet, so each gets the profile first (BR-15).
    return reply({ next: f.signedIn(f.toProfile) })
  }

  return {
    screen,
    values,
    set: (k, v) => setValues((old) => ({ ...old, [k]: v })),
    errors,
    fieldSendAgain,
    action,
    sent,
    waitingEmail,
    next,
    undecided,
    googleOpen,
    setGoogleOpen,
    submit,
    check,
    google,
    sendConfirm: () => {
      setAction(null)
      setSent(checkEmailSent)
      startWait()
    },
    sendAgain: startWait,
    cooldown,
    skipWait: () => setSentAt(null),
    tries,
  }
}

// ---------- Cases the Lead can jump to (each fills the form and taps the main button) ----------

export type Case = { key: string; vi: string; en: string; values?: Values; google?: string }

export function casesOf(screen: Screen, type: ExpiredType, profile: ProfileCase): Case[] {
  const lan = FAKE.lan
  switch (screen) {
    case 'signIn':
      return [
        { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
        { key: 'badPhone', vi: 'SĐT sai dạng', en: 'Bad phone', values: { id: '0123 45', password: 'x' } },
        { key: 'badEmail', vi: 'Email sai dạng', en: 'Bad email', values: { id: 'lan@gmail', password: 'x' } },
        { key: 'wrong', vi: 'Sai mật khẩu', en: 'Wrong password', values: { id: '+84912345678', password: 'abc12345' } },
        { key: 'none', vi: 'Không có tài khoản', en: 'No account', values: { id: '0987 654 321', password: 'abc12345' } },
        {
          key: 'google',
          vi: 'Email Google + mật khẩu',
          en: 'Google email + password',
          values: { id: FAKE.minh.email, password: 'abc12345' },
        },
        { key: 'unconfirmed', vi: 'Chưa xác nhận', en: 'Not confirmed', values: { id: FAKE.huy.email, password: FAKE.huy.password } },
        { key: 'tooMany', vi: 'Thử quá nhiều', en: 'Too many', values: { id: lan.phone, password: 'x', tooMany: '1' } },
        { key: 'gPhone', vi: 'Google trùng email SĐT', en: 'Google, phone email', google: lan.email },
        { key: 'gWaiting', vi: 'Google, email chờ xác nhận', en: 'Google, waiting email', google: FAKE.huy.email },
        {
          key: 'gPending',
          vi: 'Google, email mới đang chờ của người khác',
          en: 'Google, someone’s waiting new email',
          google: OTHER_PENDING[0],
        },
        { key: 'ok', vi: 'Đăng nhập được', en: 'Signs in', values: { id: '0912 345 678', password: lan.password } },
        { key: 'shop', vi: 'Tài khoản shop', en: 'Shop account', values: { id: FAKE.shop.email, password: FAKE.shop.password } },
      ]
    case 'signUp':
      return [
        { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
        { key: 'format', vi: 'Sai dạng', en: 'Bad format', values: { phone: '0212 345 678', email: 'lan@', password: 'abcdefgh' } },
        {
          key: 'phoneTaken',
          vi: 'SĐT đã có',
          en: 'Phone taken',
          values: { phone: '0912345678', email: 'lan.moi@gmail.com', password: 'abcdef12' },
        },
        {
          key: 'emailGoogle',
          vi: 'Email Google',
          en: 'Google email',
          values: { phone: '0938 123 456', email: FAKE.minh.email, password: 'abcdef12' },
        },
        {
          key: 'ac83',
          vi: 'SĐT chờ + email Google (AC83)',
          en: 'Waiting phone + Google email (AC83)',
          values: { phone: '0905111222', email: FAKE.minh.email, password: 'abcdef12' },
        },
        {
          key: 'waiting',
          vi: 'Đăng ký lại tài khoản chờ',
          en: 'Waiting account again',
          values: { phone: '0905111222', email: FAKE.huy.email, password: 'abcdef12' },
        },
        {
          key: 'tooMany',
          vi: 'Thử quá nhiều',
          en: 'Too many',
          values: { phone: '0938 123 456', email: 'thao@gmail.com', password: 'abcdef12', tooMany: '1' },
        },
        { key: 'ok', vi: 'Đăng ký được', en: 'Signs up', values: { phone: '0938 123 456', email: 'thao@gmail.com', password: 'abcdef12' } },
      ]
    case 'forgot':
      return [
        { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
        { key: 'none', vi: 'Không có tài khoản', en: 'No account', values: { id: 'ai@gmail.com' } },
        { key: 'google', vi: 'Tài khoản Google', en: 'Google account', values: { id: FAKE.minh.email } },
        { key: 'unconfirmed', vi: 'Chưa xác nhận', en: 'Not confirmed', values: { id: '0905 111 222' } },
        { key: 'tooMany', vi: 'Thử quá nhiều', en: 'Too many', values: { id: lan.email, tooMany: '1' } },
        { key: 'ok', vi: 'Gửi được', en: 'Sent', values: { id: lan.email } },
      ]
    case 'reset':
      return [
        { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
        { key: 'short', vi: 'abc12', en: 'abc12', values: { password: 'abc12' } },
        { key: 'letters', vi: 'abcdefgh', en: 'abcdefgh', values: { password: 'abcdefgh' } },
        { key: 'ok', vi: 'abcdef12', en: 'abcdef12', values: { password: 'abcdef12' } },
      ]
    case 'expired':
      if (type === 'email_change') return []
      if (type === 'recovery')
        return [
          { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
          { key: 'none', vi: 'Không có tài khoản', en: 'No account', values: { id: 'ai@gmail.com' } },
          { key: 'ok', vi: 'Gửi được', en: 'Sent', values: { id: '0912 345 678' } },
        ]
      return [
        { key: 'empty', vi: 'Để trống', en: 'Empty', values: {} },
        { key: 'confirmed', vi: 'Đã xác nhận', en: 'Already confirmed', values: { id: lan.email } },
        { key: 'none', vi: 'Không có tài khoản', en: 'No account', values: { id: 'huy.cu@gmail.com' } },
        { key: 'ok', vi: 'Gửi lại được', en: 'Sent', values: { id: '0905 111 222' } },
      ]
    case 'profile': {
      const base = STARTS[profile]
      const list: Case[] = [
        { key: 'empty', vi: 'Thiếu tên và tòa', en: 'No name or building', values: { ...base, name: '', building: '' } },
        { key: 'long', vi: 'Tên 81 ký tự', en: 'Name of 81 characters', values: { ...base, name: 'L'.repeat(81), building: 'b-etown' } },
        {
          key: 'phoneTaken',
          vi: 'SĐT đã có',
          en: 'Phone taken',
          values: { ...base, name: 'Lan', phone: '0977 222 333', building: 'b-etown' },
        },
        {
          key: 'phoneWaiting',
          vi: 'SĐT đang chờ xác nhận',
          en: 'Phone waiting',
          values: { ...base, name: 'Lan', phone: '0905 111 222', building: 'b-etown' },
        },
      ]
      if (profile !== 'google')
        list.push(
          {
            key: 'shop',
            vi: 'Email của shop',
            en: 'Shop email',
            values: { ...base, name: 'Lan', email: SHOP_EMAILS[0], building: 'b-etown' },
          },
          {
            key: 'waiting',
            vi: 'Email đang chờ',
            en: 'Waiting email',
            values: { ...base, name: 'Lan', email: OTHER_PENDING[0], building: 'b-etown' },
          },
          {
            key: 'taken',
            vi: 'Email đã có',
            en: 'Email taken',
            values: { ...base, name: 'Lan', email: FAKE.minh.email, building: 'b-etown' },
          },
          {
            key: 'newEmail',
            vi: 'Đổi email',
            en: 'New email',
            values: { ...base, name: 'Trần Thị Lan', email: 'lan3@gmail.com', building: 'b-etown' },
          },
        )
      list.push({
        key: 'ok',
        vi: 'Lưu được',
        en: 'Saves',
        values: { ...base, name: base.name || 'Trần Thị Lan', building: base.building || 'b-etown' },
      })
      return list
    }
  }
}
