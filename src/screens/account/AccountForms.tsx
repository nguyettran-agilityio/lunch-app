'use client'

// The account screens of the real app in direction A "Leaf parcel" (UI17, design.md): one
// leaf-parcel card with Sign in / Sign up tabs; a field's message is chili text right under it
// with a chili ring; a message about the whole action is a Notice at the top of the card.
// "Continue with Google" is on both tabs since M1-3; "Forgot password?" on Sign in, the
// Forgot password page (S-C1a) and the reset page since M1-4 (B58, CN-73, CN-74).
import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Notice, cx } from '@/components/ui'
import type { FieldError, GoogleRefusal, NoticeCode } from '@/domain/account'
import { messages } from '@/domain/i18n'
import type { Lang } from '@/domain/types'
import {
  forgotPasswordAction,
  resetPasswordAction,
  sendConfirmationAction,
  sendGoogleConfirmationAction,
  sendNewLinkAction,
  sendResetAgainAction,
  signInAction,
  signUpAction,
  startGoogleAction,
  type ResetFormState,
} from '@/server/actions/auth'
import type { FormState, Notice as NoticeState, SendAgain as SendAgainState } from '@/server/auth/accounts'

const IDLE: FormState = { status: 'idle' }

const control = (error: boolean) =>
  cx(
    'min-h-12 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1 outline-none',
    error ? 'ring-2 ring-chili' : 'ring-steel focus:ring-2 focus:ring-leaf',
  )

const withNext = (path: string, next: string | null) => (next ? `${path}?next=${encodeURIComponent(next)}` : path)

