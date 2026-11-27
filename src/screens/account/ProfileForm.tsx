'use client'

// The profile, S-C2, in direction A "Leaf parcel" (design.md, UI17): "Complete your profile"
// while the profile is incomplete, "Profile" otherwise (BR-15, BR-29a, CN-64, CN-77, CN-78).
// One Save checks every field and saves nothing when one is refused; a field's message
// disappears as soon as the field is edited (CN-76). The Email field is prefilled with the new
// email waiting, the current one shown above it (AC191). The language field changes at once, as
// the VI/EN switch (AC182). The building picker is the prototype's, on a real provider: proposing
// creates the building at once (AC183).
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { Notice } from '@/components/ui'
import { messages, money } from '@/domain/i18n'
import { formatPhone } from '@/domain/phone'
import type { Building, Lang, State } from '@/domain/types'
import { setLangAction } from '@/server/actions/auth'
import { proposeBuildingAction, saveProfileAction, sendEmailChangeAction } from '@/server/actions/profile'
import type { ProfileState } from '@/server/auth/accounts'
import { ActionsContext, AppContext, type Actions, type ActionResult, type AppValue } from '@/screens/app'
import { BuildingPicker } from '@/screens/customer/BuildingPicker'
import { ActionNotice, Card, Field, SendAgainButton, Submit, answerId, useCountdown, useFieldErrors } from './AccountForms'

export type ProfileData = {
  name: string
  phone: string
  email: string
  pendingEmail: string | null
  method: 'password' | 'google'
  buildingId: string | null
}

const IDLE: ProfileState = { status: 'idle' }

const unsupported = (async (): Promise<ActionResult> => ({ ok: false, error: 'notFound' })) as never

/**
 * The real provider of the profile (plan.md section 1.2, B2): the State slice of `load.ts`, with
 * `proposeBuilding` as a Server Action; a proposed building joins the list at once.
 */
function ProfileProvider({ state, children }: { state: State; children: ReactNode }) {
  const [list, setList] = useState<Building[]>(state.buildings)
  const [pending, start] = useTransition()
  const app = useMemo<AppValue>(
    () => ({
      s: { ...state, buildings: list },
      m: messages[state.lang],
      money: (v) => money(v, state.lang),
      now: state.clock,
      shopDay: state.clock.today,
      drafts: {},
      href: (p) => p,
      route: (p) => p,
    }),
    [state, list],
  )
  const actions = useMemo<Actions & { pending: boolean }>(() => {
    // Only the building picker is on this page: the other actions are the prototype's for now.
    return {
      addToCart: unsupported,
      setCartQty: unsupported,
      placeOrder: unsupported,
      reportTransfer: unsupported,
      cancelOrder: unsupported,
      editOrder: unsupported,
      startEdit: unsupported,
      setDraft: unsupported,
      discardEdit: unsupported,
      addPlateToDraft: unsupported,
      setRefundTo: unsupported,
      confirmOrder: unsupported,
      confirmPayment: unsupported,
      reportNotReceived: unsupported,
      rejectOrder: unsupported,
      keepOrder: unsupported,
      startPreparing: unsupported,
      markDelivering: unsupported,
      markDelivered: unsupported,
      markRefunded: unsupported,
      giveCashBack: unsupported,
      seeRefundReminder: unsupported,
      addBuilding: unsupported,
      approveBuilding: unsupported,
      setDeliveryTime: unsupported,
      declineBuilding: unsupported,
      setShopDay: unsupported,
      setLang: unsupported,
      pending,
      proposeBuilding: (name: string, address: string) =>
        new Promise<ActionResult>((resolve) =>
          start(async () => {
            const r = await proposeBuildingAction(name, address)
            if (r.ok && r.id) {
              const id = r.id
              const typed = address.trim()
              // A new building joins the list; one reused gets the new address typed, if any (AC193).
              setList((l) =>
                l.some((b) => b.id === id)
                  ? l.map((b) => (b.id === id && typed ? { ...b, address: typed } : b))
                  : [...l, { id, name: name.trim(), address: typed, deliveryTime: null, past: [], state: 'pending', proposedBy: state.me }],
              )
            }
            resolve(r)
          }),
        ),
    }
  }, [pending, state.me])
  return (
    <AppContext.Provider value={app}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </AppContext.Provider>
  )
}

/**
 * The seconds left of the new email's wait, under the Email field (CN-78, AC185); every answer
 * of Save starts it again from the wait the server gave.
 */
function useWaitText(lang: Lang, answer: object, wait: number | undefined): string | undefined {
  const [left, setLeft] = useCountdown(wait ?? 0)
  const [of, setOf] = useState(answer)
  if (of !== answer) {
    setOf(answer)
    setLeft(wait ?? 0)
  }
  return wait && left > 0 ? messages[lang].auth.sendAgainIn(left) : undefined
}

