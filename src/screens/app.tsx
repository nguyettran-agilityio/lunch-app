'use client'

// The one interface screens use for data and actions (plan.md section 1.2, B2, B23).
// A provider fills it: the prototype provider (src/proto/ProtoProvider.tsx) from localStorage today,
// the real provider from the server later. Screens never read a store directly.
import { createContext, useContext } from 'react'
import type { ErrorCode } from '@/domain/logic'
import type { Messages } from '@/domain/i18n'
import type {
  Clock,
  DateStr,
  EditDraft,
  Lang,
  Line,
  NewLine,
  Order,
  PlateLine,
  RefundMethod,
  RefundReason,
  RefundTo,
  State,
} from '@/domain/types'

export type ActionResult = { ok: true; id?: string; order?: Order } | { ok: false; error: ErrorCode }
type Act<A extends unknown[]> = (...args: A) => Promise<ActionResult>

/** Named actions with the arguments of the logic.ts functions, without the state and id generator. Each returns a Promise (B23). */
export type Actions = {
  addToCart: Act<[date: DateStr, line: NewLine]>
  setCartQty: Act<[date: DateStr, lineId: string, qty: number]>
  proposeBuilding: Act<[name: string, address: string]>
  placeOrder: Act<[date: DateStr, buildingId: string, note: string]>
  reportTransfer: Act<[id: string]>
  cancelOrder: Act<[id: string]>
  /** Saves the edit in progress; the result carries the order after the edit. */
  editOrder: Act<[id: string, lines: Line[], buildingId: string, note: string]>
  startEdit: Act<[id: string]>
  setDraft: Act<[id: string, draft: EditDraft]>
  discardEdit: Act<[id: string]>
  addPlateToDraft: Act<[id: string, plate: Omit<PlateLine, 'id'>]>
  setRefundTo: Act<[id: string, to: RefundTo]>
  confirmOrder: Act<[id: string]>
  confirmPayment: Act<[id: string, reportId?: string]>
  reportNotReceived: Act<[id: string, reportId: string]>
  rejectOrder: Act<[id: string, reason?: RefundReason]>
  keepOrder: Act<[id: string]>
  startPreparing: Act<[ids: string[]]>
  markDelivering: Act<[ids: string[]]>
  markDelivered: Act<[ids: string[], note?: string]>
  markRefunded: Act<[orderId: string, refundId: string, method?: RefundMethod]>
  giveCashBack: Act<[id: string]>
  seeRefundReminder: Act<[]>
  addBuilding: Act<[name: string, address: string, deliveryTime: number]>
  approveBuilding: Act<[id: string, deliveryTime: number]>
  setDeliveryTime: Act<[id: string, deliveryTime: number]>
  declineBuilding: Act<[id: string]>
  setShopDay: Act<[date: DateStr]>
  setLang: Act<[lang: Lang]>
}

export type AppValue = {
  s: State
  m: Messages
  money: (v: number) => string
  now: Clock
  /** Day the shop screens show (B35). */
  shopDay: DateStr
  /** Edits in progress, by order id (CN-29, B35). */
  drafts: Record<string, EditDraft>
  /** A path of the app with the provider's base path in front: '/proto' in the prototype (B34). */
  href: (path: string) => string
  /** A path as the screens know it, with the base path taken off (for matching the current page). */
  route: (pathname: string) => string
}

export const AppContext = createContext<AppValue | null>(null)
export const ActionsContext = createContext<(Actions & { pending: boolean }) | null>(null)

export function useApp(): AppValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('No app data: render inside a provider')
  return v
}

/** The actions, and `pending` while one runs: screens disable their action buttons then (B32). */
export function useActions(): Actions & { pending: boolean } {
  const v = useContext(ActionsContext)
  if (!v) throw new Error('No app actions: render inside a provider')
  return v
}
