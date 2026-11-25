'use client'

// Direction C "Step by step" (UI16): one question per step, with progress dots. A field's error is
// under the field; a message about the whole action (for example "Wrong password", or "You have not
// confirmed your email" with its button) sits in a box right above the main button.
import { useState } from 'react'
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
  cx(
    'min-h-14 w-full rounded-2xl bg-card px-4 text-[18px] text-ink ring-1',
    error ? 'ring-2 ring-chili' : 'ring-steel focus:ring-2 focus:ring-leaf',
  )

function Err({ field, text }: { field: Field; text: string }) {
  return (
    <p id={errorId(field)} className="text-[14px] font-semibold text-chili">
      {text}
    </p>
  )
}

function Input({ field, label, value, onChange, error, extra, type, inputMode, autoComplete, readOnly, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId(field)} className="font-display text-[22px] leading-tight font-bold tracking-tight">
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
      {hint && !error && <p className="text-[14px] text-muted">{hint}</p>}
    </div>
  )
}

export function DirectionC({ flow, form, go, profile }: { flow: Flow; form: Form; go: (s: Screen) => void; profile: ProfileCase }) {
  const { t } = useT()
  // The profile asks the building and the language in a last step of its own.
  const steps = form.profile ? [...form.steps, []] : form.steps
  const count = steps.length
  const [step, setStep] = useState(0)
  const [seen, setSeen] = useState(flow.tries.n)
  // After each try, show the first step with an error; with none, the last step of a form try
  // (where its message is), or the same step for Google. A new screen remounts this (page key).
  if (seen !== flow.tries.n) {
    setSeen(flow.tries.n)
    const first = steps.findIndex((g) => g.some((s) => flow.errors[s.field]) || (g.length === 0 && !!flow.errors.building))
    setStep(first >= 0 ? first : flow.tries.via === 'google' ? step : count - 1)
  }
  const last = step >= count - 1

  const group = steps[step] ?? []

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      {count > 1 && !flow.sent && (
        <ol aria-label={t.step(step + 1, count)} className="flex items-center gap-2">
          {steps.map((_, i) => (
            <li
              key={i}
              aria-current={i === step ? 'step' : undefined}
              className={cx(
                'h-2.5 rounded-full transition-all',
                i === step ? 'w-8 bg-leaf' : i < step ? 'w-2.5 bg-leaf' : 'w-2.5 bg-steel',
              )}
            />
          ))}
          <span className="ml-2 text-sm text-muted">{t.step(step + 1, count)}</span>
        </ol>
      )}
      <header>
        <h1 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-tight">{flow.sent ? flow.sent.title : form.title}</h1>
        {!flow.sent && form.intro && step === 0 && <p className="mt-2 text-[15px] text-muted">{form.intro}</p>}
      </header>
      {profile === 'declined' && flow.screen === 'profile' && <Notice tone="chili">{t.declined(DECLINED_BUILDING)}</Notice>}
      {/* The new email waiting stays in sight on the steps without the email field. */}
      {flow.waitingEmail && !group.some((s) => s.field === 'email') && (
        <p className="text-[14px] font-medium text-turmeric-ink">
          {t.waitingFor(flow.waitingEmail)} <SendAgain flow={flow} />
        </p>
      )}

      {flow.sent ? (
        <>
          <p className="text-[17px]">{flow.sent.body}</p>
          <SendAgain flow={flow} />
        </>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (last) flow.submit()
            else if (flow.check(group.map((s) => s.field))) setStep(step + 1)
          }}
        >
          {form.undecided && <Undecided ids={form.undecided} note={form.note} />}
          {group.map((s) => (
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
                    <p className="text-[14px] font-medium text-turmeric-ink">
                      {t.waitingFor(flow.waitingEmail)} <SendAgain flow={flow} />
                    </p>
                  )}
                </>
              }
            />
          ))}
          {form.profile && last && (
            <>
              <BuildingField flow={flow} Input={Input} selectClass={control} Err={Err} />
              <LanguageField selectClass={control(false)} profile={profile} />
            </>
          )}

          {flow.action && (
            <div
              role="alert"
              className={cx(
                'rounded-2xl border-2 p-4 text-[15px]',
                flow.action.tone === 'chili' ? 'border-chili bg-chili-soft' : 'border-leaf bg-leaf-soft',
              )}
            >
              <p className="font-semibold">{flow.action.text}</p>
              <ActionThen flow={flow} go={go} />
            </div>
          )}
          {!form.undecided && (
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="min-h-14 rounded-2xl px-5 font-semibold text-leaf ring-1 ring-steel"
                >
                  {t.back}
                </button>
              )}
              <button
                type="submit"
                className="min-h-14 flex-1 rounded-2xl bg-leaf px-4 text-[17px] font-bold text-on-leaf hover:bg-leaf-dark"
              >
                {last ? form.button : t.next}
              </button>
            </div>
          )}
          {form.google && step === 0 && <GoogleButton flow={flow} />}
        </form>
      )}
      <FlowNotes flow={flow} />
      {form.links.length > 0 && step === 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
          {form.links.map((l) => (
            <li key={l.screen}>
              {l.before && <span className="mr-1 text-muted">{l.before}</span>}
              <button type="button" onClick={() => go(l.screen)} className="min-h-10 font-semibold text-leaf underline underline-offset-2">
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
