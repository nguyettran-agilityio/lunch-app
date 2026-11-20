'use client'

import { messages, money } from './i18n'
import { useProto } from './store'

/** State, messages and money formatting for screens rendered inside AppShell (state is loaded there). */
export function useApp() {
  const s = useProto()
  if (!s) throw new Error('Prototype state is not loaded; render inside AppShell')
  const m = messages[s.lang]
  return { s, m, money: (v: number) => money(v, s.lang) }
}
