'use client'

// The M1-D design round page at /proto/accounts (UI16): pick a direction, a screen and a case,
// then try the mockup. The query (?dir=&screen=&type=&profile=) keeps each view linkable.
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { cx } from '@/components/ui'
import { useApp } from '@/screens/app'
import { type Dir, type ExpiredType, type ProfileCase, type Screen, casesOf, useFlow, useT } from './common'
import { DirectionA } from './DirectionA'
import { DirectionB } from './DirectionB'
import { DirectionC } from './DirectionC'
import { formOf } from './forms'
import { Undecided } from './frame'

const DIRS: Dir[] = ['a', 'b', 'c']
const SCREENS: Screen[] = ['signIn', 'signUp', 'forgot', 'reset', 'expired', 'profile']
const TYPES: ExpiredType[] = ['signup', 'recovery', 'email_change']
const PROFILES: ProfileCase[] = ['new', 'google', 'pending', 'declined']

const pick = <T extends string>(v: string | null, all: readonly T[]): T => (all.includes(v as T) ? (v as T) : all[0])

export function AccountsDesign() {
  const params = useSearchParams()
  const router = useRouter()
  const { href } = useApp()
  const { f } = useT()
  const [round, setRound] = useState(0)
  const dir = pick(params.get('dir'), DIRS)
  const screen = pick(params.get('screen'), SCREENS)
  const type = pick(params.get('type'), TYPES)
  const profile = pick(params.get('profile'), PROFILES)

  const go = (change: Partial<{ dir: Dir; screen: Screen; type: ExpiredType; profile: ProfileCase }>) => {
    const next = { dir, screen, type, profile, ...change }
    const q = new URLSearchParams({ dir: next.dir, screen: next.screen })
    if (next.screen === 'expired') q.set('type', next.type)
    if (next.screen === 'profile') q.set('profile', next.profile)
    router.replace(`${href('/accounts')}?${q}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={f.title} className="rounded-2xl border-2 border-dashed border-steel bg-tray/60 p-4">
        <h2 className="font-display text-[20px] font-extrabold tracking-tight">{f.title}</h2>
        <p className="mt-1 text-sm text-muted">{f.intro}</p>
        <div className="mt-3 flex flex-col gap-3">
          <Switcher label={f.dir} value={dir} options={DIRS.map((d) => [d, f.dirs[d]])} onPick={(d) => go({ dir: d })} />
          <Switcher label={f.screen} value={screen} options={SCREENS.map((s) => [s, f.screens[s]])} onPick={(s) => go({ screen: s })} />
          {screen === 'expired' && (
            <Switcher label={f.linkType} value={type} options={TYPES.map((x) => [x, f.types[x]])} onPick={(x) => go({ type: x })} />
          )}
          {screen === 'profile' && (
            <Switcher
              label={f.account}
              value={profile}
              options={PROFILES.map((x) => [x, f.profiles[x]])}
              onPick={(x) => go({ profile: x })}
            />
          )}
        </div>
      </section>

      {/* A new screen, link type, case or "Start over" starts a fresh flow; a new direction keeps it, to compare. */}
      <Mockup
        key={`${screen}-${type}-${profile}-${round}`}
        dir={dir}
        screen={screen}
        type={type}
        profile={profile}
        go={(s) => go({ screen: s })}
        startOver={() => setRound(round + 1)}
      />
    </div>
  )
}

function Mockup({
  dir,
  screen,
  type,
  profile,
  go,
  startOver,
}: {
  dir: Dir
  screen: Screen
  type: ExpiredType
  profile: ProfileCase
  go: (s: Screen) => void
  startOver: () => void
}) {
  const { t, f, lang } = useT()
  const flow = useFlow(screen, { type, profile })
  const form = formOf(screen, type, profile, t, f)
  const cases = casesOf(screen, type, profile)
  const Direction = { a: DirectionA, b: DirectionB, c: DirectionC }[dir]

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-steel p-3">
        <p className="text-sm font-semibold text-muted">{f.cases}</p>
        {/* The email field holds the current email; whether typing it cancels the waiting one is B5. */}
        {screen === 'profile' && profile === 'pending' && <Undecided ids="B5" />}
        <div className="flex flex-wrap gap-1.5">
          {cases.map((c) => (
            <Chip key={c.key} onClick={() => (c.google ? flow.google(c.google) : flow.submit(c.values))}>
              {lang === 'en' ? c.en : c.vi}
            </Chip>
          ))}
          <Chip onClick={startOver} quiet>
            {f.startOver}
          </Chip>
        </div>
      </div>
      <div data-testid="mockup" data-dir={dir}>
        <Direction key={dir} flow={flow} form={form} go={go} profile={profile} />
      </div>
    </>
  )
}

function Switcher<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: T
  options: [T, string][]
  onPick: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-full text-sm font-semibold text-muted sm:w-24">{label}</span>
      {options.map(([v, text]) => (
        <Chip key={v} pressed={v === value} onClick={() => onPick(v)}>
          {text}
        </Chip>
      ))}
    </div>
  )
}

function Chip({ children, onClick, pressed, quiet }: { children: ReactNode; onClick: () => void; pressed?: boolean; quiet?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'min-h-9 rounded-full px-3 text-sm font-semibold',
        pressed ? 'bg-ink text-on-ink' : quiet ? 'text-leaf underline' : 'bg-card text-ink ring-1 ring-steel hover:ring-leaf',
      )}
    >
      {children}
    </button>
  )
}
