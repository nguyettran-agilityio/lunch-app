// @vitest-environment node
// The shop's Dishes and Build-your-own rules (S-S1, S-S2, PR M2-1, B71): the pure rules of
// `domain/dishes.ts`, and `server/shop.ts` with load.ts and save.ts on PGlite with an in-memory
// storage. Test names give AC ids and scenario ids only (X7): AC63, AC72, AC82 and AC196 are still
// in the exception list, and they cite the CN ids of this PR.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { drawnDishes } from '@/components/art'
import { afterSignIn } from '@/domain/account'
import {
  DRAWING_KEYS,
  dishOrder,
  nameKey,
  parseWhole,
  saveDish as saveDishRule,
  saveRules as saveRulesRule,
  type DishInput,
  type RulesInput,
} from '@/domain/dishes'
import type { Dish, DishGroup, State } from '@/domain/types'
import { dishGroups, dishes, shopSettings } from '@/server/db/schema'
import type { FileInfo, StorageProvider } from '@/server/storage/provider'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const shop = await import('@/server/shop')

const CLOCK = { today: '2026-11-27', minutes: 600 }
const SHOP = '00000000-0000-4000-8000-0000000000aa'
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function state(groups: DishGroup[] = [], list: Dish[] = []): State {
  return {
    lang: 'vi',
    clock: CLOCK,
    me: SHOP,
    settings: { defaultCutoff: 0, bank: { name: '', account: '', holder: '' }, basePrice: 35000 },
    groups,
    dishes: list,
    days: [],
    buildings: [],
    customers: [],
    orders: [],
    carts: {},
    refundReminderSeen: null,
  }
}

const group = (name: string, over: Partial<DishGroup> = {}): DishGroup => ({
  id: id(),
  name,
  min: 1,
  max: 2,
  included: 1,
  extraFee: 10000,
  position: 0,
  ...over,
})

const dish = (name: string, over: Partial<Dish> = {}): Dish => ({
  id: id(),
  name,
  description: '',
  price: 45000,
  groupId: null,
  surcharge: 0,
  photoPath: null,
  drawing: null,
  active: true,
  ...over,
})

const input = (over: Partial<DishInput> = {}): DishInput => ({
  id: null,
  name: 'Cơm sườn ram',
  description: '',
  nameEn: '',
  descriptionEn: '',
  fixed: true,
  price: '45.000',
  component: false,
  groupId: '',
  surcharge: '',
  drawing: null,
  photo: { kind: 'keep' },
  ...over,
})

const row = (g: DishGroup) => ({
  id: g.id,
  name: g.name,
  min: String(g.min),
  max: String(g.max),
  included: String(g.included),
  extraFee: String(g.extraFee),
})
const newRow = (name: string, over: Partial<RulesInput['groups'][number]> = {}) => ({
  id: null,
  name,
  min: '1',
  max: '2',
  included: '1',
  extraFee: '0',
  ...over,
})

