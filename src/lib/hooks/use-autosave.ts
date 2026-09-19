'use client'

import { useEffect, useRef } from 'react'

/**
 * Saves a form section once the typing stops.
 *
 * A long sheet is filled in over an evening with interruptions, and a character
 * that only exists once somebody remembers to press a button is a character that
 * sometimes does not exist. The explicit save stays: autosave is a safety net,
 * not a replacement for being told the work landed.
 *
 * Deliberately not on every keystroke. A save per character typed would be a
 * write amplification problem and, worse, would make every half-typed number a
 * value the server briefly believed.
 *
 * It does not fire for the value it was mounted with. Opening a sheet and
 * touching nothing should write nothing - otherwise merely reading somebody's
 * character would bump its version and collide with whoever is editing it.
 */
export function useAutosave(input: {
  readonly value: unknown
  readonly onSave: () => void
  readonly delayMs?: number
  readonly enabled?: boolean
}): void {
  const serialized = JSON.stringify(input.value)
  const initial = useRef(serialized)
  const saved = useRef(serialized)
  const onSave = useRef(input.onSave)

  useEffect(() => {
    onSave.current = input.onSave
  }, [input.onSave])

  const delay = input.delayMs ?? 2000
  const enabled = input.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    if (serialized === initial.current || serialized === saved.current) return

    const timer = setTimeout(() => {
      saved.current = serialized
      onSave.current()
    }, delay)

    return () => clearTimeout(timer)
  }, [serialized, delay, enabled])
}
