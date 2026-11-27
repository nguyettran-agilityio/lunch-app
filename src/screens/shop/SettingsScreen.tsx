'use client'

// The shop's Settings screen, S-S4 (BR-4, BR-19, CN-60, CN-61, CN-83), built with the components of
// the banana-leaf design (UI15): the default cutoff (its ":" added while digits are typed), the bank
// picked from the VietQR list in a field to type and pick, the account number and the account holder; one Save for the whole screen,
// which saves nothing when a field is refused (AC225). A Save that would close today for ordering at
// once first asks, with "Save anyway" and "Cancel" (AC228).
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button, Notice, PageTitle, cx } from '@/components/ui'
import { bankLabel, findBank, searchBanks } from '@/domain/banks'
import { formatCutoff, maskCutoff, type SettingsErrors, type SettingsField } from '@/domain/days'
import { messages } from '@/domain/i18n'
import type { Lang } from '@/domain/types'
import { saveSettingsAction } from '@/server/actions/shop'
import { FieldError, SetupField } from './setup'

export function SettingsScreen({
  lang,
  defaultCutoff,
  bankBin,
  account: savedAccount,
  holder: savedHolder,
}: {
  lang: Lang
  defaultCutoff: number
  bankBin: string
  account: string
  holder: string
}) {
  const m = messages[lang]
  const s = m.shopSetup
  const [cutoff, setCutoff] = useState(formatCutoff(defaultCutoff))
  const [bin, setBin] = useState(bankBin)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  /** The line the arrow keys are on, picked by Enter. */
  const [active, setActive] = useState(0)
  const [account, setAccount] = useState(savedAccount)
  const [holder, setHolder] = useState(savedHolder)
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()
  const matches = useMemo(() => searchBanks(query), [query])
  const picked = findBank(bin)

  // When the list opens, its highlighted line (the bank picked, B75) is scrolled into view.
  useEffect(() => {
    if (open && matches[active])
      document.getElementById(`settings-bank-option-${matches[active].bin}`)?.scrollIntoView({ block: 'nearest' })
    // Only when the list opens; the arrow keys scroll it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const edit = (field: SettingsField, set: (v: string) => void) => (v: string) => {
    set(v)
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
    setSaved(false)
    setAsking(false)
  }

  /** Picks a bank: the list closes and the field shows it (CN-83, AC230). */
  const pick = (b: string) => {
    edit('bankBin', setBin)(b)
    setQuery('')
    setOpen(false)
  }

  const save = (confirmed: boolean) =>
    start(async () => {
      const r = await saveSettingsAction({ defaultCutoff: cutoff, bankBin: bin, account, holder, confirmed })
      if (r.ok) {
        setCutoff(formatCutoff(r.values.defaultCutoff))
        setAccount(r.values.account)
        setHolder(r.values.holder)
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
      setErrors(r.fields)
    })

  return (
    <div className="max-w-3xl">
      <PageTitle title={s.settingsTitle} intro={s.settingsIntro} />
      <section className="parcel bg-card ring-1 ring-steel/70">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          {saved && (
            <div role="status">
              <Notice tone="leaf">{s.saved}</Notice>
            </div>
          )}
          <SetupField
            id="settings-cutoff"
            label={s.defaultCutoff}
            value={cutoff}
            onChange={(v) => edit('defaultCutoff', setCutoff)(maskCutoff(v))}
            error={errors.defaultCutoff}
            m={m}
            numeric
            hint={s.timeHint}
            className="max-w-56"
          />
          <div className="relative flex min-w-0 flex-col gap-1.5">
            <label htmlFor="settings-bank" className="text-sm font-medium text-muted">
              {s.bank}
            </label>
            {/* A field to type and pick (CN-83, B74): it shows the bank picked; tapping or typing opens the filtered list. */}
            <input
              id="settings-bank"
              role="combobox"
              autoComplete="off"
              aria-expanded={open}
              aria-controls={open && matches.length > 0 ? 'settings-bank-list' : undefined}
              aria-autocomplete="list"
              aria-activedescendant={open && matches[active] ? `settings-bank-option-${matches[active].bin}` : undefined}
              aria-invalid={errors.bankBin ? true : undefined}
              aria-describedby={errors.bankBin ? 'settings-bank-error' : undefined}
              placeholder={open ? s.bankSearch : s.noBankPicked}
              value={open ? query : picked ? bankLabel(picked) : ''}
              onFocus={() => {
                setQuery('')
                setActive(
                  Math.max(
                    0,
                    searchBanks('').findIndex((b) => b.bin === bin),
                  ),
                )
                setOpen(true)
              }}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                setOpen(true)
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false)
                  e.currentTarget.blur()
                }
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length > 0) {
                  e.preventDefault()
                  setOpen(true)
                  const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
                  setActive(next)
                  document.getElementById(`settings-bank-option-${matches[next].bin}`)?.scrollIntoView({ block: 'nearest' })
                }
                if (e.key === 'Enter' && open && matches[active]) {
                  e.preventDefault()
                  pick(matches[active].bin)
                  e.currentTarget.blur()
                }
              }}
              className={cx(
                'min-h-11 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1 outline-none',
                errors.bankBin ? 'ring-2 ring-chili' : 'ring-steel focus:ring-2 focus:ring-leaf',
              )}
            />
            {open && matches.length === 0 && <p className="px-2 py-3 text-[15px] text-muted">{s.noBankMatch}</p>}
            {open && matches.length > 0 && (
              <ul
                id="settings-bank-list"
                role="listbox"
                aria-label={s.bank}
                className="flex max-h-64 flex-col overflow-y-auto rounded-lg bg-card p-1 shadow-lg ring-1 ring-steel"
              >
                {matches.map((b, i) => (
                  <li
                    key={b.bin}
                    id={`settings-bank-option-${b.bin}`}
                    role="option"
                    aria-selected={b.bin === bin}
                    // Picked on mouse down, before the field's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(b.bin)
                      ;(document.getElementById('settings-bank') as HTMLInputElement | null)?.blur()
                    }}
                    className={cx(
                      'flex min-h-11 cursor-pointer items-center rounded-md px-2 py-2 text-[15px] break-words hover:bg-tray',
                      b.bin === bin && 'bg-leaf-soft font-semibold',
                      i === active && 'ring-2 ring-leaf ring-inset',
                    )}
                  >
                    {bankLabel(b)}
                  </li>
                ))}
              </ul>
            )}
            <FieldError id="settings-bank" m={m} error={errors.bankBin} />
          </div>
          <SetupField
            id="settings-account"
            label={s.account}
            value={account}
            onChange={edit('account', setAccount)}
            error={errors.account}
            m={m}
            numeric
            className="max-w-80"
          />
          <SetupField
            id="settings-holder"
            label={s.holder}
            value={holder}
            onChange={edit('holder', setHolder)}
            error={errors.holder}
            m={m}
            hint={s.holderHint}
          />
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
      </section>
    </div>
  )
}
