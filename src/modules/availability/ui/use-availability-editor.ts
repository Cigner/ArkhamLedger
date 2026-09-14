'use client'

import { useCallback, useMemo, useState } from 'react'
import { nextState, normalizeRange } from '../domain/ranges'
import type { DayRange, SlotState } from '../domain/types'
import { applyPreset, applyPreviousAnswer, type PresetId } from './presets'

/**
 * Interaction state for answering availability.
 *
 * Everything about how an answer is edited lives here, so the components are
 * left with rendering and the behaviour can be tested without a DOM.
 *
 * The unit of an answer is one evening. Cells offer a fast cycle for the common
 * case; the per-day dialog offers precision. Neither needs a range-painting
 * gesture, which is why there is none: it did not survive the window growing to
 * a month, where a grid wide enough to hold thirty dates squeezes its columns
 * below the point of being aimable.
 */
export type AvailabilityEditor = {
  readonly ranges: ReadonlyMap<string, DayRange>
  readonly isDirty: boolean
  rangeFor(date: string): DayRange
  /** One tap: moves the evening to the next state, keeping any hours already set. */
  cycleDay(date: string): void
  /** Sets firmness without touching the hours. */
  setState(date: string, state: SlotState): void
  setRange(date: string, fromHour: number, toHour: number): void
  setRangeWithState(date: string, state: SlotState, fromHour: number, toHour: number): void
  clearDay(date: string): void
  usePreset(preset: PresetId): void
  useSuggestion(
    byWeekday: readonly {
      weekday: number
      state: SlotState | null
      fromHour: number
      toHour: number
    }[],
  ): void
  reset(): void
  /** Accepts the current answer as saved, so the form stops reporting changes. */
  markSaved(): void
  toArray(): DayRange[]
}

export function useAvailabilityEditor(input: {
  readonly initial: readonly DayRange[]
  readonly dates: readonly string[]
  readonly gridStartHour: number
  readonly gridEndHour: number
}): AvailabilityEditor {
  /*
   * The saved answer, kept in state rather than a ref: it is read during render
   * to decide whether anything has changed, and a ref read at render time is a
   * tearing hazard under concurrent rendering.
   */
  const [baseline, setBaseline] = useState<ReadonlyMap<string, DayRange>>(
    () => new Map(input.initial.map((range) => [range.date, range])),
  )
  const [ranges, setRanges] = useState<Map<string, DayRange>>(() => new Map(baseline))

  const blank = useCallback(
    (date: string): DayRange => ({ date, state: null, fromHour: 0, toHour: 0 }),
    [],
  )

  const put = useCallback(
    (range: DayRange) => {
      setRanges((current) =>
        new Map(current).set(
          range.date,
          normalizeRange(range, input.gridStartHour, input.gridEndHour),
        ),
      )
    },
    [input.gridStartHour, input.gridEndHour],
  )

  const rangeFor = useCallback(
    (date: string): DayRange => ranges.get(date) ?? blank(date),
    [ranges, blank],
  )

  /**
   * One tap on an evening.
   *
   * Cycles free, at a push, not free, blank. Hours already chosen survive the
   * cycle: somebody who set "from eight" and then marks the evening grudging
   * still means from eight.
   */
  const cycleDay = useCallback(
    (date: string) => {
      const current = ranges.get(date) ?? blank(date)
      const next = nextState(current.state)

      if (next === null) {
        put(blank(date))
        return
      }

      put({
        date,
        state: next,
        fromHour: current.state === null ? input.gridStartHour : current.fromHour,
        toHour: current.state === null ? input.gridEndHour : current.toHour,
      })
    },
    [ranges, blank, put, input.gridStartHour, input.gridEndHour],
  )

  const setState = useCallback(
    (date: string, state: SlotState) => {
      const current = ranges.get(date) ?? blank(date)
      put({
        date,
        state,
        fromHour: current.state === null ? input.gridStartHour : current.fromHour,
        toHour: current.state === null ? input.gridEndHour : current.toHour,
      })
    },
    [ranges, blank, put, input.gridStartHour, input.gridEndHour],
  )

  const setRange = useCallback(
    (date: string, fromHour: number, toHour: number) => {
      const current = ranges.get(date)
      put({
        date,
        state: current?.state === 'IF_NEED_BE' ? 'IF_NEED_BE' : 'YES',
        fromHour,
        toHour,
      })
    },
    [ranges, put],
  )

  const setRangeWithState = useCallback(
    (date: string, state: SlotState, fromHour: number, toHour: number) => {
      put({ date, state, fromHour, toHour })
    },
    [put],
  )

  const clearDay = useCallback(
    (date: string) => {
      put(blank(date))
    },
    [blank, put],
  )

  const usePresetCallback = useCallback(
    (preset: PresetId) => {
      const produced = applyPreset({
        preset,
        dates: input.dates,
        gridStartHour: input.gridStartHour,
        gridEndHour: input.gridEndHour,
        usualStartHour: input.gridStartHour,
      })
      setRanges(new Map(produced.map((range) => [range.date, range])))
    },
    [input.dates, input.gridStartHour, input.gridEndHour],
  )

  const useSuggestion = useCallback(
    (
      byWeekday: readonly {
        weekday: number
        state: SlotState | null
        fromHour: number
        toHour: number
      }[],
    ) => {
      const produced = applyPreviousAnswer({ byWeekday, dates: input.dates })
      setRanges(
        new Map(
          produced.map((range) => [
            range.date,
            normalizeRange(range, input.gridStartHour, input.gridEndHour),
          ]),
        ),
      )
    },
    [input.dates, input.gridStartHour, input.gridEndHour],
  )

  const reset = useCallback(() => {
    setRanges(new Map(baseline))
  }, [baseline])

  /*
   * Moves the baseline to what was just written. Without it the form reports
   * unsaved changes forever after the first save, which teaches people to
   * distrust the indicator that exists to reassure them.
   */
  const markSaved = useCallback(() => {
    setBaseline(new Map(ranges))
  }, [ranges])

  const toArray = useCallback(
    () => input.dates.map((date) => ranges.get(date) ?? blank(date)),
    [input.dates, ranges, blank],
  )

  const isDirty = useMemo(() => {
    for (const date of input.dates) {
      const before = baseline.get(date)
      const after = ranges.get(date)
      const normalizedBefore = before?.state ? before : null
      const normalizedAfter = after?.state ? after : null

      if (normalizedBefore === null && normalizedAfter === null) continue
      if (normalizedBefore === null || normalizedAfter === null) return true
      if (
        normalizedBefore.state !== normalizedAfter.state ||
        normalizedBefore.fromHour !== normalizedAfter.fromHour ||
        normalizedBefore.toHour !== normalizedAfter.toHour
      ) {
        return true
      }
    }
    return false
  }, [input.dates, ranges, baseline])

  return {
    ranges,
    isDirty,
    rangeFor,
    cycleDay,
    setState,
    setRange,
    setRangeWithState,
    clearDay,
    usePreset: usePresetCallback,
    useSuggestion,
    reset,
    markSaved,
    toArray,
  }
}
