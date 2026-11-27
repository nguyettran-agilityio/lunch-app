'use client'

// The shop's Build-your-own rules screen, S-S2 (BR-7, BR-8, CN-60, CN-61, CN-80, CN-81), built with
// the components of the banana-leaf design (UI15): the base price, then the groups in their order,
// each with name, minimum, maximum, included count and extra dish fee, up and down buttons and
// "Delete group"; "Add group"; one Save for the whole screen, which saves nothing when a field is
// refused (AC200). A group deleted on the screen stays shown until Save, with "Keep it".
import { useRef, useState, useTransition } from 'react'
import { Button, Notice, PageTitle, cx } from '@/components/ui'
import { formatWhole, type GroupField, type RulesErrors, type SetupError } from '@/domain/dishes'
import { messages } from '@/domain/i18n'
import type { DishGroup, Lang } from '@/domain/types'
import { saveRulesAction } from '@/server/actions/shop'
import { FieldError, SetupField } from './setup'

type Row = {
  key: string
  id: string | null
  name: string
  min: string
  max: string
  included: string
  extraFee: string
  deleted: boolean
}

const toRows = (groups: DishGroup[], lang: Lang): Row[] =>
  groups.map((g) => ({
    key: g.id,
    id: g.id,
    name: g.name,
    min: formatWhole(g.min, lang),
    max: formatWhole(g.max, lang),
    included: formatWhole(g.included, lang),
    extraFee: formatWhole(g.extraFee, lang),
    deleted: false,
  }))

type RowErrors = Partial<Record<GroupField, SetupError>>

