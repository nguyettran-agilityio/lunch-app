'use client'

// The shell of the real app (plan.md sections 1.1 and 5, B23): the banana-leaf band without
// the demo bar, the VI/EN switch, "Sign out" in the header menu when signed in (CN-64), and
// a footer link to the prototype until the end of M5. The menus show only the screens that
// are real in this milestone: none yet in M1-2. `<html lang>` follows the language here, on
// the client as under /proto, because the root layout cannot read the cookie (B23).
import Link from 'next/link'
import { useEffect, useTransition, type ReactNode } from 'react'
import { messages } from '@/domain/i18n'
import type { Lang } from '@/domain/types'
import { setLangAction, signOutAction } from '@/server/actions/auth'
import { cx } from './ui'

export function RealShell({ lang, signedIn, home = '/', children }: { lang: Lang; signedIn: boolean; home?: string; children: ReactNode }) {
  const m = messages[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = m.appName
  }, [lang, m.appName])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="leaf-band">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5">
          <Link href={home} className="flex min-w-0 items-center gap-2">
            <span className="font-display text-[26px] leading-none font-extrabold tracking-tight">{m.appName}</span>
            <span className="hidden self-end pb-0.5 text-sm text-white/75 sm:inline">{m.tagline}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LangSwitch lang={lang} />
            {signedIn && <AccountMenu lang={lang} />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16">{children}</main>
      <footer className="border-t border-steel">
        <div className="mx-auto max-w-6xl px-4 py-4 text-[15px]">
          <Link href="/proto" className="font-semibold text-leaf underline underline-offset-2">
            {m.real.openPrototype}
          </Link>
        </div>
      </footer>
    </div>
  )
}

function LangSwitch({ lang }: { lang: Lang }) {
  const [pending, start] = useTransition()
  return (
    <div role="group" aria-label={messages[lang].common.language} className="flex rounded-full p-0.5 ring-1 ring-white/35">
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          disabled={pending}
          onClick={() => start(() => setLangAction(l))}
          className={cx(
            'min-h-9 min-w-10 rounded-full text-sm font-bold uppercase',
            lang === l ? 'bg-[#f4f8f1] text-[#1d4a29]' : 'text-white/80',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** The header menu (CN-64): a disclosure with "Sign out". */
function AccountMenu({ lang }: { lang: Lang }) {
  const m = messages[lang].real
  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold text-white/90 ring-1 ring-white/35 hover:bg-white/10">
        {m.accountMenu}
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-40 rounded-xl bg-card p-1.5 text-ink shadow-lg ring-1 ring-steel">
        <form action={signOutAction}>
          <button type="submit" className="min-h-11 w-full rounded-lg px-3 text-left text-[15px] font-semibold hover:bg-tray">
            {m.signOut}
          </button>
        </form>
      </div>
    </details>
  )
}
