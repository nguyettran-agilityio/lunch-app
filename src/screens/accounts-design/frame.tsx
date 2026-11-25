'use client'

// Parts every direction of the M1-D mockups shares (UI16): the mockup notes, the fake Google
// account picker, the "Send again" button with its 60-second wait and the building field.
import { useState, type ReactNode } from 'react'
import { cx } from '@/components/ui'
import { hhmm } from '@/domain/time'
import { useActions, useApp } from '@/screens/app'
import { FAKE, NEW_GOOGLE, OTHER_PENDING, type Field, type Flow, type ProfileCase, useT } from './common'

/** A note about the mockup itself (what the real app does next, or what is not decided yet). */
export function MockNote({ children }: { children: ReactNode }) {
  const { f } = useT()
  return (
    <p role="status" className="rounded-xl border-2 border-dashed border-steel px-4 py-3 text-[15px] text-muted">
      <span className="mr-2 rounded bg-tray px-1.5 py-0.5 text-xs font-bold text-ink">{f.mockup}</span>
      {children}
    </p>
  )
}

/** A part of a screen the spec has not decided yet: not drawn (UI16). */
export function Undecided({ ids, note }: { ids: string; note?: string }) {
  const { f } = useT()
  return (
    <>
      {note && <MockNote>{note}</MockNote>}
      <MockNote>{f.undecided(ids)}</MockNote>
    </>
  )
}

/** The notes of a flow, shown the same way in every direction. */
export function FlowNotes({ flow }: { flow: Flow }) {
  return (
    <>
      {flow.next && <MockNote>{flow.next}</MockNote>}
      {flow.undecided && <MockNote>{flow.undecided}</MockNote>}
    </>
  )
}

