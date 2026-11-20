'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { messages, money as formatMoney } from '@/proto/i18n'
import { refundList, refundReminder, seeRefundReminder } from '@/proto/logic'
import { clearError, resetData, update, useLastError, useProto } from '@/proto/store'
import { hhmm, parseHhmm } from '@/proto/time'
import type { Lang } from '@/proto/types'
import { cx } from './ui'

export function AppShell({ children }: { children: ReactNode }) {
  const s = useProto()
  const pathname = usePathname()

  useEffect(() => {
    if (!s) return
    document.documentElement.lang = s.lang
    document.title = `${messages[s.lang].appName} — ${messages[s.lang].demo.label}`
  }, [s])

  if (!s) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted" aria-busy="true">
        Cơm Lá
      </div>
    )
  }

  const shop = pathname.startsWith('/shop')
  const m = messages[s.lang]
  // Refunds still to send, over all days, so the shop sees them from any screen (CN-35).
  const openRefunds = refundList(s).filter((x) => x.refund.refundedAt === null).length
  const reminder = refundReminder(s)
  const money = (v: number) => formatMoney(v, s.lang)
  const cartCount = Object.values(s.carts).reduce((n, lines) => n + lines.reduce((k, l) => k + l.qty, 0), 0)

  const customerNav = [
    { href: '/', label: m.nav.week, match: (p: string) => p === '/' || p.startsWith('/day') || p.startsWith('/plate') },
    { href: '/cart', label: m.nav.cart, badge: cartCount, match: (p: string) => p.startsWith('/cart') },
    { href: '/orders', label: m.nav.orders, match: (p: string) => p.startsWith('/order') || p.startsWith('/pay') },
  ]
  const shopNav = [
    { href: '/shop', label: m.nav.shopOrders, match: (p: string) => p === '/shop' || p.startsWith('/shop/order') },
    { href: '/shop/review', label: m.nav.review, match: (p: string) => p.startsWith('/shop/review') },
    { href: '/shop/prep', label: m.nav.prep, match: (p: string) => p.startsWith('/shop/prep') },
    { href: '/shop/delivery', label: m.nav.delivery, match: (p: string) => p.startsWith('/shop/delivery') },
    { href: '/shop/refunds', label: m.nav.refunds, badge: openRefunds, match: (p: string) => p.startsWith('/shop/refunds') },
    { href: '/shop/buildings', label: m.nav.buildings, match: (p: string) => p.startsWith('/shop/buildings') },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBar shop={shop} />
      <header className="border-b border-steel bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={shop ? '/shop' : '/'} className="flex items-baseline gap-2">
            <Leaf />
            <span className="text-xl font-bold tracking-tight text-leaf">{m.appName}</span>
            <span className="hidden text-sm text-muted sm:inline">{shop ? m.demo.shop : m.tagline}</span>
          </Link>
          {!shop && (
            <nav aria-label={m.common.mainNav} className="hidden gap-1 md:flex">
              {customerNav.map((item) => (
                <NavLink key={item.href} {...item} active={item.match(pathname)} />
              ))}
            </nav>
          )}
          <LangSwitch lang={s.lang} />
        </div>
        {shop && (
          <nav aria-label={m.common.shopNav} className="mx-auto grid max-w-6xl grid-cols-3 gap-1 px-4 pb-3 sm:flex sm:flex-wrap">
            {shopNav.map((item) => (
              <NavLink key={item.href} {...item} active={item.match(pathname)} />
            ))}
          </nav>
        )}
      </header>

      <main className={cx('mx-auto w-full max-w-6xl flex-1 px-4 pt-6', shop ? 'pb-16' : 'pb-28 md:pb-16')}>
        {shop && reminder && (
          // Hourly reminder of refunds not made, on every shop screen (CN-53).
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-chili px-4 py-3 text-white">
            <Link href="/shop/refunds" className="font-bold underline underline-offset-2">
              {m.refunds.reminder(reminder.orders, money(reminder.total))} · {m.refunds.reminderOpen}
            </Link>
            <button
              type="button"
              onClick={() => update(seeRefundReminder)}
              className="min-h-10 rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
            >
              {m.refunds.reminderSeen}
            </button>
          </div>
        )}
        {children}
      </main>

      {!shop && (
        <nav
          aria-label={m.common.mainNav}
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-steel bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {customerNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.match(pathname) ? 'page' : undefined}
              className={cx(
                'flex min-h-14 flex-col items-center justify-center text-[13px] font-semibold',
                item.match(pathname) ? 'text-leaf' : 'text-muted',
              )}
            >
              <span className={cx('mb-1 h-1 w-8 rounded-full', item.match(pathname) ? 'bg-leaf' : 'bg-transparent')} />
              <span>
                {item.label}
                {item.badge ? <span className="ml-1 rounded-full bg-chili px-1.5 text-[11px] text-white">{item.badge}</span> : null}
              </span>
            </Link>
          ))}
        </nav>
      )}
      <ErrorToast />
    </div>
  )
}

