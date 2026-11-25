'use client'

// Prototype store: the whole fake state lives in this browser's localStorage (no backend).
// Screens reach it only through the prototype provider (ProtoProvider.tsx); the shell and demo bar use it directly.
import { useSyncExternalStore } from 'react'
import type { ErrorCode } from '@/domain/logic'
import { vietnamNow } from '@/domain/time'
import { seed } from './seed'
import type { ProtoState } from './types'

const KEY = 'lunch-prototype-v5'

let state: ProtoState | null = null
let lastError: { code: ErrorCode; at: number } | null = null
const listeners = new Set<() => void>()

function freshState(): ProtoState {
  const { today } = vietnamNow(new Date())
  return seed(today)
}

function load(): ProtoState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ProtoState
      if (parsed.version === 4) return parsed
    }
  } catch {
    // Storage blocked or broken: start from the fake data.
  }
  return freshState()
}

function save(next: ProtoState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Not persisted; the prototype still works for this visit.
  }
}

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): ProtoState {
  if (state === null) state = load()
  return state
}

const getServerSnapshot = (): ProtoState | null => null

/** Null during server rendering and hydration; the stored state afterwards. */
export function useProto(): ProtoState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function setState(next: ProtoState) {
  state = next
  save(next)
  emit()
}

/** Remember an action's error so the shell can show a message; null clears it. */
export function setLastError(code: ErrorCode | null) {
  lastError = code === null ? null : { code, at: Date.now() }
  emit()
}

export function update(fn: (s: ProtoState) => ProtoState) {
  setState(fn(getSnapshot()))
}

export function resetData() {
  const current = getSnapshot()
  setState({ ...freshState(), lang: current.lang })
}

export function useLastError() {
  return useSyncExternalStore(
    subscribe,
    () => lastError,
    () => null,
  )
}

export function clearError() {
  setLastError(null)
}
