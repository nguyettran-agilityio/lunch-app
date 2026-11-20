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

/** How a refund is given back (CN-54). */
export type RefundMethod = 'transfer' | 'cash'

export type Refund = {
  id: string
  amount: number
  reason: RefundReason
  /** Demo time it was recorded as Needs refund; the reminder starts one hour later (CN-53). */
  createdAt: string
  /** Demo time of the shop's "refunded" mark; null while Needs refund. */
  refundedAt: string | null
  /** How the shop actually refunded it (CN-54); null while Needs refund. */
  method: RefundMethod | null
}

/** One tap on "I have transferred", kept apart from the others so the shop answers each (CN-43). */
export type TransferReport = { id: string; amount: number; at: string }

export type StatusEntry = { kind: 'status'; status: Status; at: string }

/** One change inside a saved edit (CN-32). Lines are copied so the history survives later edits. */
export type EditChange =
  | { type: 'added'; line: Line }
  | { type: 'removed'; line: Line }
  | { type: 'qty'; line: Line; from: number; to: number }
  | { type: 'building'; from: string; to: string }
  | { type: 'note'; from: string; to: string }

export type EditEntry = { kind: 'edit'; at: string; fromTotal: number; toTotal: number; changes: EditChange[] }

/** The shop did not find a reported transfer in its bank statement (CN-41). */
export type ReportMissingEntry = { kind: 'reportMissing'; at: string; amount: number }

export type HistoryEntry = StatusEntry | EditEntry | ReportMissingEntry

/** How the customer wants a refund, entered per order: bank transfer (CN-33) or cash at delivery (CN-54). */
export type RefundTo =
  | { kind: 'account'; bank: string; account: string; holder: string }
  | { kind: 'qr'; image: string }
  | { kind: 'cash' }

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
  /**
   * Transfers the customer reported with "I have transferred" that the shop has not confirmed or turned
   * down yet, one per tap (CN-37, CN-43). Kept across edits and after the order is cancelled or rejected (CN-39).
   */
  reports: TransferReport[]
  /** Reports the shop said it had not received, one amount each, shown to the customer (CN-41, CN-43, CN-46). */
  missing: number[]
  /** Why the order was cancelled or rejected, for a refund recorded later (CN-39). */
  endReason: RefundReason | null
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
  version: 4
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
  /** Demo time the shop tapped "Seen" on the refund reminder; hidden for one hour after (CN-53). */
  refundReminderSeen: string | null
  seq: number
}
