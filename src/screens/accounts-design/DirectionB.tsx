'use client'

// Direction B "Big leaf band" (UI16): a tall banana-leaf panel with the title and a drawing, the form
// straight on the paper; two columns on a computer. A field's error is a chili-soft label with an
// icon under it, and a summary box at the top of the form lists the fields, each a link to its field.
import { DishArt } from '@/components/art'
import { cx } from '@/components/ui'
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
  cx('min-h-13 w-full rounded-xl bg-card px-4 text-[16px] text-ink ring-1', error ? 'ring-2 ring-chili' : 'ring-steel focus:ring-leaf')

function Err({ field, text }: { field: Field; text: string }) {
  return (
    <p
      id={errorId(field)}
      className="inline-flex items-start gap-1.5 self-start rounded-lg bg-chili-soft px-2.5 py-1 text-[13px] font-semibold text-chili"
    >
      <span
        aria-hidden
        className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-chili text-[11px] leading-none font-extrabold text-on-chili"
      >
        !
      </span>
      {text}
    </p>
  )
}

function Input({ field, label, value, onChange, error, extra, type, inputMode, autoComplete, readOnly, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId(field)} className="text-[15px] font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
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
    </div>
  )
}

export function DirectionB({ flow, form, go, profile }: { flow: Flow; form: Form; go: (s: Screen) => void; profile: ProfileCase }) {
  const { t } = useT()
  const fields = form.steps.flat()
  const labels: Partial<Record<Field, string>> = Object.fromEntries(fields.map((s) => [s.field, s.label]))
  labels.building = t.building
  const errs = Object.entries(flow.errors) as [Field, string][]

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
      <header className="leaf-band relative flex min-h-56 flex-col justify-between overflow-hidden rounded-[2rem] p-6 md:min-h-[30rem] md:p-8">
        <div className="relative z-10 max-w-sm">
          <h1 className="font-display text-[34px] leading-[1.05] font-extrabold tracking-tight md:text-[44px]">
            {flow.sent ? flow.sent.title : form.title}
          </h1>
          {!flow.sent && form.intro && <p className="mt-3 text-[15px] text-white/80">{form.intro}</p>}
        </div>
        <DishArt dishId="d-thitkho" meal className="pointer-events-none absolute -right-6 -bottom-8 w-44 opacity-95 md:w-64" />
      </header>

      <div className="flex flex-col gap-5 md:pt-4">
        {profile === 'declined' && flow.screen === 'profile' && (
          <p role="alert" className="rounded-xl bg-chili-soft p-4 text-[15px] font-semibold text-chili">
            {t.declined(DECLINED_BUILDING)}
          </p>
        )}
        {errs.length > 0 && (
          <div role="alert" className="rounded-xl bg-card p-4 ring-2 ring-chili">
            <p className="font-semibold text-chili">{t.checkFields(errs.length)}</p>
            <ul className="mt-2 flex flex-col gap-1 text-[15px]">
              {errs.map(([field, text]) => (
                <li key={field}>
                  <a
                    href={`#${fieldId(field)}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(fieldId(field))?.focus()
                    }}
                    className="underline underline-offset-2"
                  >
                    {labels[field]}: {text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {flow.action && (
          <div role="alert" className={cx('rounded-xl p-4 text-[15px]', flow.action.tone === 'chili' ? 'bg-chili-soft' : 'bg-leaf-soft')}>
            <p className={cx('font-semibold', flow.action.tone === 'chili' ? 'text-chili' : 'text-leaf-dark')}>{flow.action.text}</p>
            <ActionThen flow={flow} go={go} />
          </div>
        )}

        {flow.sent ? (
          <div className="flex flex-col gap-3">
            <p className="max-w-prose text-[17px]">{flow.sent.body}</p>
            <SendAgain flow={flow} />
          </div>
        ) : (
          <form
            noValidate
            className="flex max-w-lg flex-col gap-5"
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
                      <div className="flex flex-wrap items-center gap-x-3 rounded-lg bg-turmeric-soft px-3 py-2 text-[14px] font-medium text-turmeric-ink">
                        {t.waitingFor(flow.waitingEmail)}
                        <SendAgain flow={flow} />
                      </div>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="submit" className="min-h-13 rounded-full bg-leaf px-7 text-[16px] font-bold text-on-leaf hover:bg-leaf-dark">
                  {form.button}
                </button>
                {form.google && <GoogleButton flow={flow} className="sm:flex-1" />}
              </div>
            )}
          </form>
        )}
        <FlowNotes flow={flow} />
        {form.links.length > 0 && (
          <ul className="flex flex-col gap-1 text-[15px]">
            {form.links.map((l) => (
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
    </div>
  )
}