export function RulesScreen({ lang, basePrice: savedBase, groups }: { lang: Lang; basePrice: number | null; groups: DishGroup[] }) {
  const m = messages[lang]
  const s = m.shopSetup
  const [base, setBase] = useState(savedBase === null ? '' : formatWhole(savedBase, lang))
  const [rows, setRows] = useState<Row[]>(() => toRows(groups, lang))
  const [baseError, setBaseError] = useState<SetupError | undefined>()
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({})
  const [formError, setFormError] = useState<SetupError | undefined>()
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const seq = useRef(0)

  const clearRow = (key: string, field: GroupField) =>
    setRowErrors((e) => (e[key]?.[field] || e[key]?.row ? { ...e, [key]: { ...e[key], [field]: undefined, row: undefined } } : e))
  const setRow = (key: string, field: 'name' | 'min' | 'max' | 'included' | 'extraFee') => (v: string) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: v } : r)))
    clearRow(key, field)
    setSaved(false)
  }
  const move = (key: string, by: -1 | 1) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key)
      // The next group shown in that direction, past the ones deleted on the screen.
      let j = i + by
      while (j >= 0 && j < rs.length && rs[j].deleted) j += by
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const remove = (key: string) => {
    setSaved(false)
    setRows((rs) =>
      rs.find((r) => r.key === key)?.id ? rs.map((r) => (r.key === key ? { ...r, deleted: true } : r)) : rs.filter((r) => r.key !== key),
    )
  }
  const keep = (key: string) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, deleted: false } : r)))
    clearRow(key, 'row')
  }
  const add = () => {
    setSaved(false)
    setRows((rs) => [
      ...rs,
      { key: `new-${++seq.current}`, id: null, name: '', min: '', max: '', included: '', extraFee: '', deleted: false },
    ])
  }

  const save = () =>
    start(async () => {
      const shown = rows.filter((r) => !r.deleted)
      const r = await saveRulesAction({
        basePrice: base,
        groups: shown.map(({ id, name, min, max, included, extraFee }) => ({ id, name, min, max, included, extraFee })),
        deleted: rows.filter((x) => x.deleted && x.id).map((x) => x.id as string),
      })
      if (r.ok) {
        setBase(formatWhole(r.basePrice, lang))
        setRows(toRows(r.groups, lang))
        setBaseError(undefined)
        setRowErrors({})
        setFormError(undefined)
        setSaved(true)
        return
      }
      const f: RulesErrors = r.fields
      setSaved(false)
      if (r.latest) {
        // Another device saved at the same moment: the screen as that device left it, with the message (CN-82, AC221).
        setRows(toRows(r.latest.groups, lang))
        setBase(r.latest.basePrice === null ? '' : formatWhole(r.latest.basePrice, lang))
        setRowErrors({})
        setBaseError(undefined)
        setFormError(f.form)
        return
      }
      setBaseError(f.basePrice)
      setFormError(f.form)
      const byKey: Record<string, RowErrors> = {}
      shown.forEach((row, i) => {
        if (f.groups?.[i]) byKey[row.key] = f.groups[i]
      })
      for (const row of rows) if (row.id && f.deleted?.[row.id]) byKey[row.key] = { row: f.deleted[row.id] }
      setRowErrors(byKey)
    })

  const live = rows.filter((r) => !r.deleted)

  return (
    <div className="max-w-3xl">
      <PageTitle title={s.rulesTitle} intro={s.rulesIntro} />
      <section className="parcel bg-card ring-1 ring-steel/70">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          {saved && (
            <div role="status">
              <Notice tone="leaf">{s.saved}</Notice>
            </div>
          )}
          {formError && (
            <div role="alert">
              <Notice tone="chili">{s.field[formError]}</Notice>
            </div>
          )}
          <SetupField
            id="rules-base-price"
            label={s.basePrice}
            value={base}
            onChange={(v) => {
              setBase(v)
              setBaseError(undefined)
              setSaved(false)
            }}
            error={baseError}
            m={m}
            numeric
            className="max-w-56"
          />
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{s.groups}</h2>
            {rows.length === 0 && <p className="text-[15px] text-muted">{s.noGroups}</p>}
            <ol className="flex flex-col gap-3">
              {rows.map((r) => {
                const e = rowErrors[r.key] ?? {}
                const label = r.name.trim() || s.groupName
                if (r.deleted)
                  return (
                    <li key={r.key} data-group-row={r.name} className="flex flex-col gap-2 rounded-xl bg-tray p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[15px] text-muted line-through">{s.willDelete(r.name)}</p>
                        <Button variant="ghost" onClick={() => keep(r.key)}>
                          {s.undoDelete}
                        </Button>
                      </div>
                      <FieldError id={`group-${r.key}-row`} m={m} error={e.row} />
                    </li>
                  )
                const i = live.findIndex((x) => x.key === r.key)
                return (
                  <li key={r.key} data-group-row={r.name} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-steel">
                    <SetupField
                      id={`group-${r.key}-name`}
                      label={s.groupName}
                      value={r.name}
                      onChange={setRow(r.key, 'name')}
                      error={e.name}
                      m={m}
                    />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <SetupField
                        id={`group-${r.key}-min`}
                        label={s.min}
                        value={r.min}
                        onChange={setRow(r.key, 'min')}
                        error={e.min}
                        m={m}
                        numeric
                      />
                      <SetupField
                        id={`group-${r.key}-max`}
                        label={s.max}
                        value={r.max}
                        onChange={setRow(r.key, 'max')}
                        error={e.max}
                        m={m}
                        numeric
                      />
                      <SetupField
                        id={`group-${r.key}-included`}
                        label={s.included}
                        value={r.included}
                        onChange={setRow(r.key, 'included')}
                        error={e.included}
                        m={m}
                        numeric
                      />
                      <SetupField
                        id={`group-${r.key}-extra-fee`}
                        label={s.extraFee}
                        value={r.extraFee}
                        onChange={setRow(r.key, 'extraFee')}
                        error={e.extraFee}
                        m={m}
                        numeric
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-10 px-3"
                        disabled={i === 0}
                        onClick={() => move(r.key, -1)}
                        aria-label={`${s.moveUp} ${label}`}
                      >
                        ↑ {s.moveUp}
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-10 px-3"
                        disabled={i === live.length - 1}
                        onClick={() => move(r.key, 1)}
                        aria-label={`${s.moveDown} ${label}`}
                      >
                        ↓ {s.moveDown}
                      </Button>
                      <Button
                        variant="danger"
                        className={cx('min-h-10 px-3 sm:ml-auto')}
                        onClick={() => remove(r.key)}
                        aria-label={`${s.deleteGroup} ${label}`}
                      >
                        {s.deleteGroup}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ol>
            <Button variant="secondary" className="self-start" onClick={add}>
              + {s.addGroup}
            </Button>
          </div>
          <Button onClick={save} disabled={pending} className="self-start">
            {s.save}
          </Button>
        </div>
      </section>
    </div>
  )
}