function Card({
  lang,
  tab,
  next,
  title,
  intro,
  children,
}: {
  lang: Lang
  tab?: 'signIn' | 'signUp'
  next?: string | null
  title: string
  intro?: string
  children: ReactNode
}) {
  const m = messages[lang].auth
  return (
    <div className="mx-auto w-full max-w-md">
      <section className="parcel overflow-hidden bg-card ring-1 ring-steel/70">
        {tab && (
          // The tabs keep the page to return to (CN-69).
          <nav aria-label={`${m.signIn} / ${m.signUp}`} className="grid grid-cols-2 border-b border-steel">
            {(['signIn', 'signUp'] as const).map((t) => (
              <Link
                key={t}
                href={withNext(t === 'signIn' ? '/sign-in' : '/sign-up', next ?? null)}
                aria-current={tab === t ? 'page' : undefined}
                className={cx(
                  'flex min-h-12 items-center justify-center text-[15px] font-semibold',
                  tab === t ? 'border-b-4 border-leaf text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {t === 'signIn' ? m.signIn : m.signUp}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <header>
            <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-tight">{title}</h1>
            {intro && <p className="mt-1.5 text-[15px] text-muted">{intro}</p>}
          </header>
          {children}
        </div>
      </section>
    </div>
  )
}

type FieldProps = {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: FieldError
  lang: Lang
  type?: string
  inputMode?: 'tel' | 'email' | 'text'
  autoComplete?: string
  hint?: string
  extra?: ReactNode
}

function Field({ name, label, value, onChange, error, lang, type = 'text', inputMode, autoComplete, hint, extra }: FieldProps) {
  const id = `field-${name}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={control(!!error)}
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-chili">
          {messages[lang].auth.field[error]}
        </p>
      )}
      {hint && !error && <p className="text-[13px] text-muted">{hint}</p>}
      {extra}
    </div>
  )
}

function Submit({ children, pending }: { children: ReactNode; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 rounded-xl bg-leaf px-4 text-[16px] font-semibold text-on-leaf hover:bg-leaf-dark disabled:opacity-60"
    >
      {children}
    </button>
  )
}

/** A Notice about the whole action (role="alert"), with its follow-up when it has one. */
function ActionNotice({ lang, notice, signInLink = true }: { lang: Lang; notice: NoticeState; signInLink?: boolean }) {
  const m = messages[lang].auth
  const leaf = notice.code === 'alreadyConfirmed'
  return (
    <div role="alert">
      <Notice tone={leaf ? 'leaf' : 'chili'}>
        {m.notice[notice.code]}
        {leaf && signInLink && (
          <>
            {' '}
            <Link href="/sign-in" className="font-semibold text-leaf underline underline-offset-2">
              {m.signIn}
            </Link>
          </>
        )}
      </Notice>
      {notice.code === 'notConfirmed' && notice.identifier && (
        <div className="mt-2">
          <SendAgainButton lang={lang} start={{ identifier: notice.identifier, wait: notice.wait ?? 0 }} label={m.sendConfirmationAgain} />
        </div>
      )}
    </div>
  )
}

/** Seconds left, counting down once a second. */
function useCountdown(start: number): [number, (n: number) => void] {
  const [left, setLeft] = useState(start)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return [left, setLeft]
}

/**
 * A button that sends an account email to the account of `identifier`; disabled with
 * "Send again in N s" while the 60-second wait of that address runs (CN-67, CN-68).
 */
export function SendAgainButton({
  lang,
  start,
  label,
  action,
  onNotice,
  onSent,
}: {
  lang: Lang
  start: SendAgainState
  label: string
  /** What the button sends; by default the confirmation link of `start.identifier`. */
  action?: () => Promise<FormState>
  /** Takes a refusal instead of showing it under the button, when it returns true. */
  onNotice?: (n: NoticeState) => boolean
  /** Told when the button has sent, or the wait still runs. */
  onSent?: () => void
}) {
  const m = messages[lang].auth
  const [left, setLeft] = useCountdown(start.wait)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [pending, run] = useTransition()
  const send = () =>
    run(async () => {
      const r = await (action ? action() : sendConfirmationAction(start.identifier))
      if (r.status === 'sent' || r.status === 'wait') {
        setNotice(null)
        setLeft(r.sendAgain.wait)
        onSent?.()
      } else if (r.status === 'error' && r.notice) {
        if (!onNotice?.(r.notice)) setNotice(r.notice)
      }
    })
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending || left > 0}
        onClick={send}
        className="min-h-11 self-start rounded-xl px-3 text-[15px] font-semibold text-leaf ring-1 ring-leaf hover:bg-leaf-soft disabled:text-muted disabled:ring-steel"
      >
        {left > 0 ? m.sendAgainIn(left) : label}
      </button>
      {notice && (
        <p role="alert" className="text-[13px] font-medium text-chili">
          {m.notice[notice.code]}
        </p>
      )}
    </div>
  )
}

function SentCard({ lang, sendAgain }: { lang: Lang; sendAgain: SendAgainState }) {
  const m = messages[lang].auth
  return (
    <Card lang={lang} title={m.sentTitle}>
      <p role="status" className="text-[15px]">
        {m.sentBody}
      </p>
      <SendAgainButton lang={lang} start={sendAgain} label={m.sendAgain} />
    </Card>
  )
}

const fieldsOf = (s: FormState) => (s.status === 'error' ? s.fields : {})

/** A Google sign-in that came back without signing in, as the page found it in its URL. */
export type GoogleState = { code: GoogleRefusal; wait: number }

/**
 * "or" and "Continue with Google" (B58, design.md), with the message of a Google sign-in that
 * came back without signing in right under the button (CN-72). After an AC91 refusal the
 * button "Send the confirmation link again" sends to the email the callback kept; once that is
 * gone, the message and the button give way to "Could not sign in with Google…" (AC134).
 */
function GoogleSection({ lang, tab, next, google }: { lang: Lang; tab: 'signIn' | 'signUp'; next: string | null; google?: GoogleState }) {
  const m = messages[lang].auth
  const [code, setCode] = useState<NoticeCode | null>(google?.code ?? null)
  const [button, setButton] = useState(google?.code === 'googleNotConfirmed')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-steel" />
        {m.or}
        <span className="h-px flex-1 bg-steel" />
      </div>
      <form
        action={async (fd) => {
          window.location.assign(await startGoogleAction(fd))
        }}
        data-google
      >
        <input type="hidden" name="tab" value={tab} />
        {next && <input type="hidden" name="next" value={next} />}
        <GoogleButton label={m.continueWithGoogle} />
      </form>
      {code && (
        <div id="google-notice" role="alert" className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-chili">{m.notice[code]}</p>
          {button && (
            <SendAgainButton
              lang={lang}
              start={{ identifier: '', wait: google?.wait ?? 0 }}
              label={m.sendConfirmationAgain}
              action={sendGoogleConfirmationAction}
              // The sentence of the case replaces the message and the button: the kept email
              // gone (AC134), already confirmed or no account (AC137), now a Google account
              // (AC139). "Too many attempts" replaces only the message; the button stays (CN-72),
              // and so does "Could not send the email" (CN-74, AC156).
              onNotice={(n) => {
                setCode(n.code)
                setButton(n.code === 'tooMany' || n.code === 'sendFailed')
                return true
              }}
              // A send after "Too many attempts" brings the AC91 message back, with the
              // countdown (CN-72, AC141).
              onSent={() => setCode('googleNotConfirmed')}
            />
          )}
        </div>
      )}
    </div>
  )
}

function GoogleButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-xl bg-card px-4 text-[16px] font-semibold text-ink ring-1 ring-steel hover:bg-leaf-soft disabled:opacity-60"
    >
      {label}
    </button>
  )
}

export function SignInForm({ lang, next, google }: { lang: Lang; next: string | null; google?: GoogleState }) {
  const m = messages[lang].auth
  const [state, action, pending] = useActionState(signInAction, IDLE)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const fields = fieldsOf(state)
  return (
    <Card lang={lang} tab="signIn" next={next} title={m.signInTitle}>
      {state.status === 'error' && state.notice && <ActionNotice key={JSON.stringify(state.notice)} lang={lang} notice={state.notice} />}
      <form action={action} noValidate className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field
          name="identifier"
          label={m.identifier}
          value={identifier}
          onChange={setIdentifier}
          error={fields.identifier}
          lang={lang}
          autoComplete="username"
        />
        <Field
          name="password"
          label={m.password}
          value={password}
          onChange={setPassword}
          error={fields.password}
          lang={lang}
          type="password"
          autoComplete="current-password"
        />
        <Submit pending={pending}>{m.signIn}</Submit>
      </form>
      <GoogleSection lang={lang} tab="signIn" next={next} google={google} />
      {/* Plain /forgot-password: the page to return to is not carried (CN-73, AC152). */}
      <Link href="/forgot-password" className="min-h-10 self-start font-semibold text-leaf underline underline-offset-2">
        {m.forgotPasswordLink}
      </Link>
    </Card>
  )
}

export function SignUpForm({ lang, next, google }: { lang: Lang; next: string | null; google?: GoogleState }) {
  const m = messages[lang].auth
  const [state, action, pending] = useActionState(signUpAction, IDLE)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  if (state.status === 'sent') return <SentCard lang={lang} sendAgain={state.sendAgain} />
  const fields = fieldsOf(state)
  const phoneSendAgain = state.status === 'error' ? state.sendAgain?.phone : undefined
  return (
    <Card lang={lang} tab="signUp" next={next} title={m.signUpTitle} intro={m.signUpIntro}>
      {state.status === 'error' && state.notice && <ActionNotice lang={lang} notice={state.notice} />}
      <form action={action} noValidate className="flex flex-col gap-4">
        <Field
          name="phone"
          label={m.phone}
          value={phone}
          onChange={setPhone}
          error={fields.phone}
          lang={lang}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          extra={
            phoneSendAgain && (
              <SendAgainButton key={JSON.stringify(phoneSendAgain)} lang={lang} start={phoneSendAgain} label={m.sendAgain} />
            )
          }
        />
        <Field
          name="email"
          label={m.email}
          value={email}
          onChange={setEmail}
          error={fields.email}
          lang={lang}
          type="email"
          inputMode="email"
          autoComplete="email"
        />
        <Field
          name="password"
          label={m.password}
          value={password}
          onChange={setPassword}
          error={fields.password}
          lang={lang}
          type="password"
          autoComplete="new-password"
          hint={m.passwordHint}
        />
        <Submit pending={pending}>{m.signUp}</Submit>
      </form>
      <GoogleSection lang={lang} tab="signUp" next={next} google={google} />
    </Card>
  )
}

/**
 * /auth/expired?type=signup: asks for the phone number or email and sends a new link (CN-61,
 * CN-64). Someone signed in gets the same form, but no "Sign in" link: the "already
 * confirmed" notice has none and the link under the card goes to the home page (CN-70).
 */
export function ExpiredSignUpForm({ lang, signedIn, home = '/' }: { lang: Lang; signedIn: boolean; home?: string }) {
  const m = messages[lang].auth
  const [state, action, pending] = useActionState(sendNewLinkAction, IDLE)
  const [identifier, setIdentifier] = useState('')
  // The wait belongs to the address it was answered for: typing another one ends it (CN-68).
  const [editedAfter, setEditedAfter] = useState<FormState | null>(null)
  if (state.status === 'sent') return <SentCard lang={lang} sendAgain={state.sendAgain} />
  const fields = fieldsOf(state)
  const waiting = state.status === 'wait' && editedAfter !== state
  return (
    <Card lang={lang} title={m.expiredTitle} intro={m.expiredIntro}>
      {state.status === 'error' && state.notice && <ActionNotice lang={lang} notice={state.notice} signInLink={!signedIn} />}
      <form action={action} noValidate className="flex flex-col gap-4">
        <Field
          name="identifier"
          label={m.identifier}
          value={identifier}
          onChange={(v) => {
            setIdentifier(v)
            setEditedAfter(state)
          }}
          error={fields.identifier}
          lang={lang}
          autoComplete="username"
        />
        {waiting && state.status === 'wait' ? (
          <WaitSubmit key={state.sendAgain.wait} lang={lang} wait={state.sendAgain.wait} pending={pending} />
        ) : (
          <Submit pending={pending}>{m.sendNewLink}</Submit>
        )}
      </form>
      <Link href={signedIn ? home : '/sign-in'} className="min-h-10 self-start font-semibold text-leaf underline underline-offset-2">
        {signedIn ? m.toHome : m.signIn}
      </Link>
    </Card>
  )
}

/** The main button disabled with the seconds left of the wait, then it sends (CN-68, AC117). */
function WaitSubmit({ lang, wait, pending, label }: { lang: Lang; wait: number; pending: boolean; label?: string }) {
  const m = messages[lang].auth
  const [left] = useCountdown(wait)
  return <Submit pending={pending || left > 0}>{left > 0 ? m.sendAgainIn(left) : (label ?? m.sendNewLink)}</Submit>
}

/**
 * The link under the card of the Forgot password and expired reset pages, and of their sent
 * card (CN-74, AC155, AC157): plain "Sign in" for someone not signed in (CN-73, AC152), "Go to
 * the home page" for someone signed in, `/shop` for the shop.
 */
function UnderCardLink({ lang, signedIn, home }: { lang: Lang; signedIn: boolean; home: string }) {
  const m = messages[lang].auth
  return (
    <Link href={signedIn ? home : '/sign-in'} className="min-h-10 self-start font-semibold text-leaf underline underline-offset-2">
      {signedIn ? m.toHome : m.signIn}
    </Link>
  )
}

/**
 * S-C1a at /forgot-password, and the expired page of a reset link (`expired`), which asks the
 * same and answers the same (BR-29a, CN-61, CN-73, AC148). Open to everyone, also signed in
 * (AC144). Once sent, "The reset link is sent" with "Send again"; while the 60 seconds of that
 * address run, the main button counts down (AC113).
 */
export function ForgotPasswordForm({
  lang,
  signedIn,
  home = '/',
  expired = false,
}: {
  lang: Lang
  signedIn: boolean
  home?: string
  expired?: boolean
}) {
  const m = messages[lang].auth
  const [state, action, pending] = useActionState(forgotPasswordAction, IDLE)
  const [identifier, setIdentifier] = useState('')
  // The wait belongs to the address it was answered for: typing another one ends it (CN-68).
  const [editedAfter, setEditedAfter] = useState<FormState | null>(null)
  const label = expired ? m.sendNewLink : m.sendResetLink
  if (state.status === 'sent') {
    const again = state.sendAgain
    return (
      <Card lang={lang} title={m.resetSentTitle}>
        <p role="status" className="text-[15px]">
          {m.resetSentBody}
        </p>
        <SendAgainButton lang={lang} start={again} label={m.sendAgain} action={() => sendResetAgainAction(again.identifier)} />
        <UnderCardLink lang={lang} signedIn={signedIn} home={home} />
      </Card>
    )
  }
  const fields = fieldsOf(state)
  return (
    <Card lang={lang} title={expired ? m.expiredTitle : m.forgotTitle} intro={expired ? m.expiredIntro : m.forgotIntro}>
      {state.status === 'error' && state.notice && (
        <ActionNotice key={JSON.stringify(state.notice)} lang={lang} notice={state.notice} signInLink={!signedIn} />
      )}
      <form action={action} noValidate className="flex flex-col gap-4">
        <Field
          name="identifier"
          label={m.identifier}
          value={identifier}
          onChange={(v) => {
            setIdentifier(v)
            setEditedAfter(state)
          }}
          error={fields.identifier}
          lang={lang}
          autoComplete="username"
        />
        {state.status === 'wait' && editedAfter !== state ? (
          <WaitSubmit key={state.sendAgain.wait} lang={lang} wait={state.sendAgain.wait} pending={pending} label={label} />
        ) : (
          <Submit pending={pending}>{label}</Submit>
        )}
      </form>
      <UnderCardLink lang={lang} signedIn={signedIn} home={home} />
    </Card>
  )
}

const RESET_IDLE: ResetFormState = { status: 'idle' }

/**
 * /auth/reset "Set a new password" (BR-29a, CN-64, CN-73): one field with the password rule as
 * its hint; a password equal to the old one is refused under it; "Too many attempts" is a
 * Notice at the top. Saving signs in here and signs out the other devices.
 */
export function ResetPasswordForm({ lang }: { lang: Lang }) {
  const m = messages[lang].auth
  const [state, action, pending] = useActionState(resetPasswordAction, RESET_IDLE)
  const [password, setPassword] = useState('')
  const fields = state.status === 'error' ? state.fields : {}
  return (
    <Card lang={lang} title={m.resetTitle} intro={m.resetIntro}>
      {state.status === 'error' && state.notice && <ActionNotice lang={lang} notice={state.notice} />}
      <form action={action} noValidate className="flex flex-col gap-4">
        <Field
          name="password"
          label={m.newPassword}
          value={password}
          onChange={setPassword}
          error={fields.password}
          lang={lang}
          type="password"
          autoComplete="new-password"
          hint={m.passwordHint}
        />
        <Submit pending={pending}>{m.saveNewPassword}</Submit>
      </form>
    </Card>
  )
}

/** /auth/expired for a link kind that the app does not send yet (email change, M1-5). */
export function ExpiredOther({ lang }: { lang: Lang }) {
  const m = messages[lang].auth
  return (
    <Card lang={lang} title={m.expiredTitle}>
      <Link href="/sign-in" className="min-h-10 self-start font-semibold text-leaf underline underline-offset-2">
        {m.signIn}
      </Link>
    </Card>
  )
}
