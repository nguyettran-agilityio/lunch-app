'use client'

// Prototype store: the whole fake state lives in this browser's localStorage (no backend).
import { useSyncExternalStore } from 'react'
import type { ErrorCode, Result } from './logic'
import { seed } from './seed'
import { vietnamNow } from './time'
import type { State } from './types'

const KEY = 'lunch-prototype-v3'

let state: State | null = null
let lastError: { code: ErrorCode; at: number } | null = null
const listeners = new Set<() => void>()

function freshState(): State {
  const { today } = vietnamNow(new Date())
  return seed(today)
}

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (parsed.version === 2) return parsed
    }
  } catch {
    // Storage blocked or broken: start from the fake data.
  }
  return freshState()
}

function save(next: State) {
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

function getSnapshot(): State {
  if (state === null) state = load()
  return state
}

const getServerSnapshot = (): State | null => null

/** Null during server rendering and hydration; the stored state afterwards. */
export function useProto(): State | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function setState(next: State) {
  state = next
  save(next)
  emit()
}

/** Run an action; on error remember it so the shell can show a message. Returns the result. */
export function run(action: (s: State) => Result): Result {
  const r = action(getSnapshot())
  if (r.ok) {
    lastError = null
    setState(r.state)
  } else {
    lastError = { code: r.error, at: Date.now() }
    emit()
  }
  return r
}

export function update(fn: (s: State) => State) {
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
  lastError = null
  emit()
}
