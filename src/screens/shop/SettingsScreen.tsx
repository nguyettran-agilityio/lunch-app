'use client'

// The shop's Settings screen, S-S4 (BR-4, BR-19, CN-60, CN-61, CN-83), built with the components of
// the banana-leaf design (UI15): the default cutoff, the bank picked from the VietQR list with a
// field to search it, the account number and the account holder; one Save for the whole screen,
// which saves nothing when a field is refused (AC225). A Save that would close today for ordering at
// once first asks, with "Save anyway" and "Cancel" (AC228).
import { useMemo, useState, useTransition } from 'react'
import { Button, Notice, PageTitle, cx } from '@/components/ui'
import { bankLabel, findBank, searchBanks } from '@/domain/banks'
import { formatCutoff, type SettingsErrors, type SettingsField } from '@/domain/days'
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
  const [account, setAccount] = useState(savedAccount)
  const [holder, setHolder] = useState(savedHolder)
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()
  const matches = useMemo(() => searchBanks(query), [query])
  const picked = findBank(bin)

  const edit = (field: SettingsField, set: (v: string) => void) => (v: string) => {
    set(v)
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
    setSaved(false)
    setAsking(false)
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
            onChange={edit('defaultCutoff', setCutoff)}
            error={errors.defaultCutoff}
            m={m}
            hint={s.timeHint}
            className="max-w-56"
          />
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-muted">{s.bank}</legend>
            <p id="settings-bank-picked" className="text-[15px] font-semibold">
              {picked ? s.bankPicked(bankLabel(picked)) : s.noBankPicked}
            </p>
            <SetupField id="settings-bank-search" label={s.bankSearch} value={query} onChange={setQuery} m={m} />
            <div
              role="radiogroup"
              aria-label={s.bank}
              aria-invalid={errors.bankBin ? true : undefined}
              aria-describedby={errors.bankBin ? 'settings-bank-error' : undefined}
              className={cx(
                'flex max-h-64 flex-col overflow-y-auto rounded-lg p-1 ring-1',
                errors.bankBin ? 'ring-2 ring-chili' : 'ring-steel',
              )}
            >
              {matches.length === 0 && <p className="px-2 py-3 text-[15px] text-muted">{s.noBankMatch}</p>}
              {matches.map((b) => (
                <label
                  key={b.bin}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-[15px] hover:bg-tray',
                    b.bin === bin && 'bg-leaf-soft',
                  )}
                >
                  <input
                    type="radio"
                    name="settings-bank"
                    value={b.bin}
                    checked={b.bin === bin}
                    onChange={() => edit('bankBin', setBin)(b.bin)}
                    className="mt-0.5 size-5 shrink-0 accent-leaf"
                  />
                  <span className="min-w-0 break-words">{bankLabel(b)}</span>
                </label>
              ))}
            </div>
            <FieldError id="settings-bank" m={m} error={errors.bankBin} />
          </fieldset>
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
