// Prototype-only state (B24): the domain State plus what only the clickable prototype keeps in localStorage.
import type { DateStr, EditDraft, State } from '@/domain/types'

export type ProtoState = State & {
  /** Storage format version of the saved prototype data. */
  version: 4
  /** Edits in progress, by order id (CN-29). */
  drafts: Record<string, EditDraft>
  /** Day the shop screens show (prototype navigation only). */
  shopDay: DateStr
  /** Counter behind the prototype's readable ids (o12, l3, …) (B30). */
  seq: number
}