function NavLink({ href, label, active, badge }: { href: string; label: string; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-10 items-center justify-center rounded-lg px-3 text-center text-[14px] font-semibold',
        active ? 'bg-leaf text-white' : 'text-ink hover:bg-leaf-soft',
      )}
    >
      {label}
      {badge ? <span className="ml-1.5 rounded-full bg-chili px-1.5 text-[11px] text-white">{badge}</span> : null}
    </Link>
  )
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div role="group" aria-label={messages[lang].common.language} className="flex rounded-lg p-0.5 ring-1 ring-steel">
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => update((s) => ({ ...s, lang: l }))}
          className={cx('min-h-9 min-w-10 rounded-md text-sm font-bold uppercase', lang === l ? 'bg-ink text-white' : 'text-muted')}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** Prototype-only controls (decision P4): switch role, set the fake time, reset the data. */
function DemoBar({ shop }: { shop: boolean }) {
  const s = useProto()!
  const m = messages[s.lang]
  const router = useRouter()
  const [askReset, setAskReset] = useState(false)
  const setMinutes = (v: number) => update((st) => ({ ...st, clock: { ...st.clock, minutes: Math.max(0, Math.min(23 * 60 + 59, v)) } }))
  const step = 'min-h-8 rounded-md bg-white/10 px-2 text-sm font-semibold hover:bg-white/20'

  return (
    <div className="bg-[repeating-linear-gradient(135deg,#1d2420_0_14px,#232c27_14px_28px)] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:gap-x-4">
        <span className="rounded bg-turmeric px-1.5 py-0.5 text-xs font-bold text-ink">{m.demo.label}</span>
        <div role="group" aria-label={m.common.role} className="flex rounded-md bg-white/10 p-0.5">
          {[
            { label: m.demo.customer, href: '/', on: !shop },
            { label: m.demo.shop, href: '/shop', on: shop },
          ].map((r) => (
            <button
              key={r.href}
              type="button"
              aria-pressed={r.on}
              onClick={() => router.push(r.href)}
              className={cx('min-h-8 rounded px-3 font-semibold', r.on ? 'bg-white text-ink' : 'text-white/80')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="demo-time" className="text-white/80 max-sm:sr-only">
            {m.demo.time}
          </label>
          <button type="button" className={step} onClick={() => setMinutes(s.clock.minutes - 30)}>
            −30′
          </button>
          <input
            id="demo-time"
            type="time"
            value={hhmm(s.clock.minutes)}
            onChange={(e) => {
              const v = parseHhmm(e.target.value)
              if (v !== null) setMinutes(v)
            }}
            className="min-h-8 rounded-md bg-white px-1.5 font-semibold text-ink"
          />
          <button type="button" className={step} onClick={() => setMinutes(s.clock.minutes + 30)}>
            +30′
          </button>
        </div>
        <div className="flex items-center gap-1.5 sm:ml-auto">
          {askReset ? (
            <>
              <span className="text-white/80">{m.demo.resetConfirm}</span>
              <button
                type="button"
                className={cx(step, 'bg-chili hover:bg-chili')}
                onClick={() => {
                  setAskReset(false)
                  resetData()
                }}
              >
                {m.demo.reset}
              </button>
              <button type="button" className={step} onClick={() => setAskReset(false)}>
                {m.detail.discard}
              </button>
            </>
          ) : (
            <button type="button" className={step} onClick={() => setAskReset(true)}>
              {m.demo.reset}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorToast() {
  const err = useLastError()
  const s = useProto()!
  useEffect(() => {
    if (!err) return
    const t = setTimeout(clearError, 6000)
    return () => clearTimeout(t)
  }, [err])
  if (!err) return null
  const m = messages[s.lang]
  return (
    <div role="alert" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-chili p-4 text-white shadow-lg md:bottom-6">
      <p className="flex-1 text-[15px] font-medium">{m.errors[err.code]}</p>
      <button type="button" onClick={clearError} className="text-sm font-semibold underline">
        {m.common.close}
      </button>
    </div>
  )
}

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 self-center text-leaf">
      <path fill="currentColor" d="M20 3C10 3 4 8.5 4 15c0 2 .6 3.7 1.6 5L4 21.6 5.4 23 7 21.4C8.3 22.4 10 23 12 23c6.5 0 9-7 9-14 0-2-.3-4-1-6Z" opacity=".9" />
      <path fill="#fff" d="M7.5 19.5 17 8l-.9-.7L6.6 18.8z" />
    </svg>
  )
}