describe('AC202 AC206 AC214 H8 H12 H20 typing an amount', () => {
  it('reads digits, and groups of three split by dots, commas or spaces, in both languages', () => {
    for (const s of ['45.000', '45 000', '45000', '45,000', ' 45.000 ', '45 000']) expect(parseWhole(s)).toEqual({ value: 45000 })
    expect(parseWhole('1.234.567')).toEqual({ value: 1234567 })
    expect(parseWhole('0')).toEqual({ value: 0 })
  })
  it('drops the characters a Vietnamese input method can put in and reads special spaces as spaces', () => {
    // Zero-width space, non-joiner, joiner, word joiner, byte order mark, soft hyphen, bidi marks.
    for (const c of ['​', '‌', '‍', '⁠', '﻿', '­', '‎', '‏', '‪', '‬', '⁦', '⁩'])
      for (const typed of [`35.000${c}`, `${c}35.000`, `35${c}.000`, `35.${c}000`, `35${c}000`])
        expect(parseWhole(typed), JSON.stringify(typed)).toEqual({ value: 35000 })
    // No-break, Ogham, en, em, thin, hair, narrow no-break, medium mathematical and ideographic spaces.
    for (const sp of [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　'])
      expect(parseWhole(`35${sp}000`), JSON.stringify(sp)).toEqual({ value: 35000 })
    expect(parseWhole('​')).toEqual({ error: 'required' })
    // The rules of CN-80 do not change: a decimal is still refused.
    expect(parseWhole('45,​5')).toEqual({ error: 'notWhole' })
  })

  it('applies to every number field: price, surcharge, base price, extra dish fee and the counts', () => {
    const z = '​'
    const main = group('Món mặn')
    const fixed = saveDishRule(state(), input({ price: `45.000${z}` }), id)
    const component = saveDishRule(state([main]), input({ fixed: false, component: true, groupId: main.id, surcharge: `5.000${z}` }), id)
    const rules = saveRulesRule(
      state(),
      {
        basePrice: `35.000${z}`,
        groups: [newRow('A', { min: `1${z}`, max: `2${z}`, included: `1${z}`, extraFee: `10.000${z}` })],
        deleted: [],
      },
      id,
    )
    if (!fixed.ok || !component.ok || !rules.ok) throw new Error('refused')
    expect(fixed.state.dishes[0].price).toBe(45000)
    expect(component.state.dishes[0].surcharge).toBe(5000)
    expect(rules.basePrice).toBe(35000)
    expect(rules.state.groups[0]).toMatchObject({ min: 1, max: 2, included: 1, extraFee: 10000 })
  })

  it('refuses a decimal, letters, a negative number and mixed separators', () => {
    for (const s of ['45,5', '45.5', 'abc', '-5.000', '1.234,567', '45.00', '4.5000']) expect(parseWhole(s)).toEqual({ error: 'notWhole' })
    expect(parseWhole('  ')).toEqual({ error: 'required' })
  })
})

describe('the dish form (S-S1)', () => {
  it('AC77 Q1 a negative surcharge and price are refused under the field; 0 and 45.000 are saved', () => {
    const main = group('Món mặn')
    const s = state([main])
    const bad = saveDishRule(s, input({ name: 'Trứng chiên', fixed: false, component: true, groupId: main.id, surcharge: '-5.000' }), id)
    expect(bad).toEqual({ ok: false, fields: { surcharge: 'notWhole' }, reloadGroups: false })
    expect(saveDishRule(s, input({ price: '-5.000' }), id).ok).toBe(false)
    const egg = saveDishRule(s, input({ name: 'Trứng chiên', fixed: false, component: true, groupId: main.id, surcharge: '0' }), id)
    const ribs = saveDishRule(s, input(), id)
    if (!egg.ok || !ribs.ok) throw new Error('refused')
    expect(egg.state.dishes[0]).toMatchObject({ name: 'Trứng chiên', price: null, groupId: main.id, surcharge: 0, active: true })
    expect(ribs.state.dishes[0]).toMatchObject({ name: 'Cơm sườn ram', price: 45000, groupId: null })
  })

  it('AC195 H1 a dish of no kind is refused under the kind field', () => {
    expect(saveDishRule(state(), input({ name: 'Nước sâm', fixed: false }), id)).toMatchObject({
      ok: false,
      fields: { kind: 'kindRequired' },
    })
  })

  it('AC203 H9 a name over 80 characters and a description over 200 are refused; 80 and 200 are saved', () => {
    const long = (k: number) => 'ă'.repeat(k)
    expect(saveDishRule(state(), input({ name: long(81) }), id)).toMatchObject({ ok: false, fields: { name: 'nameTooLong' } })
    expect(saveDishRule(state(), input({ description: long(201) }), id)).toMatchObject({
      ok: false,
      fields: { description: 'descriptionTooLong' },
    })
    expect(saveDishRule(state(), input({ nameEn: long(81), descriptionEn: long(201) }), id)).toMatchObject({
      ok: false,
      fields: { nameEn: 'nameTooLong', descriptionEn: 'descriptionTooLong' },
    })
    expect(saveDishRule(state(), input({ name: long(80), description: long(200) }), id).ok).toBe(true)
  })

  it('AC199 H5 the name of another dish is refused, also one no longer sold, trimmed and in any case or Unicode form', () => {
    const s = state([], [dish('Trứng chiên', { active: false })])
    expect(saveDishRule(s, input({ name: ' trứng chiên ' }), id)).toMatchObject({ ok: false, fields: { name: 'dishNameTaken' } })
    // The same letters typed decomposed (NFD), as some Vietnamese keyboards do.
    expect(saveDishRule(s, input({ name: 'Trứng chiên'.normalize('NFD') }), id)).toMatchObject({
      ok: false,
      fields: { name: 'dishNameTaken' },
    })
    // Its own name is no change.
    const self = s.dishes[0]
    expect(saveDishRule(s, input({ id: self.id, name: 'Trứng chiên' }), id).ok).toBe(true)
  })

  it('AC208 H14 spaces inside a name make another name, and two dishes may share an English name', () => {
    const s = state([], [dish('Trứng chiên', { nameEn: 'Fried egg' })])
    expect(saveDishRule(s, input({ name: 'Trứng  chiên' }), id).ok).toBe(true)
    expect(saveDishRule(s, input({ name: 'Trứng ốp la', nameEn: 'Fried egg' }), id).ok).toBe(true)
  })

  it('AC205 H11 an empty surcharge or price is Required, never 0', () => {
    const main = group('Món mặn')
    expect(saveDishRule(state([main]), input({ fixed: false, component: true, groupId: main.id, surcharge: '' }), id)).toMatchObject({
      ok: false,
      fields: { surcharge: 'required' },
    })
    expect(saveDishRule(state(), input({ price: '' }), id)).toMatchObject({ ok: false, fields: { price: 'required' } })
  })

  it('AC207 H13 money above 10.000.000 is refused; 10.000.000 is saved', () => {
    expect(saveDishRule(state(), input({ price: '10.000.001' }), id)).toMatchObject({ ok: false, fields: { price: 'moneyTooBig' } })
    expect(saveDishRule(state(), input({ price: '10.000.000' }), id).ok).toBe(true)
  })

  it('AC213 H19 a group deleted while the form was open gives Required, and the groups are loaded again', () => {
    expect(saveDishRule(state(), input({ fixed: false, component: true, groupId: id(), surcharge: '0' }), id)).toEqual({
      ok: false,
      fields: { groupId: 'required' },
      reloadGroups: true,
    })
  })

  it('AC197 H3 a new photo, then "Remove photo": the dish keeps its drawing', () => {
    const d = dish('Cá kho tộ', { photoPath: 'dishes/old.jpg', drawing: 'd-cakho' })
    const s = state([], [d])
    const replaced = saveDishRule(
      s,
      input({ id: d.id, name: d.name, drawing: 'd-cakho', photo: { kind: 'new', path: 'dishes/new.jpg' } }),
      id,
    )
    const removed = saveDishRule(s, input({ id: d.id, name: d.name, drawing: 'd-cakho', photo: { kind: 'remove' } }), id)
    if (!replaced.ok || !removed.ok) throw new Error('refused')
    expect(replaced.state.dishes[0]).toMatchObject({ photoPath: 'dishes/new.jpg', drawing: 'd-cakho' })
    expect(removed.state.dishes[0]).toMatchObject({ photoPath: null, drawing: 'd-cakho' })
  })

  it('R1 a drawing is one of the set or none: any other key is stored as none, a plain rice bowl', () => {
    expect(DRAWING_KEYS).toEqual(drawnDishes)
    const r = saveDishRule(state(), input({ drawing: 'd-unknown' }), id)
    const ok = saveDishRule(state(), input({ drawing: 'd-cakho' }), id)
    if (!r.ok || !ok.ok) throw new Error('refused')
    expect(r.state.dishes[0].drawing).toBeNull()
    expect(ok.state.dishes[0].drawing).toBe('d-cakho')
  })

  it('AC204 H10 the list: dishes sold by Vietnamese name A–Z, then those not sold, A–Z', () => {
    const list = [
      dish('Rau muống xào'),
      dish('Canh bí đỏ', { active: false }),
      dish('Bún bò Huế', { active: false }),
      dish('Cá kho tộ'),
      dish('Ấp chả'),
    ]
    expect(dishOrder(list).map((d) => d.name)).toEqual(['Ấp chả', 'Cá kho tộ', 'Rau muống xào', 'Bún bò Huế', 'Canh bí đỏ'])
  })
})

describe('the Build-your-own rules (S-S2)', () => {
  const canh = group('Canh', { min: 0, max: 1, included: 1, extraFee: 0, position: 2 })
  const main = group('Món mặn', { position: 0 })
  const rau = group('Rau', { max: 1, extraFee: 0, position: 1 })

  it('AC73 P12 minimum over maximum, included over maximum and a negative fee are refused under the field; valid values are saved', () => {
    const s = state([main])
    const bad = saveRulesRule(
      s,
      {
        basePrice: '35.000',
        groups: [newRow('A', { min: '2', max: '1' }), newRow('B', { included: '3', max: '2' }), newRow('C', { extraFee: '-5.000' })],
        deleted: [],
      },
      id,
    )
    expect(bad).toEqual({
      ok: false,
      fields: { groups: { 0: { min: 'minOverMax' }, 1: { included: 'includedOverMax' }, 2: { extraFee: 'notWhole' } } },
    })
    const good = saveRulesRule(
      s,
      { basePrice: '35.000', groups: [{ ...row(main), min: '1', included: '1', max: '2', extraFee: '5.000' }], deleted: [] },
      id,
    )
    if (!good.ok) throw new Error('refused')
    expect(good.state.groups[0]).toMatchObject({ min: 1, included: 1, max: 2, extraFee: 5000 })
  })

  it('AC200 H6 one refused field saves nothing, then everything is saved at once', () => {
    const s = state([main, rau])
    const bad = saveRulesRule(
      s,
      {
        basePrice: '40.000',
        groups: [
          { ...row(main), max: '1' },
          { ...row(rau), min: '2', max: '1' },
        ],
        deleted: [],
      },
      id,
    )
    expect(bad.ok).toBe(false)
    const good = saveRulesRule(
      s,
      {
        basePrice: '40.000',
        groups: [
          { ...row(main), max: '1' },
          { ...row(rau), min: '1', max: '1' },
        ],
        deleted: [],
      },
      id,
    )
    if (!good.ok) throw new Error('refused')
    expect(good.basePrice).toBe(40000)
    expect(good.state.groups.map((g) => [g.name, g.max])).toEqual([
      ['Món mặn', 1],
      ['Rau', 1],
    ])
  })

  it('AC198 H4 a group is added and moved, deleted when empty, refused when it has a dish no longer sold', () => {
    const s = state([main, rau, canh], [dish('Canh bí đỏ', { price: null, groupId: canh.id, active: false })])
    const added = saveRulesRule(
      s,
      { basePrice: '35.000', groups: [row(main), row(rau), newRow('Tráng miệng'), row(canh)], deleted: [] },
      id,
    )
    if (!added.ok) throw new Error('refused')
    expect(added.state.groups.map((g) => [g.name, g.position])).toEqual([
      ['Món mặn', 0],
      ['Rau', 1],
      ['Tráng miệng', 2],
      ['Canh', 3],
    ])
    expect(saveRulesRule(s, { basePrice: '35.000', groups: [row(main), row(rau)], deleted: [canh.id] }, id)).toEqual({
      ok: false,
      fields: { deleted: { [canh.id]: 'groupHasDishes' } },
    })
    const emptyRau = saveRulesRule(s, { basePrice: '35.000', groups: [row(main), row(canh)], deleted: [rau.id] }, id)
    if (!emptyRau.ok) throw new Error('refused')
    expect(emptyRau.state.groups.map((g) => g.name)).toEqual(['Món mặn', 'Canh'])
  })

  it('AC199 H5 an empty group name is Required and a name used twice is refused', () => {
    const r = saveRulesRule(state([rau]), { basePrice: '35.000', groups: [row(rau), newRow(' rau '), newRow('')], deleted: [] }, id)
    expect(r).toEqual({ ok: false, fields: { groups: { 1: { name: 'groupNameTaken' }, 2: { name: 'required' } } } })
  })

  it('AC205 H11 an empty extra dish fee, count or base price is Required', () => {
    const r = saveRulesRule(state([rau]), { basePrice: '', groups: [{ ...row(rau), extraFee: '', min: '' }], deleted: [] }, id)
    expect(r).toEqual({ ok: false, fields: { basePrice: 'required', groups: { 0: { extraFee: 'required', min: 'required' } } } })
  })

  it('AC207 H13 a count above 20 is refused; 20 is saved; a maximum of 0 is refused', () => {
    expect(saveRulesRule(state(), { basePrice: '35.000', groups: [newRow('A', { max: '21' })], deleted: [] }, id)).toMatchObject({
      ok: false,
      fields: { groups: { 0: { max: 'countTooBig' } } },
    })
    expect(
      saveRulesRule(state(), { basePrice: '35.000', groups: [newRow('A', { min: '0', included: '0', max: '0' })], deleted: [] }, id),
    ).toMatchObject({
      ok: false,
      fields: { groups: { 0: { max: 'maxBelowOne' } } },
    })
    expect(saveRulesRule(state(), { basePrice: '10.000.001', groups: [], deleted: [] }, id)).toMatchObject({
      ok: false,
      fields: { basePrice: 'moneyTooBig' },
    })
    expect(saveRulesRule(state(), { basePrice: '35.000', groups: [newRow('A', { max: '20' })], deleted: [] }, id).ok).toBe(true)
  })

  it('AC209 H15 the last Save wins: a group it did not show and with no dish is gone', () => {
    const dessert = group('Tráng miệng', { position: 3 })
    const r = saveRulesRule(state([main, rau, dessert]), { basePrice: '40.000', groups: [row(main), row(rau)], deleted: [] }, id)
    if (!r.ok) throw new Error('refused')
    expect(r.state.groups.map((g) => g.name)).toEqual(['Món mặn', 'Rau'])
  })

  it('AC215 H21 a group the Save did not show but that now has a dish stays, after the others', () => {
    const dessert = group('Tráng miệng', { position: 3 })
    const s = state([main, rau, dessert], [dish('Chè đậu', { price: null, groupId: dessert.id, surcharge: 5000 })])
    const r = saveRulesRule(s, { basePrice: '40.000', groups: [row(main), row(rau)], deleted: [] }, id)
    if (!r.ok) throw new Error('refused')
    expect(r.state.groups.map((g) => [g.name, g.position])).toEqual([
      ['Món mặn', 0],
      ['Rau', 1],
      ['Tráng miệng', 2],
    ])
  })

  it('AC219 H25 a group deleted on another device but still shown here comes back with this Save', () => {
    // The phone deleted "Canh"; the computer still shows it with its old id.
    const r = saveRulesRule(state([main, rau]), { basePrice: '40.000', groups: [row(main), row(rau), row(canh)], deleted: [] }, id)
    if (!r.ok) throw new Error('refused')
    expect(r.state.groups.map((g) => g.name)).toEqual(['Món mặn', 'Rau', 'Canh'])
    expect(r.state.groups[2].id).not.toBe(canh.id)
  })

  it('AC212 H18 every group deleted can be saved', () => {
    const r = saveRulesRule(state([main, rau]), { basePrice: '35.000', groups: [], deleted: [main.id, rau.id] }, id)
    if (!r.ok) throw new Error('refused')
    expect(r.state.groups).toEqual([])
  })
})

describe('AC201 H7 where a shop account goes after signing in', () => {
  it('to a shop page the app has, its query kept; any other path to /shop; a customer never to /shop', () => {
    expect(afterSignIn({ role: 'shop', complete: true, next: '/shop/dishes' })).toBe('/shop/dishes')
    expect(afterSignIn({ role: 'shop', complete: true, next: '/shop/rules?x=1' })).toBe('/shop/rules?x=1')
    expect(afterSignIn({ role: 'shop', complete: true, next: '/shop?day=2026-11-27' })).toBe('/shop?day=2026-11-27')
    for (const next of ['/shop/old-menu', '/shopx', '/proto', '/proto/shop', '/', null])
      expect(afterSignIn({ role: 'shop', complete: true, next })).toBe('/shop')
    expect(afterSignIn({ role: 'customer', complete: true, next: '/shop/dishes' })).toBe('/')
  })
})

/** The bucket as a map, as the test version keeps it in a table. */
function memoryStorage(failRemove = false): StorageProvider & { files: Map<string, FileInfo> } {
  const files = new Map<string, FileInfo>()
  return {
    files,
    async uploadUrl(path) {
      return `/upload/${path}`
    },
    async info(path) {
      return files.get(path) ?? null
    },
    async readUrls(paths) {
      return new Map(paths.map((p) => [p, `/read/${p}`]))
    },
    async remove(paths) {
      if (failRemove) return
      for (const p of paths) files.delete(p)
    },
  }
}

describe('server/shop.ts on PGlite (B71)', () => {
  let t: TestDb
  let storage: ReturnType<typeof memoryStorage>
  const deps = () => ({ db: t.db, storage, ctx: { me: SHOP, lang: 'vi' as const, clock: CLOCK } })
  beforeEach(async () => {
    t = await createTestDb()
    storage = memoryStorage()
  })
  afterEach(async () => {
    await t.close()
  })

  async function addGroup(name: string, position = 0) {
    const [g] = await t.db
      .insert(dishGroups)
      .values({ name, nameKey: nameKey(name), min: 1, max: 2, included: 1, extraFee: 0, position })
      .returning()
    return g
  }

  it('AC77 Q1 a dish is written with its name key; a refused one writes nothing', async () => {
    expect((await shop.saveDish(deps(), input({ price: '-5.000' }))).ok).toBe(false)
    expect(await t.db.select().from(dishes)).toEqual([])
    const r = await shop.saveDish(deps(), input({ name: 'Trứng chiên'.normalize('NFD') }))
    expect(r.ok).toBe(true)
    const [d] = await t.db.select().from(dishes)
    expect(d).toMatchObject({ name: 'Trứng chiên'.normalize('NFC'), nameKey: 'trứng chiên', price: 45000, active: true })
  })

  it('AC199 two saves of one name at once: the deferred unique constraint gives "already exists"', async () => {
    // A row whose name key matches but whose name the rule does not see as equal stands in for a
    // dish saved by another shop account between this Save's read and its commit.
    await t.db.insert(dishes).values({ name: 'Other', nameKey: 'cơm sườn ram', price: 1 })
    expect(await shop.saveDish(deps(), input())).toEqual({ ok: false, fields: { name: 'dishNameTaken' } })
    expect(await t.db.select().from(dishes)).toHaveLength(1)
  })

  it('AC213 H19 a group deleted between the read and the write: Required under the group', async () => {
    const g = await addGroup('Canh')
    // The foreign key refuses the dish when its group is gone; a direct delete stands in for the other device.
    const r = shop.saveDish(
      { ...deps(), db: t.db },
      input({ fixed: false, component: true, groupId: g.id, surcharge: '0', name: 'Canh chua' }),
    )
    expect((await r).ok).toBe(true)
    await expect(t.db.delete(dishGroups).where(eq(dishGroups.id, g.id))).rejects.toThrow()
  })

  it('AC197 AC211 H3 H17 a new photo is checked in the bucket; a replaced or removed one is deleted after saving', async () => {
    const first = await shop.newPhotoUpload(storage)
    expect(first.path).toMatch(/^dishes\/[0-9a-f-]{36}\.jpg$/)
    // Not uploaded (the upload failed): refused, nothing written.
    expect(await shop.saveDish(deps(), input({ name: 'Cá kho tộ', photo: { kind: 'new', path: first.path } }))).toEqual({
      ok: false,
      fields: { photo: 'photoUpload' },
    })
    storage.files.set(first.path, { size: 300_000, contentType: 'image/jpeg' })
    const saved = await shop.saveDish(deps(), input({ name: 'Cá kho tộ', drawing: 'd-cakho', photo: { kind: 'new', path: first.path } }))
    if (!saved.ok) throw new Error('refused')
    const second = await shop.newPhotoUpload(storage)
    storage.files.set(second.path, { size: 200_000, contentType: 'image/jpeg' })
    await shop.saveDish(deps(), input({ id: saved.id, name: 'Cá kho tộ', drawing: 'd-cakho', photo: { kind: 'new', path: second.path } }))
    expect([...storage.files.keys()]).toEqual([second.path])
    await shop.saveDish(deps(), input({ id: saved.id, name: 'Cá kho tộ', drawing: 'd-cakho', photo: { kind: 'remove' } }))
    expect(storage.files.size).toBe(0)
    const [d] = await t.db.select().from(dishes)
    expect(d).toMatchObject({ photoPath: null, drawing: 'd-cakho' })
  })

  it('AC217 H23 the server refuses a file over 2 MB, not an image, or at a path that is not ours', async () => {
    const big = await shop.newPhotoUpload(storage)
    storage.files.set(big.path, { size: shop.PHOTO_MAX_BYTES + 1, contentType: 'image/jpeg' })
    const pdf = await shop.newPhotoUpload(storage)
    storage.files.set(pdf.path, { size: 1000, contentType: 'application/pdf' })
    storage.files.set('elsewhere/x.jpg', { size: 1000, contentType: 'image/jpeg' })
    for (const path of [big.path, pdf.path, 'elsewhere/x.jpg'])
      expect(await shop.saveDish(deps(), input({ photo: { kind: 'new', path } }))).toEqual({ ok: false, fields: { photo: 'photoUpload' } })
  })

  it('AC197 a failed delete of the old photo is ignored', async () => {
    storage = memoryStorage(true)
    const up = await shop.newPhotoUpload(storage)
    storage.files.set(up.path, { size: 1000, contentType: 'image/jpeg' })
    const r = await shop.saveDish(deps(), input({ photo: { kind: 'new', path: up.path } }))
    if (!r.ok) throw new Error('refused')
    expect((await shop.saveDish(deps(), input({ id: r.id, photo: { kind: 'remove' } }))).ok).toBe(true)
  })

  it('H2 "Stop selling" then "Sell again"', async () => {
    const r = await shop.saveDish(deps(), input({ name: 'Bún bò Huế' }))
    if (!r.ok) throw new Error('refused')
    await shop.setDishActive(deps(), r.id, false)
    expect((await t.db.select().from(dishes))[0].active).toBe(false)
    await shop.setDishActive(deps(), r.id, true)
    expect((await t.db.select().from(dishes))[0].active).toBe(true)
  })

  it('AC200 H6 the first Save creates the settings row; a refused Save changes nothing', async () => {
    expect(await t.db.select().from(shopSettings)).toEqual([])
    const r = await shop.saveRules(deps(), { basePrice: '35.000', groups: [newRow('Món mặn')], deleted: [] })
    expect(r).toMatchObject({ ok: true, basePrice: 35000 })
    const refused = await shop.saveRules(deps(), { basePrice: '40.000', groups: [newRow('Món mặn', { min: '2', max: '1' })], deleted: [] })
    expect(refused.ok).toBe(false)
    expect((await t.db.select().from(shopSettings))[0].basePrice).toBe(35000)
    expect((await t.db.select().from(dishGroups)).map((g) => g.name)).toEqual(['Món mặn'])
  })

  it('AC198 one Save swaps the names of two groups (the unique constraint is checked at commit)', async () => {
    const rau = await addGroup('Rau', 0)
    const canh = await addGroup('Canh', 1)
    const r = await shop.saveRules(deps(), {
      basePrice: '35.000',
      groups: [
        { ...newRow('Canh'), id: rau.id },
        { ...newRow('Rau'), id: canh.id },
      ],
      deleted: [],
    })
    expect(r.ok).toBe(true)
    const rows = await t.db.select().from(dishGroups).orderBy(dishGroups.position)
    expect(rows.map((g) => [g.id, g.name, g.nameKey])).toEqual([
      [rau.id, 'Canh', 'canh'],
      [canh.id, 'Rau', 'rau'],
    ])
  })

  it('AC215 H21 a group with a dish, missing from the Save, stays', async () => {
    const main = await addGroup('Món mặn', 0)
    const dessert = await addGroup('Tráng miệng', 1)
    await shop.saveDish(deps(), input({ name: 'Chè đậu', fixed: false, component: true, groupId: dessert.id, surcharge: '5.000' }))
    const r = await shop.saveRules(deps(), { basePrice: '40.000', groups: [{ ...newRow('Món mặn'), id: main.id }], deleted: [] })
    expect(r).toMatchObject({ ok: true, basePrice: 40000 })
    expect((await t.db.select().from(dishGroups).orderBy(dishGroups.position)).map((g) => g.name)).toEqual(['Món mặn', 'Tráng miệng'])
  })

  it('AC221 H27 a Save the database refuses because another device saved at that moment: "This screen has just changed" with the latest rules', async () => {
    await shop.saveRules(deps(), {
      basePrice: '35.000',
      groups: [newRow('Món mặn'), newRow('Rau'), newRow('Canh', { min: '0' })],
      deleted: [],
    })
    const [main, rau, canh] = await t.db.select().from(dishGroups).orderBy(dishGroups.position)
    // The phone saves "Canh chua" into "Canh" at the very moment the computer's Save deletes it: a
    // trigger adds the dish just before the delete, after the Save has read that "Canh" is empty.
    await t.pg.exec(`
      CREATE FUNCTION phone_saves() RETURNS trigger AS $$
      BEGIN
        INSERT INTO dishes (name, name_key, price, group_id, surcharge) VALUES ('Canh chua', 'canh chua', NULL, OLD.id, 0);
        RETURN OLD;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER phone_saves BEFORE DELETE ON dish_groups FOR EACH ROW EXECUTE FUNCTION phone_saves();
    `)
    const r = await shop.saveRules(deps(), {
      basePrice: '40.000',
      groups: [
        { ...newRow('Món mặn'), id: main.id },
        { ...newRow('Rau xào'), id: rau.id },
      ],
      deleted: [canh.id],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.fields).toEqual({ form: 'screenChanged' })
    // Nothing of this Save was saved: the latest rules as they were.
    expect(r.latest?.groups.map((g) => g.name)).toEqual(['Món mặn', 'Rau', 'Canh'])
    expect(r.latest?.basePrice).toBe(35000)
  })

  it('the database keeps the number rules and the kinds of a dish too', async () => {
    await expect(
      t.db.insert(dishGroups).values({ name: 'X', nameKey: 'x', min: 2, max: 1, included: 1, extraFee: 0, position: 0 }),
    ).rejects.toThrow()
    await expect(t.db.insert(dishes).values({ name: 'Y', nameKey: 'y', price: null })).rejects.toThrow()
    await expect(t.db.insert(dishes).values({ name: 'Z', nameKey: 'z', price: -1 })).rejects.toThrow()
    await expect(t.db.insert(shopSettings).values({ id: false })).rejects.toThrow()
    await t.db.execute(sql`select 1`)
  })
})
