'use client'

// The shop's Dishes screen, S-S1 (BR-1, BR-6a, BR-7, BR-29b, CN-59–CN-61, CN-80, CN-81), built
// with the components of the banana-leaf design (UI15). The list: the dishes still sold by name
// A–Z, then the dishes no longer sold, A–Z, with "Not sold" and "Sell again". "Add dish" and
// "Edit" open the dish form inside the page (B71). A photo is shrunk in the browser and uploaded
// straight to the bucket through a signed upload URL; only Save makes it the dish's (B71).
import { useEffect, useRef, useState, useTransition } from 'react'
import { DishArt, drawnDishes } from '@/components/art'
import { mayBeImage, shrinkToJpeg, toDrawable } from '@/components/photo'
import { Badge, Button, Notice, PageTitle, cx } from '@/components/ui'
import { dishOrder, formatWhole, type DishErrors, type DishField, type DishInput, type SetupError } from '@/domain/dishes'
import { messages, money } from '@/domain/i18n'
import type { Dish, DishGroup, Lang } from '@/domain/types'
import { createDishPhotoUploadAction, saveDishAction, setDishActiveAction } from '@/server/actions/shop'
import { Check, FieldError, SetupField, withoutEdited } from './setup'

/** The longest side of a dish photo after shrinking (plan.md section 1.7). */
const PHOTO_MAX = 1200

