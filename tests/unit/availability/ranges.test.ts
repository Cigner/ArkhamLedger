import { describe, expect, it } from 'vitest'
import {
  cellsToRanges,
  nextState,
  normalizeRange,
  rangeFromHour,
  rangeIsLongEnough,
  rangeToCells,
} from '@/modules/availability/domain/ranges'
import type { AvailabilityCell, DayRange } from '@/modules/availability/domain/types'

/**
 * Range and cell conversion.
 *
 * The boundary between how people answer and how the data is stored. A mistake
 * here is silent: the answer looks right on screen and reaches the algorithm
 * wrong, or survives a save and comes back subtly different.
 */
const DATE = '2026-10-08'

/** Grid slots for one evening, 16:00–24:00 in a zone two hours ahead of UTC. */
const SLOTS = Array.from({ length: 8 }, (_, index) => ({
  slotStartUtc: `2026-10-08T${String(14 + index).padStart(2, '0')}:00:00Z`,
  localHour: 16 + index,
}))

function range(overrides: Partial<DayRange> = {}): DayRange {
  return { date: DATE, state: 'YES', fromHour: 18, toHour: 24, ...overrides }
}

describe('rangeToCells', () => {
  it('covers exactly the hours in the range', () => {
    const cells = rangeToCells(range(), SLOTS)

    expect(cells).toHaveLength(6)
    expect(cells.map((cell) => cell.localHour)).toEqual([18, 19, 20, 21, 22, 23])
    expect(cells.every((cell) => cell.state === 'YES')).toBe(true)
  })

  it('produces nothing for an unanswered day', () => {
    expect(rangeToCells(range({ state: null }), SLOTS)).toEqual([])
  })

  /*
   * A refusal is about the date, not the hours: somebody who cannot make
   * Tuesday cannot make any part of it.
   */
  it('covers the whole day for a refusal', () => {
    const cells = rangeToCells(range({ state: 'NO', fromHour: 0, toHour: 0 }), SLOTS)

    expect(cells).toHaveLength(8)
    expect(cells.every((cell) => cell.state === 'NO')).toBe(true)
  })

  it('keeps the instant each cell begins at', () => {
    const cells = rangeToCells(range({ fromHour: 16, toHour: 17 }), SLOTS)
    expect(cells[0]?.slotStartUtc).toBe('2026-10-08T14:00:00Z')
  })
})

describe('cellsToRanges', () => {
  function cells(hours: readonly number[], state: AvailabilityCell['state']): AvailabilityCell[] {
    return hours.map((hour) => ({
      slotStartUtc: `2026-10-08T${String(hour - 2).padStart(2, '0')}:00:00Z`,
      localDate: DATE,
      localHour: hour,
      state,
    }))
  }

  it('round-trips a range unchanged', () => {
    const original = range({ fromHour: 18, toHour: 24 })
    const restored = cellsToRanges(rangeToCells(original, SLOTS), [DATE])

    expect(restored[0]).toEqual(original)
  })

  it('round-trips a refusal unchanged', () => {
    const original = range({ state: 'NO', fromHour: 0, toHour: 0 })
    const restored = cellsToRanges(rangeToCells(original, SLOTS), [DATE])

    expect(restored[0]).toEqual(original)
  })

  it('reports an unanswered day for a date with no cells', () => {
    expect(cellsToRanges([], [DATE])[0]).toEqual({
      date: DATE,
      state: null,
      fromHour: 0,
      toHour: 0,
    })
  })

  /*
   * Data the current interface cannot produce, but earlier versions or a direct
   * write could. Taking the outer bounds loses a gap no session could have used;
   * dropping the answer entirely would lose the part that was useful.
   */
  it('collapses a fragmented answer to its outer bounds', () => {
    const fragmented = [...cells([16, 17], 'YES'), ...cells([21, 22, 23], 'YES')]

    expect(cellsToRanges(fragmented, [DATE])[0]).toEqual({
      date: DATE,
      state: 'YES',
      fromHour: 16,
      toHour: 24,
    })
  })

  it('lets a positive answer outrank a refusal on the same day', () => {
    const mixed = [...cells([16], 'NO'), ...cells([18, 19, 20, 21, 22, 23], 'YES')]

    expect(cellsToRanges(mixed, [DATE])[0]).toMatchObject({ state: 'YES', fromHour: 18 })
  })

  it('prefers a definite answer over a grudging one', () => {
    const mixed = [...cells([16, 17], 'IF_NEED_BE'), ...cells([18, 19], 'YES')]

    expect(cellsToRanges(mixed, [DATE])[0]).toMatchObject({
      state: 'YES',
      fromHour: 18,
      toHour: 20,
    })
  })

  it('returns one entry per requested date, in order', () => {
    const ranges = cellsToRanges(cells([18, 19], 'YES'), ['2026-10-07', DATE, '2026-10-09'])

    expect(ranges.map((entry) => entry.date)).toEqual(['2026-10-07', DATE, '2026-10-09'])
    expect(ranges[0]?.state).toBeNull()
    expect(ranges[1]?.state).toBe('YES')
  })
})

describe('rangeIsLongEnough', () => {
  /*
   * Surfaced while answering rather than only enforced by the algorithm: four
   * hours marked on a six-hour session looks like help and is not.
   */
  it('rejects a range shorter than the session needs', () => {
    expect(rangeIsLongEnough(range({ fromHour: 20, toHour: 24 }), 6)).toBe(false)
  })

  it('accepts a range exactly as long as the minimum', () => {
    expect(rangeIsLongEnough(range({ fromHour: 18, toHour: 24 }), 6)).toBe(true)
  })

  it('never complains about a refusal or a blank day', () => {
    expect(rangeIsLongEnough(range({ state: 'NO', fromHour: 0, toHour: 0 }), 6)).toBe(true)
    expect(rangeIsLongEnough(range({ state: null, fromHour: 0, toHour: 0 }), 6)).toBe(true)
  })
})

describe('normalizeRange', () => {
  it('clamps a range to the grid', () => {
    expect(normalizeRange(range({ fromHour: 8, toHour: 30 }), 16, 24)).toMatchObject({
      fromHour: 16,
      toHour: 24,
    })
  })

  it('keeps at least one hour when the bounds collapse', () => {
    expect(normalizeRange(range({ fromHour: 20, toHour: 20 }), 16, 24)).toMatchObject({
      fromHour: 20,
      toHour: 21,
    })
  })

  it('zeroes the hours of a refusal or a blank day', () => {
    expect(normalizeRange(range({ state: 'NO', fromHour: 18, toHour: 24 }), 16, 24)).toEqual({
      date: DATE,
      state: 'NO',
      fromHour: 0,
      toHour: 0,
    })
  })
})

describe('rangeFromHour', () => {
  /*
   * The one-click default: free from here to the end of the evening, which is
   * what somebody answering usually means.
   */
  it('runs to the end of the grid', () => {
    expect(rangeFromHour(DATE, 18, 24)).toEqual({
      date: DATE,
      state: 'YES',
      fromHour: 18,
      toHour: 24,
    })
  })
})

describe('nextState', () => {
  it('cycles through every state and back to blank', () => {
    expect(nextState(null)).toBe('YES')
    expect(nextState('YES')).toBe('IF_NEED_BE')
    expect(nextState('IF_NEED_BE')).toBe('NO')
    expect(nextState('NO')).toBeNull()
  })
})