export function GoogleButton({ flow, className }: { flow: Flow; className?: string }) {
  const { t, f } = useT()
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <button
        type="button"
        aria-expanded={flow.googleOpen}
        onClick={() => flow.setGoogleOpen(!flow.googleOpen)}
        className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-card px-4 text-[15px] font-semibold text-ink ring-1 ring-steel hover:ring-leaf"
      >
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-tray font-display text-sm font-extrabold">
          G
        </span>
        {t.google}
      </button>
      {flow.googleOpen && (
        <div className="rounded-xl border-2 border-dashed border-steel p-3 text-sm">
          <p className="mb-2 text-muted">
            <span className="mr-2 rounded bg-tray px-1.5 py-0.5 text-xs font-bold text-ink">{f.mockup}</span>
            {f.googlePick}
          </p>
          <ul className="flex flex-col gap-1">
            {[FAKE.minh.email, NEW_GOOGLE.email, FAKE.lan.email, FAKE.huy.email, OTHER_PENDING[0]].map((e) => (
              <li key={e}>
                <button
                  type="button"
                  onClick={() => flow.google(e)}
                  className="min-h-10 w-full rounded-lg px-3 text-left font-medium hover:bg-tray"
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** "Send again", disabled for 60 seconds after each email (BR-29a). */
export function SendAgain({ flow, className }: { flow: Flow; className?: string }) {
  const { t, f } = useT()
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <button
        type="button"
        disabled={flow.cooldown > 0}
        onClick={flow.sendAgain}
        className="min-h-10 rounded-lg font-semibold text-leaf underline underline-offset-2 disabled:text-muted disabled:no-underline"
      >
        {flow.cooldown > 0 ? t.sendAgainIn(flow.cooldown) : t.sendAgain}
      </button>
      {flow.cooldown > 0 && (
        <button type="button" onClick={flow.skipWait} className="text-xs text-muted underline">
          {f.mockup}: {f.skipWait}
        </button>
      )}
    </span>
  )
}

/** The button that goes with a message about the whole action. */
export function ActionThen({ flow, go }: { flow: Flow; go: (screen: 'signIn') => void }) {
  const { t } = useT()
  if (flow.action?.then === 'sendConfirm')
    return (
      <button type="button" onClick={flow.sendConfirm} className="min-h-10 font-semibold text-ink underline underline-offset-2">
        {t.sendConfirm}
      </button>
    )
  if (flow.action?.then === 'signIn')
    return (
      <button type="button" onClick={() => go('signIn')} className="min-h-10 font-semibold text-ink underline underline-offset-2">
        {t.signIn}
      </button>
    )
  return null
}

/** Props of a direction's own text field, so the field and its error look like that direction. */
export type FieldProps = {
  field: Field
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  /** Shown with the error, e.g. "Send again" (AC83). */
  extra?: ReactNode
  type?: string
  inputMode?: 'tel' | 'email' | 'text'
  autoComplete?: string
  readOnly?: boolean
  hint?: string
}

/** The ids every direction gives its fields, so the error summary of B can jump to them. */
export const fieldId = (field: Field) => `acc-${field}`
export const errorId = (field: Field) => `acc-${field}-error`

/** Approved buildings, plus the ones proposed in this mockup (BR-16; name required, address optional, CN-64). */
export function useBuildings() {
  const { s, m } = useApp()
  const [mine, setMine] = useState<{ id: string; name: string }[]>([])
  const options = [
    ...s.buildings
      .filter((b) => b.state === 'approved')
      .map((b) => ({ id: b.id, label: b.deliveryTime !== null ? `${b.name} · ${hhmm(b.deliveryTime)}` : b.name, pending: false })),
    ...mine.map((b) => ({ id: b.id, label: `${b.name} (${m.cart.pending})`, pending: true })),
  ]
  const propose = (name: string) => {
    const id = `mock-${mine.length + 1}`
    setMine([...mine, { id, name: name.trim() }])
    return id
  }
  return { options, propose }
}

/** The building part of the profile; `Input` and `Err` are the direction's own. */
export function BuildingField({
  flow,
  Input,
  selectClass,
  Err,
}: {
  flow: Flow
  Input: (p: FieldProps) => ReactNode
  selectClass: (error: boolean) => string
  Err: (p: { field: Field; text: string }) => ReactNode
}) {
  const { t } = useT()
  const { m } = useApp()
  const { options, propose } = useBuildings()
  const [proposing, setProposing] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const error = flow.errors.building
  const current = options.find((o) => o.id === flow.values.building)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId('building')} className="text-sm font-medium text-muted">
        {t.building}
      </label>
      <select
        id={fieldId('building')}
        value={flow.values.building ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId('building') : undefined}
        onChange={(e) => flow.set('building', e.target.value)}
        className={selectClass(!!error)}
      >
        <option value="">{t.pickBuilding}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <Err field="building" text={error} />}
      {current?.pending && <p className="text-sm text-turmeric-ink">{m.cart.proposeNote}</p>}
      {proposing ? (
        <div className="flex flex-col gap-3 rounded-xl bg-tray p-3">
          <Input
            field="propName"
            label={m.cart.proposeName}
            value={name}
            onChange={(v) => {
              setName(v)
              setNameError(undefined)
            }}
            error={nameError}
          />
          <Input field="propAddress" label={m.cart.proposeAddress} value={address} onChange={setAddress} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!name.trim()) return setNameError(t.required)
                flow.set('building', propose(name))
                setProposing(false)
                setName('')
                setAddress('')
              }}
              className="min-h-11 rounded-xl bg-card px-4 text-[15px] font-semibold ring-1 ring-steel hover:ring-leaf"
            >
              {m.cart.proposeSave}
            </button>
            <button type="button" onClick={() => setProposing(false)} className="min-h-11 rounded-xl px-4 font-semibold text-leaf">
              {m.detail.discard}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setProposing(true)} className="self-start text-sm font-semibold text-leaf underline">
          {m.cart.propose}
        </button>
      )}
    </div>
  )
}

/** The language of the account (BR-30); in the mockup it switches the prototype's language. */
export function LanguageField({ selectClass, profile }: { selectClass: string; profile: ProfileCase }) {
  const { t, f } = useT()
  const { s } = useApp()
  const { setLang } = useActions()
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 text-sm font-medium text-muted">
        {t.language}
        <select value={s.lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en')} className={selectClass}>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
      {/* Which language a new account starts with is open point C1 of plan.md. */}
      {(profile === 'new' || profile === 'google') && <Undecided ids={f.langNew} />}
    </div>
  )
}

/** The declined-building notice text (BR-16, AC82). */
export const DECLINED_BUILDING = 'Tòa ABC'
