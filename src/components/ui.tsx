'use client'

import Link from 'next/link'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { owed, paymentState, refundState, reportedTotal } from '@/proto/logic'
import type { Order, Status } from '@/proto/types'
import { useApp } from '@/proto/useApp'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-leaf text-white hover:bg-leaf-dark disabled:bg-steel disabled:text-muted',
  secondary: 'bg-card text-ink ring-1 ring-steel hover:ring-leaf disabled:text-muted disabled:ring-steel',
  danger: 'bg-card text-chili ring-1 ring-chili/40 hover:bg-chili-soft disabled:text-muted disabled:ring-steel',
  ghost: 'text-leaf hover:bg-leaf-soft disabled:text-muted',
}

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed'

export function Button({ variant = 'primary', className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={cx(base, variants[variant], className)} {...props} />
}

export function LinkButton({ variant = 'primary', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...props} />
}

/** Two-step button for actions that cannot be undone (reject, cancel, decline). */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  disabled,
  variant = 'danger',
  children,
}: {
  label: string
  question: string
  onConfirm: () => void
  disabled?: boolean
  variant?: Variant
  /** Extra detail shown with the question, e.g. what the action will change. */
  children?: ReactNode
}) {
  const { m } = useApp()
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  return (
    <div role="alertdialog" aria-label={question} className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-chili-soft p-3">
      <p className="w-full text-sm text-ink">{question}</p>
      {children}
      <Button
        variant="danger"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {label}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        {m.detail.discard}
      </Button>
    </div>
  )
}

type Tone = 'leaf' | 'chili' | 'turmeric' | 'steel' | 'ink'

const tones: Record<Tone, string> = {
  leaf: 'bg-leaf-soft text-leaf-dark',
  chili: 'bg-chili-soft text-chili',
  turmeric: 'bg-turmeric-soft text-[#7a5104]',
  steel: 'bg-tray text-muted',
  ink: 'bg-ink text-white',
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>
}

const statusTone: Record<Status, Tone> = {
  placed: 'turmeric',
  confirmed: 'leaf',
  preparing: 'ink',
  delivering: 'ink',
  delivered: 'steel',
  rejected: 'chili',
  cancelled: 'chili',
}

export function StatusBadge({ status }: { status: Status }) {
  const { m } = useApp()
  return <Badge tone={statusTone[status]}>{m.status[status]}</Badge>
}

/** Status, payment and refund state, kept separate (D18, D19). */
export function OrderBadges({ order }: { order: Order }) {
  const { m, money } = useApp()
  const active = order.status !== 'rejected' && order.status !== 'cancelled'
  const pay = paymentState(order)
  const refund = refundState(order)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={order.status} />
      {active && (
        <Badge tone={pay === 'paid' ? 'leaf' : pay === 'reported' ? 'turmeric' : 'chili'}>
          {m.payment[pay]}
          {/* Reported shows the amount reported; the rest is shown in the order (CN-37, CN-42). */}
          {pay === 'reported' ? ` · ${money(reportedTotal(order))}` : pay !== 'paid' && ` · ${money(owed(order))}`}
        </Badge>
      )}
      {/* A report still open on a Paid, Cancelled or Rejected order is shown next to it (CN-39, CN-47). */}
      {(!active || pay === 'paid') && reportedTotal(order) > 0 && (
        <Badge tone="turmeric">
          {m.payment.reported} · {money(reportedTotal(order))}
        </Badge>
      )}
      {refund !== 'none' && <Badge tone={refund === 'refunded' ? 'steel' : 'chili'}>{m.refund[refund]}</Badge>}
    </div>
  )
}

export function QtyStepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const { m } = useApp()
  return (
    <div className="inline-flex items-center rounded-lg ring-1 ring-steel">
      <button
        type="button"
        aria-label={m.common.qtyMinus}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="size-11 text-xl font-semibold text-leaf disabled:text-steel"
      >
        −
      </button>
      <span className="w-8 text-center font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={m.common.qtyPlus}
        onClick={() => onChange(value + 1)}
        className="size-11 text-xl font-semibold text-leaf"
      >
        +
      </button>
    </div>
  )
}

export function PageTitle({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1.5 text-[15px] text-muted">{intro}</p>}
      </div>
      {children}
    </header>
  )
}

export function Notice({ tone = 'turmeric', children }: { tone?: 'turmeric' | 'chili' | 'leaf'; children: ReactNode }) {
  const style = {
    turmeric: 'border-turmeric bg-turmeric-soft',
    chili: 'border-chili bg-chili-soft',
    leaf: 'border-leaf bg-leaf-soft',
  }[tone]
  return <p className={cx('rounded-r-lg border-l-4 px-4 py-3 text-[15px]', style)}>{children}</p>
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl bg-card p-4 ring-1 ring-steel/70 sm:p-5', className)}>{children}</section>
}

export function Select({ label, className, children, ...props }: ComponentProps<'select'> & { label: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-sm font-medium text-muted', className)}>
      {label}
      <select className="min-h-11 w-full rounded-lg bg-card px-3 text-[15px] text-ink ring-1 ring-steel" {...props}>
        {children}
      </select>
    </label>
  )
}

export function TextInput({ label, className, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-sm font-medium text-muted', className)}>
      {label}
      <input className="min-h-11 w-full rounded-lg bg-card px-3 text-[15px] text-ink ring-1 ring-steel" {...props} />
    </label>
  )
}

export { cx }
