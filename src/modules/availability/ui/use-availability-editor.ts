'use client'

import { useCallback, useMemo, useState } from 'react'
import { nextState, normalizeRange, rangeFromHour } from '../domain/ranges'
import type { DayRange, SlotState } from '../domain/types'
import { applyPreset, applyPreviousAnswer, type PresetId } from './presets'

/**
 * Interaction state for the availability grid.
 *
 * Everything about how an answer is edited lives here, so the grid component is
 * left with rendering and the behaviour can be reasoned about — and tested —
 * without a DOM.
 *
 * A drag is confined to a single day. That falls out of the model rather than
 * being a restriction imposed on it: the answer is one range per date, so there
 * is no two-dimensional selection to make.
 */
export type DragState = {
  readonly date: string
  readonly anchorHour: number
  readonly currentHour: number
} | null

export type AvailabilityEditor = {
  readonly ranges: ReadonlyMap<string, DayRange>
  readonly isDirty: boolean
  readonly drag: DragState
  /** The range as it would be after the drag in progress; used to preview. */
  rangeFor(date: string): DayRange
  stateAt(date: string, hour: number): SlotState | null
  /** A single click: free from this hour to the end, or cycle if already set there. */
  toggleHour(date: string, hour: number): void
  cycleDay(date: string): void
  /** Sets an exact range, used by the hour controls on narrow screens. */
  setRange(date: string, fromHour: number, toHour: number): void
  beginDrag(date: string, hour: number): void
  extendDrag(hour: number): void
  endDrag(): void
  /** Abandons a drag without committing it; a click is handled separately. */
  cancelDrag(): void
  usePreset(preset: PresetId): void
  useSuggestion(
    byWeekday: readonly { weekday: number; state: SlotState | null; fromHour: number; toHour: number }[],
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
  const [drag, setDrag] = useState<DragState>(null)

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
    (date: string): DayRange => {
      const stored = ranges.get(date) ?? blank(date)

      if (drag?.date !== date) return stored

      // While dragging, the range follows the pointer; the anchor may be either end.
      const from = Math.min(drag.anchorHour, drag.currentHour)
      const to = Math.max(drag.anchorHour, drag.currentHour) + 1

      return {
        date,
        state: stored.state === 'NO' || stored.state === null ? 'YES' : stored.state,
        fromHour: from,
        toHour: to,
      }
    },
    [ranges, drag, blank],
  )

  const stateAt = useCallback(
    (date: string, hour: number): SlotState | null => {
      const range = rangeFor(date)
      if (range.state === null) return null
      if (range.state === 'NO') return 'NO'
      return hour >= range.fromHour && hour < range.toHour ? range.state : null
    },
    [rangeFor],
  )

  /**
   * A click on an hour.
   *
   * The first click on a fresh day means "free from here to the end", which is
   * what people almost always mean; clicking the hour that already starts the
   * range cycles its state instead, so one control expresses every answer.
   */
  const toggleHour = useCallback(
    (date: string, hour: number) => {
      const current = ranges.get(date) ?? blank(date)

      if (current.state === null) {
        put(rangeFromHour(date, hour, input.gridEndHour))
        return
      }

      if (current.state !== 'NO' && current.fromHour === hour) {
        const next = nextState(current.state)
        put(next === null ? blank(date) : { ...current, state: next })
        return
      }

      /*
       * A refusal covers the whole day, so it has no hour to anchor a cycle to
       * and there is no way to tell "clicked the same hour" from "clicked
       * another one". Any click therefore lifts the refusal and leaves the day
       * blank; a second click then answers it. Two predictable steps beat one
       * step whose meaning depends on history the grid cannot show.
       */
      if (current.state === 'NO') {
        put(blank(date))
        return
      }

      put(rangeFromHour(date, hour, input.gridEndHour, current.state))
    },
    [ranges, blank, put, input.gridEndHour],
  )

  /** The day header: cycles the whole day without aiming at an hour. */
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

  const beginDrag = useCallback((date: string, hour: number) => {
    setDrag({ date, anchorHour: hour, currentHour: hour })
  }, [])

  const extendDrag = useCallback((hour: number) => {
    setDrag((current) => (current ? { ...current, currentHour: hour } : null))
  }, [])

  /*
   * Commits outside the state updater. Calling put() from inside setDrag's
   * updater made the commit a side effect of a function React requires to be
   * pure: it could run at an unexpected time or twice, and the range that
   * landed was whichever write happened to be last.
   */
  const endDrag = useCallback(() => {
    if (!drag) return
    put(rangeFor(drag.date))
    setDrag(null)
  }, [drag, put, rangeFor])

  const cancelDrag = useCallback(() => {
    setDrag(null)
  }, [])

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
    drag,
    rangeFor,
    stateAt,
    setRange,
    toggleHour,
    cycleDay,
    beginDrag,
    extendDrag,
    endDrag,
    cancelDrag,
    usePreset: usePresetCallback,
    useSuggestion,
    reset,
    markSaved,
    toArray,
  }
}
