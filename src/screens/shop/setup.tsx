'use client'

// Form parts of the shop's setup screens, S-S1 and S-S2, with the tokens and components of the
// banana-leaf design (UI15): a field's message is chili text right under it with a chili ring,
// and it disappears as soon as the field is edited, as on the account forms (CN-76).
import type { ReactNode } from 'react'
import { cx } from '@/components/ui'
import type { SetupError } from '@/domain/dishes'
import type { Messages } from '@/domain/i18n'

const control = (error: boolean) =>
  cx(
    'min-h-11 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1 outline-none',
    error ? 'ring-2 ring-chili' : 'ring-steel focus:ring-2 focus:ring-leaf',
  )

export function FieldError({ id, m, error }: { id: string; m: Messages; error?: SetupError }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} className="text-[13px] font-medium text-chili">
      {m.shopSetup.field[error]}
    </p>
  )
}

export function SetupField({
  id,
  label,
  value,
  onChange,
  error,
  m,
  numeric = false,
  hint,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: SetupError
  m: Messages
  /** An amount or a count: a number keyboard on a phone, dots and spaces allowed (CN-80, CN-81). */
  numeric?: boolean
  hint?: string
  className?: string
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={numeric ? 'numeric' : 'text'}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={control(!!error)}
      />
      <FieldError id={id} m={m} error={error} />
      {hint && !error && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

export function Check({
  id,
  label,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cx('flex min-h-11 items-center gap-3 text-[15px] font-semibold', disabled && 'text-muted')}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 accent-leaf"
        />
        {label}
      </label>
      {children}
    </div>
  )
}

/** Field errors that disappear once their field is edited (CN-76). */
export function withoutEdited<K extends string>(
  errors: Partial<Record<K, SetupError>>,
  edited: Set<string>,
): Partial<Record<K, SetupError>> {
  const out: Partial<Record<K, SetupError>> = {}
  for (const [k, v] of Object.entries(errors) as [K, SetupError][]) if (!edited.has(k)) out[k] = v
  return out
}