export function ProfileForm({
  lang,
  state,
  profile,
  complete,
  declined,
  next,
  pendingWait,
  emailChanged,
}: {
  lang: Lang
  state: State
  profile: ProfileData
  complete: boolean
  /** The name of the default building the shop declined, if any (BR-16, AC82). */
  declined: string | null
  next: string | null
  /** The seconds left of the waiting new email's 60-second wait, when the page was rendered (CN-68). */
  pendingWait: number
  /** Back from an email-change link (CN-77, AC179). */
  emailChanged: boolean
}) {
  const m = messages[lang]
  const p = m.profile
  const [result, action, pending] = useActionState(saveProfileAction, IDLE)
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState(profile.phone ? formatPhone(profile.phone) : '')
  const [email, setEmail] = useState(profile.pendingEmail ?? profile.email)
  const [buildingId, setBuildingId] = useState(profile.buildingId ?? '')
  const [langPending, startLang] = useTransition()
  // "Your email was changed to …" shows only this once: the marker leaves the address bar at once,
  // so a reload or coming back does not show it again (CN-79, AC194).
  useEffect(() => {
    if (!emailChanged) return
    const url = new URL(window.location.href)
    url.searchParams.delete('emailChanged')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  }, [emailChanged])
  const [fields, edit, wasEdited] = useFieldErrors(result, result.status === 'error' ? result.fields : {}, pending)
  const emailWait = useWaitText(lang, result, result.status === 'error' && !wasEdited('email') ? result.emailWait : undefined)
  const google = profile.method === 'google'

  return (
    <ProfileProvider state={state}>
      <Card lang={lang} title={complete ? p.title : p.completeTitle} intro={complete ? undefined : p.completeIntro}>
        {declined && (
          <div role="alert">
            <Notice tone="chili">{p.declined(declined)}</Notice>
          </div>
        )}
        {result.status === 'saved' && (
          <div role="status">
            <Notice tone="leaf">{p.saved}</Notice>
          </div>
        )}
        {emailChanged && result.status === 'idle' && (
          <div role="status">
            <Notice tone="leaf">{p.emailChanged(profile.email)}</Notice>
          </div>
        )}
        {result.status === 'error' && result.notice && <ActionNotice key={answerId(result)} lang={lang} notice={result.notice} />}
        <form action={action} noValidate className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          <Field
            name="name"
            label={p.name}
            value={name}
            onChange={edit('name', setName)}
            error={fields.name}
            lang={lang}
            autoComplete="name"
          />
          <Field
            name="phone"
            label={m.auth.phone}
            value={phone}
            onChange={edit('phone', setPhone)}
            error={fields.phone}
            lang={lang}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
          <Field
            name="email"
            label={m.auth.email}
            value={google ? profile.email : email}
            onChange={edit('email', setEmail)}
            error={fields.email}
            errorText={emailWait}
            lang={lang}
            type="email"
            inputMode="email"
            autoComplete="email"
            readOnly={google}
            hint={google ? p.googleEmailNote : p.newEmailNote}
            sub={profile.pendingEmail ? <p className="text-[13px] text-muted">{p.currentEmail(profile.email)}</p> : undefined}
            extra={
              profile.pendingEmail && (
                <div className="flex flex-col gap-2">
                  <p className="text-[14px] font-medium text-turmeric-ink">{p.waiting(profile.pendingEmail)}</p>
                  <SendAgainButton
                    key={`${profile.pendingEmail}-${pendingWait}`}
                    lang={lang}
                    start={{ identifier: profile.pendingEmail, wait: pendingWait }}
                    label={m.auth.sendAgain}
                    action={sendEmailChangeAction}
                  />
                </div>
              )
            }
          />
          <BuildingPicker
            id="field-buildingId"
            name="buildingId"
            label={p.building}
            placeholder={p.pickBuilding}
            value={buildingId}
            onChange={edit('buildingId', setBuildingId)}
            error={fields.buildingId ? m.auth.field[fields.buildingId] : undefined}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
            {p.language}
            <select
              id="field-lang"
              value={lang}
              disabled={langPending}
              // At once, and saved to the account, as the VI/EN switch (BR-30, CN-77).
              onChange={(e) => {
                const l = e.target.value === 'en' ? 'en' : 'vi'
                startLang(() => setLangAction(l))
              }}
              className="min-h-12 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1 ring-steel"
            >
              <option value="vi">{p.langVi}</option>
              <option value="en">{p.langEn}</option>
            </select>
          </label>
          <Submit pending={pending}>{p.save}</Submit>
        </form>
      </Card>
    </ProfileProvider>
  )
}
