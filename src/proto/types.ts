// Prototype data model, following docs/spec.md section 3. Fake data only, no backend.

export type Lang = 'vi' | 'en'

/** A calendar date in Asia/Ho_Chi_Minh, as YYYY-MM-DD. */
export type DateStr = string

export type Building = {
  id: string
  name: string
  address: string
  /** Minutes after midnight, Vietnam time (BR-18). */
  /** Current delivery time, minutes after midnight, Vietnam time (BR-18). */
  deliveryTime: number | null
  /** Earlier times kept for days already past their cutoff when the time changed: used up to and including `until`. */
  past: { until: DateStr; time: number | null }[]
  state: 'approved' | 'pending' | 'declined'
  proposedBy: string | null
}

export type DishGroup = {
  id: string
  name: string
  min: number
  max: number
  included: number
  extraFee: number
}

export type Dish = {
  id: string
  name: string
  description: string
  /** Optional English name and description, shown when the interface is in English (CN-31). */
  nameEn?: string
  descriptionEn?: string
  /** Price as a fixed dish; null when not sold as one (BR-1). */
  price: number | null
  /** Group as a build-your-own component; null when not a component. */
  groupId: string | null
  surcharge: number
}

export type ServiceDay = {
  date: DateStr
  /** Null = no menu yet (BR-3). */
  menu: { fixed: string[]; components: string[] } | null
  /** Cutoff override in minutes; null = default cutoff (BR-4). */
  cutoff: number | null
  closed: boolean
}

export type Customer = {
  id: string
  name: string
  phone: string
  buildingId: string
}

export type FixedLine = { id: string; kind: 'fixed'; dishId: string; qty: number; unitPrice: number }
export type PlateLine = { id: string; kind: 'plate'; picks: string[]; qty: number; unitPrice: number }
export type Line = FixedLine | PlateLine
export type NewLine = Omit<FixedLine, 'id'> | Omit<PlateLine, 'id'>

export type Status = 'placed' | 'confirmed' | 'preparing' | 'delivering' | 'delivered' | 'rejected' | 'cancelled'
export type PaymentState = 'unpaid' | 'reported' | 'paid' | 'underpaid'
export type RefundReason = 'cancel' | 'edit' | 'reject' | 'closedDay' | 'building'

export type Refund = {
  id: string
  amount: number
  reason: RefundReason
  /** Demo time of the shop's "refunded" mark; null while Needs refund. */
  refundedAt: string | null
}

export type StatusEntry = { kind: 'status'; status: Status; at: string }

/** One change inside a saved edit (CN-32). Lines are copied so the history survives later edits. */
export type EditChange =
  | { type: 'added'; line: Line }
  | { type: 'removed'; line: Line }
  | { type: 'qty'; line: Line; from: number; to: number }
  | { type: 'building'; from: string; to: string }
  | { type: 'note'; from: string; to: string }

export type EditEntry = { kind: 'edit'; at: string; fromTotal: number; toTotal: number; changes: EditChange[] }

export type HistoryEntry = StatusEntry | EditEntry

/** Where the customer wants a refund sent, entered per order (CN-33). */
export type RefundTo =
  | { kind: 'account'; bank: string; account: string; holder: string }
  | { kind: 'qr'; image: string }

/** An edit in progress: all changes are saved together with one "Save" (CN-29). */
export type EditDraft = { lines: Line[]; buildingId: string; note: string }

export type Order = {
  id: string
  code: string
  customerId: string
  date: DateStr
  buildingId: string
  note: string
  lines: Line[]
  status: Status
  /** Money the shop confirmed it received, before refunds. */
  received: number
  /** The customer tapped "I have transferred" and the shop has not confirmed since. */
  reported: boolean
  refunds: Refund[]
  /** Kept at the cutoff review (CN-18). */
  kept: boolean
  history: HistoryEntry[]
  shopNote: string
  refundTo: RefundTo | null
}

export type Settings = {
  defaultCutoff: number
  bank: { name: string; account: string; holder: string }
  basePrice: number
}

export type Clock = {
  today: DateStr
  /** Minutes after midnight, Vietnam time. */
  minutes: number
}

export type State = {
  version: 2
  lang: Lang
  clock: Clock
  me: string
  settings: Settings
  groups: DishGroup[]
  dishes: Dish[]
  days: ServiceDay[]
  buildings: Building[]
  customers: Customer[]
  orders: Order[]
  /** One cart per service day (BR-11a). */
  carts: Record<DateStr, Line[]>
  /** Edits in progress, by order id (CN-29). */
  drafts: Record<string, EditDraft>
  /** Day the shop screens show (prototype navigation only). */
  shopDay: DateStr
  seq: number
}
