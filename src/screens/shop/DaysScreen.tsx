'use client'

// The shop's Days screen, S-S3 (BR-2, BR-3, BR-4, CN-61, CN-62, CN-83), built with the components of
// the banana-leaf design (UI15): seven cards, today and the next 6 days, each with its menu and its
// cutoff; tapping a card opens that day's form inside the page: the dishes being sold and the dishes
// already on the menu in one A–Z list, with the ticks each dish allows and the notes of the dishes
// changed on the Dishes screen, the day's own cutoff (empty = the default) and one Save.
import { useState, useTransition } from 'react'
import { Badge, Button, Notice, PageTitle, cx } from '@/components/ui'
import {
  dayCutoff,
  dayDishes,
  dayNotes,
  dishCount,
  formatCutoff,
  pastCutoff,
  type DayErrors,
  type DayNote,
  type DayRow,
  type MenuKind,
} from '@/domain/days'
import { messages, type Messages } from '@/domain/i18n'
import { weekday } from '@/domain/time'
import type { Clock, DateStr, Dish, Lang } from '@/domain/types'
import { saveDayAction } from '@/server/actions/shop'
import { Check, SetupField } from './setup'

const emptyDay = (date: DateStr): DayRow => ({ date, cutoff: null, lockedCutoff: null, closed: false, menu: [] })

/** "Thứ sáu 27/11", "Thursday 3/12": the day and month without a leading zero (AC223). */
export const dayCardLabel = (m: Messages, date: DateStr) =>
  m.shopSetup.dayLabel(m.weekdaysLong[weekday(date)], `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`)
const label = dayCardLabel

