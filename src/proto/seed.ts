import { addDays, stamp } from './time'
import type { DateStr, Line, Order, State, Status } from './types'

// Fixed fake data for the prototype (decision P2). Dish, group and building names are
// shop-entered content and stay as entered in both languages (CN-8).

const DEFAULT_CUTOFF = 9 * 60 + 30

export function orderCode(date: DateStr, n: number): string {
  // "LA" + MMDD + sequence for that day, letters and digits only (CN-20).
  return `LA${date.slice(5, 7)}${date.slice(8, 10)}${String(n).padStart(3, '0')}`
}

export function seed(today: DateStr, minutes = 9 * 60): State {
  const d = (n: number) => addDays(today, n)
  let lineSeq = 0
  const fixed = (dishId: string, qty: number, unitPrice: number): Line => ({
    id: `l${++lineSeq}`,
    kind: 'fixed',
    dishId,
    qty,
    unitPrice,
  })
  const plate = (picks: string[], qty: number, unitPrice: number): Line => ({
    id: `l${++lineSeq}`,
    kind: 'plate',
    picks,
    qty,
    unitPrice,
  })
  const perDay = new Map<string, number>()
  const order = (
    customerId: string,
    date: DateStr,
    buildingId: string,
    lines: Line[],
    status: Status,
    opts: Partial<Pick<Order, 'received' | 'reported' | 'refunds' | 'note'>> = {},
  ): Order => {
    const n = (perDay.get(date) ?? 0) + 1
    perDay.set(date, n)
    const flow: Status[] = ['placed', 'confirmed', 'preparing']
    const path: Status[] = status === 'cancelled' ? ['placed', 'confirmed', 'cancelled'] : flow.slice(0, flow.indexOf(status) + 1)
    return {
      id: `o-${date}-${n}`,
      code: orderCode(date, n),
      customerId,
      date,
      buildingId,
      note: opts.note ?? '',
      lines,
      status,
      received: opts.received ?? 0,
      reported: opts.reported ?? false,
      refunds: opts.refunds ?? [],
      kept: false,
      history: path.map((s, i) => ({ kind: 'status' as const, status: s, at: stamp(addDays(today, -1), 17 * 60 + i * 20) })),
      shopNote: '',
      refundTo: null,
    }
  }

  return {
    version: 2,
    lang: 'vi',
    clock: { today, minutes },
    me: 'c1',
    settings: {
      defaultCutoff: DEFAULT_CUTOFF,
      bank: { name: 'Vietcombank', account: '0071000123456', holder: 'QUAN COM LA' },
      basePrice: 35000,
    },
    groups: [
      { id: 'g-main', name: 'Món mặn', min: 1, max: 2, included: 1, extraFee: 10000 },
      { id: 'g-veg', name: 'Rau', min: 1, max: 1, included: 1, extraFee: 0 },
      { id: 'g-soup', name: 'Canh', min: 0, max: 1, included: 1, extraFee: 0 },
    ],
    // A fixed dish is one complete meal for one person; its description says what comes with it (CN-30).
    // Some dishes have an English name (CN-31); the others show the Vietnamese name in English too.
    dishes: [
      { id: 'd-suon', name: 'Sườn ram mặn ngọt', nameEn: 'Caramelised pork ribs', description: 'Kèm cơm trắng, canh rau. Sườn non ram nước mắm, hành phi', descriptionEn: 'With steamed rice and vegetable soup. Pork ribs in fish sauce caramel, fried shallots', price: 45000, groupId: 'g-main', surcharge: 5000 },
      { id: 'd-thitkho', name: 'Thịt kho trứng', nameEn: 'Braised pork belly with egg', description: 'Kèm cơm trắng, dưa cải. Ba chỉ kho nước dừa, trứng vịt', descriptionEn: 'With steamed rice and pickled greens. Pork belly braised in coconut water, duck egg', price: 40000, groupId: 'g-main', surcharge: 0 },
      { id: 'd-cakho', name: 'Cá basa kho tộ', nameEn: 'Clay-pot braised catfish', description: 'Kho tiêu, nước màu nhà làm', price: null, groupId: 'g-main', surcharge: 5000 },
      { id: 'd-trung', name: 'Trứng chiên', nameEn: 'Fried egg', description: 'Trứng gà chiên hành lá', price: null, groupId: 'g-main', surcharge: 0 },
      { id: 'd-ga', name: 'Gà xào sả ớt', nameEn: 'Lemongrass chilli chicken', description: 'Đùi gà, sả, ớt sừng', price: null, groupId: 'g-main', surcharge: 5000 },
      { id: 'd-dauhu', name: 'Đậu hũ sốt cà', description: 'Đậu non, cà chua, hành lá', price: null, groupId: 'g-main', surcharge: 0 },
      { id: 'd-raumuong', name: 'Rau muống xào tỏi', nameEn: 'Garlic water spinach', description: '', price: null, groupId: 'g-veg', surcharge: 0 },
      { id: 'd-caithia', name: 'Cải thìa luộc', description: 'Chấm nước mắm tỏi', price: null, groupId: 'g-veg', surcharge: 0 },
      { id: 'd-susu', name: 'Su su xào', description: '', price: null, groupId: 'g-veg', surcharge: 0 },
      { id: 'd-canhchua', name: 'Canh chua cá', nameEn: 'Sour fish soup', description: '', price: null, groupId: 'g-soup', surcharge: 0 },
      { id: 'd-canhbi', name: 'Canh bí đỏ', description: '', price: null, groupId: 'g-soup', surcharge: 0 },
      { id: 'd-bunbo', name: 'Bún bò Huế', nameEn: 'Hue beef noodle soup', description: 'Một tô bún: giò heo, chả cua, rau sống', descriptionEn: 'One bowl of noodles: pork knuckle, crab cake, fresh herbs', price: 45000, groupId: null, surcharge: 0 },
      { id: 'd-comga', name: 'Cơm gà Hội An', nameEn: 'Hoi An chicken rice', description: 'Cơm nghệ, gà ta xé, đồ chua', descriptionEn: 'Turmeric rice, shredded chicken, pickles', price: 45000, groupId: null, surcharge: 0 },
      { id: 'd-buncha', name: 'Bún chả', description: 'Kèm bún, rau sống. Chả nướng than, nước chấm chua ngọt', price: 40000, groupId: null, surcharge: 0 },
    ],
    days: [
      {
        date: d(0),
        menu: {
          fixed: ['d-suon', 'd-thitkho', 'd-bunbo', 'd-comga', 'd-buncha'],
          components: ['d-suon', 'd-thitkho', 'd-cakho', 'd-trung', 'd-raumuong', 'd-caithia', 'd-susu', 'd-canhchua'],
        },
        cutoff: null,
        closed: false,
      },
      {
        date: d(1),
        menu: {
          fixed: ['d-thitkho', 'd-comga', 'd-buncha'],
          components: ['d-ga', 'd-dauhu', 'd-trung', 'd-raumuong', 'd-susu', 'd-canhbi'],
        },
        cutoff: null,
        closed: false,
      },
      {
        date: d(2),
        menu: {
          fixed: ['d-suon', 'd-bunbo'],
          components: ['d-suon', 'd-cakho', 'd-dauhu', 'd-caithia', 'd-raumuong', 'd-canhchua'],
        },
        cutoff: 10 * 60,
        closed: false,
      },
      {
        date: d(3),
        menu: {
          fixed: ['d-thitkho', 'd-buncha', 'd-comga'],
          components: ['d-thitkho', 'd-ga', 'd-trung', 'd-susu', 'd-caithia', 'd-canhbi'],
        },
        cutoff: null,
        closed: false,
      },
      { date: d(4), menu: null, cutoff: null, closed: false },
      { date: d(5), menu: null, cutoff: null, closed: true },
      { date: d(6), menu: null, cutoff: null, closed: false },
    ],
    buildings: [
      { id: 'b-bitexco', name: 'Bitexco Financial Tower', address: '2 Hải Triều, Q.1', deliveryTime: 11 * 60 + 30, state: 'approved', proposedBy: null, past: [] },
      { id: 'b-viettel', name: 'Viettel Complex', address: '285 Cách Mạng Tháng 8, Q.10', deliveryTime: 11 * 60 + 45, state: 'approved', proposedBy: null, past: [] },
      { id: 'b-etown', name: 'Etown 1', address: '364 Cộng Hòa, Tân Bình', deliveryTime: 12 * 60, state: 'approved', proposedBy: null, past: [] },
      { id: 'b-pearl', name: 'Pearl Plaza', address: '561A Điện Biên Phủ, Bình Thạnh', deliveryTime: null, state: 'pending', proposedBy: 'c5', past: [] },
    ],
    customers: [
      { id: 'c1', name: 'Minh Anh', phone: '0901 234 567', buildingId: 'b-bitexco' },
      { id: 'c2', name: 'Trần Văn Bình', phone: '0912 345 678', buildingId: 'b-bitexco' },
      { id: 'c3', name: 'Lê Thu Hà', phone: '0933 456 789', buildingId: 'b-viettel' },
      { id: 'c4', name: 'Phạm Quốc Huy', phone: '0944 567 890', buildingId: 'b-viettel' },
      { id: 'c5', name: 'Nguyễn Lan', phone: '0955 678 901', buildingId: 'b-pearl' },
      { id: 'c6', name: 'Võ Thanh Tâm', phone: '0966 789 012', buildingId: 'b-etown' },
      { id: 'c7', name: 'Đỗ Hải Yến', phone: '0977 890 123', buildingId: 'b-etown' },
    ],
    orders: [
      order('c1', d(0), 'b-bitexco', [plate(['d-suon', 'd-raumuong', 'd-canhchua'], 1, 40000)], 'confirmed', { received: 40000, note: 'Tầng 21, phòng 2103' }),
      order('c2', d(0), 'b-bitexco', [fixed('d-bunbo', 1, 45000)], 'placed', { reported: true, note: 'Tầng 15' }),
      order('c3', d(0), 'b-viettel', [fixed('d-comga', 2, 45000)], 'confirmed', { received: 90000 }),
      order('c4', d(0), 'b-viettel', [plate(['d-thitkho', 'd-trung', 'd-caithia'], 1, 45000)], 'confirmed', { note: 'Lễ tân tầng trệt' }),
      order('c5', d(0), 'b-pearl', [fixed('d-buncha', 1, 40000)], 'placed'),
      order('c6', d(0), 'b-etown', [plate(['d-cakho', 'd-susu'], 1, 40000), fixed('d-buncha', 1, 40000)], 'preparing', { received: 80000 }),
      order('c7', d(0), 'b-etown', [fixed('d-thitkho', 1, 40000)], 'placed'),
      order('c2', d(0), 'b-bitexco', [fixed('d-comga', 1, 45000)], 'cancelled', {
        received: 45000,
        refunds: [{ id: 'r1', amount: 45000, reason: 'cancel', refundedAt: null }],
      }),
      order('c3', d(1), 'b-viettel', [plate(['d-ga', 'd-raumuong', 'd-canhbi'], 1, 40000)], 'confirmed', { received: 40000 }),
    ],
    carts: {},
    drafts: {},
    shopDay: today,
    seq: 100,
  }
}