export function DishesScreen({
  lang,
  dishes,
  groups,
  photos,
}: {
  lang: Lang
  dishes: Dish[]
  groups: DishGroup[]
  /** The signed address of each photo, by its path (B71). */
  photos: Record<string, string>
}) {
  const m = messages[lang]
  const s = m.shopSetup
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? ''
  const open = (id: string) => {
    setSaved(false)
    setEditing(id)
  }
  const dish = editing && editing !== 'new' ? dishes.find((d) => d.id === editing) : undefined

  return (
    <div>
      <PageTitle title={s.dishesTitle} intro={s.dishesIntro}>
        <Button onClick={() => open('new')} disabled={editing === 'new'}>
          {s.addDish}
        </Button>
      </PageTitle>
      {saved && (
        <div role="status" className="mb-4">
          <Notice tone="leaf">{s.saved}</Notice>
        </div>
      )}
      {editing && (editing === 'new' || dish) && (
        <DishForm
          key={editing}
          lang={lang}
          dish={dish ?? null}
          groups={groups}
          photo={dish?.photoPath ? (photos[dish.photoPath] ?? null) : null}
          onClose={(done) => {
            setEditing(null)
            setSaved(done)
          }}
        />
      )}
      {dishes.length === 0 ? (
        <p className="text-[15px] text-muted">{s.noDishes}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={s.dishesTitle}>
          {dishOrder(dishes).map((d) => (
            <li
              key={d.id}
              data-dish-card={d.name}
              className={cx('flex min-w-0 gap-3 rounded-2xl bg-card p-3 ring-1 ring-steel/70', !d.active && 'opacity-75')}
            >
              <DishArt dishId={d.drawing ?? ''} photo={d.photoPath ? photos[d.photoPath] : null} className="size-18 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="min-w-0 font-semibold break-words">{d.name}</h2>
                  {!d.active && <Badge tone="steel">{s.notSold}</Badge>}
                </div>
                {d.price !== null && <p className="text-sm text-muted">{s.fixedLine(money(d.price, lang))}</p>}
                {d.groupId && <p className="text-sm text-muted">{s.componentLine(groupName(d.groupId), money(d.surcharge, lang))}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-10 px-3" onClick={() => open(d.id)} aria-label={`${s.edit} ${d.name}`}>
                    {s.edit}
                  </Button>
                  {!d.active && (
                    <Button
                      variant="secondary"
                      className="min-h-10 px-3"
                      disabled={pending}
                      onClick={() => start(async () => void (await setDishActiveAction(d.id, true)))}
                      aria-label={`${s.sellAgain} ${d.name}`}
                    >
                      {s.sellAgain}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Photo = DishInput['photo']

function DishForm({
  lang,
  dish,
  groups,
  photo: savedPhoto,
  onClose,
}: {
  lang: Lang
  dish: Dish | null
  groups: DishGroup[]
  /** The signed address of the dish's current photo. */
  photo: string | null
  onClose: (saved: boolean) => void
}) {
  const m = messages[lang]
  const s = m.shopSetup
  const [name, setName] = useState(dish?.name ?? '')
  const [description, setDescription] = useState(dish?.description ?? '')
  const [nameEn, setNameEn] = useState(dish?.nameEn ?? '')
  const [descriptionEn, setDescriptionEn] = useState(dish?.descriptionEn ?? '')
  const [fixed, setFixed] = useState(dish ? dish.price !== null : false)
  const [price, setPrice] = useState(dish?.price != null ? formatWhole(dish.price, lang) : '')
  const [component, setComponent] = useState(dish ? dish.groupId !== null : false)
  const [groupId, setGroupId] = useState(dish?.groupId ?? '')
  const [surcharge, setSurcharge] = useState(dish?.groupId ? formatWhole(dish.surcharge, lang) : '')
  const [drawing, setDrawing] = useState<string | null>(dish?.drawing ?? null)
  const [photo, setPhoto] = useState<Photo>({ kind: 'keep' })
  const [preview, setPreview] = useState<string | null>(savedPhoto)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<'notImage' | SetupError | null>(null)
  const [errors, setErrors] = useState<DishErrors>({})
  const [edited, setEdited] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const top = useRef<HTMLElement>(null)
  const noGroups = groups.length === 0

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  const edit =
    <T,>(field: DishField, set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setEdited((e) => new Set(e).add(field))
    }
  const shown = withoutEdited(errors, edited)

  async function pick(file: File) {
    setPhotoError(null)
    setEdited((e) => new Set(e).add('photo'))
    if (!mayBeImage(file)) return setPhotoError('notImage')
    // Save waits from here, while the photo is converted and shrunk too, so it never saves without it.
    setUploading(true)
    let jpeg: Blob
    try {
      jpeg = await shrinkToJpeg(await toDrawable(file), PHOTO_MAX)
    } catch {
      setUploading(false)
      return setPhotoError('notImage')
    }
    try {
      const u = await createDishPhotoUploadAction()
      if (!u.ok) throw new Error('no upload address')
      const res = await fetch(u.url, { method: 'PUT', body: jpeg, headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' } })
      if (!res.ok) throw new Error(`upload failed: ${res.status}`)
      setPhoto({ kind: 'new', path: u.path })
      setPreview(URL.createObjectURL(jpeg))
    } catch {
      // The dish keeps its earlier photo or drawing and can still be saved (CN-81, AC211).
      setPhotoError('photoUpload')
    } finally {
      setUploading(false)
    }
  }

  const save = () =>
    start(async () => {
      const r = await saveDishAction({
        id: dish?.id ?? null,
        name,
        description,
        nameEn,
        descriptionEn,
        fixed,
        price,
        component,
        groupId,
        surcharge,
        drawing,
        photo,
      })
      if (r.ok) return onClose(true)
      setErrors(r.fields)
      setEdited(new Set())
      if (r.fields.photo) {
        // The server refused the new photo: back to the earlier one, so the next Save saves the
        // other fields with it (CN-82, AC217).
        setPhoto({ kind: 'keep' })
        setPreview(savedPhoto)
      }
    })

  const photoMessage = photoError === 'notImage' ? s.notImage : photoError ? s.field[photoError] : shown.photo ? s.field[shown.photo] : null

  return (
    <section ref={top} aria-label={dish ? s.editDish(dish.name) : s.newDish} className="parcel mb-6 bg-card ring-1 ring-steel/70">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 className="font-display text-[24px] leading-tight font-extrabold tracking-tight">{dish ? s.editDish(dish.name) : s.newDish}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SetupField id="dish-name" label={s.name} value={name} onChange={edit('name', setName)} error={shown.name} m={m} />
          <SetupField
            id="dish-description"
            label={s.description}
            value={description}
            onChange={edit('description', setDescription)}
            error={shown.description}
            m={m}
            hint={s.optional}
          />
          <SetupField
            id="dish-name-en"
            label={s.nameEn}
            value={nameEn}
            onChange={edit('nameEn', setNameEn)}
            error={shown.nameEn}
            m={m}
            hint={s.optional}
          />
          <SetupField
            id="dish-description-en"
            label={s.descriptionEn}
            value={descriptionEn}
            onChange={edit('descriptionEn', setDescriptionEn)}
            error={shown.descriptionEn}
            m={m}
            hint={s.optional}
          />
        </div>

        <fieldset className="flex flex-col gap-3" aria-describedby={shown.kind ? 'dish-kind-error' : undefined}>
          <legend className="mb-1 text-sm font-medium text-muted">{s.kind}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl bg-tray/60 p-3">
              <Check
                id="dish-fixed"
                label={s.fixed}
                checked={fixed}
                onChange={(v) => {
                  setFixed(v)
                  setEdited((e) => new Set(e).add('kind'))
                }}
              />
              {fixed && (
                <SetupField
                  id="dish-price"
                  label={s.price}
                  value={price}
                  onChange={edit('price', setPrice)}
                  error={shown.price}
                  m={m}
                  numeric
                />
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-xl bg-tray/60 p-3">
              <Check
                id="dish-component"
                label={s.component}
                checked={component}
                disabled={noGroups && !component}
                onChange={(v) => {
                  setComponent(v)
                  setEdited((e) => new Set(e).add('kind'))
                }}
              >
                {noGroups && !component && <p className="text-[13px] text-muted">{s.noGroupHint}</p>}
              </Check>
              {component && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="dish-group" className="text-sm font-medium text-muted">
                      {s.group}
                    </label>
                    <select
                      id="dish-group"
                      value={groups.some((g) => g.id === groupId) ? groupId : ''}
                      onChange={(e) => edit('groupId', setGroupId)(e.target.value)}
                      aria-invalid={shown.groupId ? true : undefined}
                      aria-describedby={shown.groupId ? 'dish-group-error' : undefined}
                      className={cx(
                        'min-h-11 w-full rounded-lg bg-card px-3 text-[16px] text-ink ring-1',
                        shown.groupId ? 'ring-2 ring-chili' : 'ring-steel',
                      )}
                    >
                      <option value="">{s.pickGroup}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <FieldError id="dish-group" m={m} error={shown.groupId} />
                  </div>
                  <SetupField
                    id="dish-surcharge"
                    label={s.surcharge}
                    value={surcharge}
                    onChange={edit('surcharge', setSurcharge)}
                    error={shown.surcharge}
                    m={m}
                    numeric
                  />
                </>
              )}
            </div>
          </div>
          <FieldError id="dish-kind" m={m} error={shown.kind} />
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">{s.photo}</span>
          <div className="flex flex-wrap items-center gap-3">
            <DishArt dishId={drawing ?? ''} photo={photo.kind === 'remove' ? null : preview} className="size-24 shrink-0" />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-[15px] font-semibold text-leaf ring-1 ring-leaf hover:bg-leaf-soft">
                {uploading ? s.uploading : preview && photo.kind !== 'remove' ? s.replacePhoto : s.uploadPhoto}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  aria-label={s.uploadPhoto}
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void pick(file)
                  }}
                />
              </label>
              {preview && photo.kind !== 'remove' && (
                <Button
                  variant="danger"
                  disabled={uploading}
                  onClick={() => {
                    setPhoto({ kind: 'remove' })
                    setPhotoError(null)
                  }}
                >
                  {s.removePhoto}
                </Button>
              )}
            </div>
          </div>
          {photoMessage && (
            <p id="dish-photo-error" role="alert" className="text-[13px] font-medium text-chili">
              {photoMessage}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-muted">{s.drawing}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {[null, ...drawnDishes].map((key) => {
              const label = key ? (s.drawings[key] ?? key) : s.noDrawing
              const on = drawing === key
              return (
                <label
                  key={key ?? 'none'}
                  className={cx(
                    'flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl p-1.5 text-center text-[12px] leading-tight ring-1',
                    on ? 'bg-leaf-soft ring-2 ring-leaf' : 'ring-steel hover:ring-leaf',
                  )}
                >
                  <input
                    type="radio"
                    name="dish-drawing"
                    className="sr-only"
                    checked={on}
                    onChange={() => setDrawing(key)}
                    aria-label={label}
                  />
                  <DishArt dishId={key ?? ''} className="size-14" />
                  <span className="break-words">{label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || uploading}>
            {s.save}
          </Button>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={pending}>
            {s.cancel}
          </Button>
          {dish?.active && (
            <Button
              variant="danger"
              className="ml-auto"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setDishActiveAction(dish.id, false)
                  if (r.ok) onClose(false)
                })
              }
            >
              {s.stopSelling}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