export function DaysScreen({
  lang,
  clock,
  week,
  days,
  dishes,
  defaultCutoff,
}: {
  lang: Lang
  clock: Clock
  week: DateStr[]
  days: DayRow[]
  dishes: Dish[]
  defaultCutoff: number
}) {
  const m = messages[lang]
  const s = m.shopSetup
  const [open, setOpen] = useState<DateStr | null>(null)
  const [passed, setPassed] = useState(false)
  const byDate = new Map(days.map((d) => [d.date, d]))

  return (
    <div className="max-w-3xl">
      <PageTitle title={s.daysTitle} intro={s.daysIntro} />
      {passed && (
        <div role="alert" className="mb-4">
          <Notice tone="chili">{s.field.dayPassed}</Notice>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {week.map((date) => {
          const day = byDate.get(date) ?? emptyDay(date)
          const cutoff = dayCutoff(day, defaultCutoff)
          const past = pastCutoff(clock, date, cutoff)
          const count = dishCount(day.menu)
          const name = label(m, date)
          const isOpen = open === date
          return (
            <li key={date} data-day-card={date} className="parcel bg-card ring-1 ring-steel/70">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    <span data-day-label>{name}</span>
                    {date === clock.today && <Badge tone="leaf">{s.today}</Badge>}
                    {past && <Badge tone="steel">{s.pastCutoff}</Badge>}
                  </h2>
                  <p className="text-[15px] text-muted">
                    <span data-day-menu>{count === 0 ? s.noMenuYet : s.dishCount(count)}</span>
                    {' · '}
                    <span data-day-cutoff>
                      {day.cutoff === null ? s.cutoffDefault(formatCutoff(cutoff)) : s.cutoffOwn(formatCutoff(cutoff))}
                    </span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setPassed(false)
                    setOpen(isOpen ? null : date)
                  }}
                >
                  {isOpen ? s.closeDay : s.openDay(name)}
                </Button>
              </div>
              {isOpen && (
                <DayForm
                  key={date}
                  m={m}
                  clock={clock}
                  day={day}
                  dishes={dishes}
                  defaultCutoff={defaultCutoff}
                  onPassed={() => {
                    setOpen(null)
                    setPassed(true)
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function DayForm({
  m,
  clock,
  day,
  dishes,
  defaultCutoff,
  onPassed,
}: {
  m: Messages
  clock: Clock
  day: DayRow
  dishes: Dish[]
  defaultCutoff: number
  onPassed: () => void
}) {
  const s = m.shopSetup
  const date = day.date
  const has = (kind: MenuKind) => new Set(day.menu.filter((r) => r.kind === kind).map((r) => r.dishId))
  const [fixed, setFixed] = useState<Set<string>>(() => has('fixed'))
  const [components, setComponents] = useState<Set<string>>(() => has('component'))
  const [cutoff, setCutoff] = useState(day.cutoff === null ? '' : formatCutoff(day.cutoff))
  const [errors, setErrors] = useState<DayErrors>({})
  const [lockedNow, setLockedNow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()
  const locked = lockedNow || pastCutoff(clock, date, dayCutoff(day, defaultCutoff))
  const list = dayDishes(dishes, day.menu)
  // The cutoff the day takes when its own is empty: the default kept once past it (CN-61), else the default.
  const fallback = day.lockedCutoff ?? defaultCutoff

  const changed = () => {
    setSaved(false)
    setAsking(false)
  }
  const tick = (set: (f: (x: Set<string>) => Set<string>) => void, id: string) => (on: boolean) => {
    set((x) => {
      const next = new Set(x)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    changed()
  }

  const save = (confirmed: boolean) =>
    start(async () => {
      const r = await saveDayAction({ date, fixed: [...fixed], components: [...components], cutoff, confirmed })
      if (r.ok) {
        setCutoff(r.day.cutoff === null ? '' : formatCutoff(r.day.cutoff))
        setErrors({})
        setAsking(false)
        setSaved(true)
        return
      }
      setSaved(false)
      if ('closesToday' in r) {
        // Nothing saved; what was typed stays (CN-83, AC228).
        setAsking(true)
        return
      }
      setAsking(false)
      if (r.fields.form === 'dayPassed') return onPassed()
      if (r.fields.cutoff === 'pastCutoff') {
        // Past the cutoff meanwhile: the field locks, back to the cutoff saved; the ticks stay as typed (AC235).
        setLockedNow(true)
        setCutoff(r.saved?.cutoff == null ? '' : formatCutoff(r.saved.cutoff))
      }
      setErrors(r.fields)
    })

  const noteText: Record<DayNote, string> = { notSold: s.noteNotSold, noFixed: s.noteNoFixed, noComponent: s.noteNoComponent }

  return (
    <div className="flex flex-col gap-5 border-t border-steel p-4 sm:p-6">
      {saved && (
        <div role="status">
          <Notice tone="leaf">{s.saved}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{s.dayDishes}</h3>
        {list.length === 0 && <p className="text-[15px] text-muted">{s.noDishesToSell}</p>}
        <ul className="flex flex-col gap-2">
          {list.map((d) => {
            const notes = dayNotes(d, day.menu)
            const showFixed = d.price !== null || has('fixed').has(d.id)
            const showComponent = d.groupId !== null || has('component').has(d.id)
            return (
              <li key={d.id} data-day-dish={d.name} className="flex flex-col gap-1 rounded-xl p-3 ring-1 ring-steel">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  <span className="min-w-0 break-words">{d.name}</span>
                  {notes.map((n) => (
                    <Badge key={n} tone="turmeric">
                      {noteText[n]}
                    </Badge>
                  ))}
                </p>
                <div className="flex flex-wrap gap-x-6">
                  {showFixed && (
                    <Check id={`day-${date}-${d.id}-fixed`} label={s.fixed} checked={fixed.has(d.id)} onChange={tick(setFixed, d.id)} />
                  )}
                  {showComponent && (
                    <Check
                      id={`day-${date}-${d.id}-component`}
                      label={s.component}
                      checked={components.has(d.id)}
                      onChange={tick(setComponents, d.id)}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <SetupField
        id="day-cutoff"
        label={s.dayCutoff}
        value={cutoff}
        onChange={(v) => {
          setCutoff(v)
          setErrors((e) => (e.cutoff ? { ...e, cutoff: undefined } : e))
          changed()
        }}
        // "Past the cutoff" is the locked field's own line below, also when the server refused it (AC235).
        error={errors.cutoff === 'pastCutoff' ? undefined : errors.cutoff}
        m={m}
        disabled={locked}
        hint={s.defaultHint(formatCutoff(fallback))}
        className="max-w-56"
      />
      {locked && (
        <p id="day-cutoff-locked" className={cx('-mt-3 text-[13px] font-medium', errors.cutoff ? 'text-chili' : 'text-muted')}>
          {s.cutoffLocked}
        </p>
      )}
      <Button onClick={() => save(false)} disabled={pending || asking} className="self-start">
        {s.save}
      </Button>
      {/* The question shows under Save (the M2-2 plan, AC228). */}
      {asking && (
        <div role="alert" className="flex flex-col gap-3">
          <Notice tone="turmeric">{s.closesToday}</Notice>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(true)} disabled={pending}>
              {s.saveAnyway}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {s.dontSave}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
