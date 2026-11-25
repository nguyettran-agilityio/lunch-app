'use client'

// Direction A "Leaf parcel" (UI16): one leaf-parcel card under the band, with Sign in / Sign up tabs.
// A field's error is chili text right under it, with a chili border; a message about the whole
// action is a Notice at the top of the card.
import { Notice, cx } from '@/components/ui'
import { type Field, type Flow, type ProfileCase, type Screen, useT } from './common'
import type { Form } from './forms'
import {
  ActionThen,
  BuildingField,
  DECLINED_BUILDING,
  FlowNotes,
  GoogleButton,
  LanguageField,
  SendAgain,
  Undecided,
  errorId,
  fieldId,
  type FieldProps,
} from './frame'

const control = (error: boolean) =>
  cx('min-h-12 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1', error ? 'ring-2 ring-chili' : 'ring-steel focus:ring-leaf')

function Err({ field, text }: { field: Field; text: string }) {
  return (
    <p id={errorId(field)} className="text-[13px] font-medium text-chili">
      {text}
    </p>
  )
}

function Input({ field, label, value, onChange, error, extra, type, inputMode, autoComplete, readOnly, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId(field)} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={fieldId(field)}
        type={type ?? 'text'}
        inputMode={inputMode}
        autoComplete={autoComplete}
        readOnly={readOnly}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId(field) : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx(control(!!error), readOnly && 'bg-tray text-muted')}
      />
      {error && <Err field={field} text={error} />}
      {extra}
      {hint && !error && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

export function DirectionA({ flow, form, go, profile }: { flow: Flow; form: Form; go: (s: Screen) => void; profile: ProfileCase }) {
  const { t } = useT()
  const tabs = flow.screen === 'signIn' || flow.screen === 'signUp'
  const fields = form.steps.flat()

  return (
    <div className="mx-auto w-full max-w-md">
      <section className="parcel overflow-hidden bg-card ring-1 ring-steel/70">
        {tabs && (
          <div role="tablist" aria-label={t.signIn} className="grid grid-cols-2 border-b border-steel">
            {(['signIn', 'signUp'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={flow.screen === s}
                onClick={() => go(s)}
                className={cx(
                  'min-h-12 text-[15px] font-semibold',
                  flow.screen === s ? 'border-b-4 border-leaf text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {s === 'signIn' ? t.signIn : t.signUp}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <header>
            <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-tight">
              {flow.sent ? flow.sent.title : form.title}
            </h1>
            {!flow.sent && form.intro && <p className="mt-1.5 text-[15px] text-muted">{form.intro}</p>}
          </header>

          {profile === 'declined' && flow.screen === 'profile' && <Notice tone="chili">{t.declined(DECLINED_BUILDING)}</Notice>}
          {flow.action && (
            <div role="alert">
              <Notice tone={flow.action.tone}>
                {flow.action.text}
                {flow.action.then && (
                  <span className="mt-1 block">
                    <ActionThen flow={flow} go={go} />
                  </span>
                )}
              </Notice>
            </div>
          )}

          {flow.sent ? (
            <>
              <p className="text-[15px]">{flow.sent.body}</p>
              <SendAgain flow={flow} />
            </>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                flow.submit()
              }}
            >
              {form.undecided && <Undecided ids={form.undecided} note={form.note} />}
              {fields.map((s) => (
                <Input
                  key={s.field}
                  {...s}
                  value={flow.values[s.field] ?? ''}
                  onChange={(v) => flow.set(s.field, v)}
                  error={flow.errors[s.field]}
                  extra={
                    <>
                      {flow.fieldSendAgain === s.field && <SendAgain flow={flow} />}
                      {s.field === 'email' && flow.waitingEmail && (
                        <p className="text-[13px] font-medium text-turmeric-ink">
                          {t.waitingFor(flow.waitingEmail)} <SendAgain flow={flow} />
                        </p>
                      )}
                    </>
                  }
                />
              ))}
              {form.profile && (
                <>
                  <BuildingField flow={flow} Input={Input} selectClass={control} Err={Err} />
                  <LanguageField selectClass={control(false)} profile={profile} />
                </>
              )}
              {!form.undecided && (
                <button
                  type="submit"
                  className="min-h-12 rounded-xl bg-leaf px-4 text-[16px] font-semibold text-on-leaf hover:bg-leaf-dark"
                >
                  {form.button}
                </button>
              )}
              {form.google && (
                <>
                  <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-steel after:h-px after:flex-1 after:bg-steel">
                    {t.or}
                  </p>
                  <GoogleButton flow={flow} />
                </>
              )}
            </form>
          )}
          <FlowNotes flow={flow} />
          {form.links.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
              {form.links
                .filter((l) => !tabs || l.screen === 'forgot')
                .map((l) => (
                  <li key={l.screen}>
                    {l.before && <span className="mr-1 text-muted">{l.before}</span>}
                    <button
                      type="button"
                      onClick={() => go(l.screen)}
                      className="min-h-10 font-semibold text-leaf underline underline-offset-2"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
