import { describe, expect, it } from 'vitest'
import { elapsedHours } from '@/lib/datetime/slots'
import type { SlotState } from '@/modules/availability/domain/types'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import type { SchedulingParticipant, SchedulingSlot } from '@/modules/scheduling/domain/types'
import { everyDay, grid, input, person } from './fixtures'

/**
 * Daylight saving.
 *
 * Twice a year a local day is not 24 hours long, and a six-hour session is
 * always six real hours. The algorithm never converts between local time and
 * instants — it counts slots — so the correctness here rests on the grid
 * generator producing the hours that actually exist. These tests check the pair
 * end to end on the two nights it matters.
 *
 * Poland 2026: clocks go forward on 29 March and back on 25 October.
 */
const SPRING = '2026-03-29'
const AUTUMN = '2026-10-25'

function overnight(date: string) {
  return grid({ from: date, startHour: 0, endHour: 6 })
}

describe('the night an hour disappears', () => {
  it('offers no six-hour window on a day with only five hours of grid', () => {
    const slots = overnight(SPRING)
    expect(slots).toHaveLength(5)

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay([SPRING]) }),
          person(slots, 'anna', { days: everyDay([SPRING]) }),
        ],
        minSessionHours: 6,
      }),
    )

    expect(result.summary.windowsConsidered).toBe(0)
  })

  it('measures a five-hour window as five real hours despite spanning six labels', () => {
    const slots = overnight(SPRING)

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay([SPRING]) }),
          person(slots, 'anna', { days: everyDay([SPRING]) }),
        ],
        minSessionHours: 5,
      }),
    )

    const candidate = result.ranked[0]
    expect(candidate?.startHour).toBe(0)
    expect(candidate?.breakdown.extendedHours).toBe(5)
    expect(elapsedHours(candidate?.startUtc ?? '', candidate?.endUtc ?? '')).toBe(5)
  })
})

describe('the night an hour repeats', () => {
  it('counts the repeated hour once for each time it happens', () => {
    const slots = overnight(AUTUMN)
    expect(slots).toHaveLength(7)
    expect(slots.filter((slot) => slot.localHour === 2)).toHaveLength(2)
  })

  /*
   * The window starting at midnight covers labels 0, 1, 2, 2, 3 — five distinct
   * clock readings for six hours of play, then an hour of extension. What the
   * session runs on is elapsed time, and that is what is measured.
   */
  it('counts real hours rather than clock labels', () => {
    const slots = overnight(AUTUMN)

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay([AUTUMN]) }),
          person(slots, 'anna', { days: everyDay([AUTUMN]) }),
        ],
        minSessionHours: 6,
      }),
    )

    const candidate = result.ranked.find((entry) => entry.startHour === 0)
    expect(candidate?.breakdown.coreHours).toBe(6)
    expect(candidate?.breakdown.extendedHours).toBe(7)
    expect(elapsedHours(candidate?.startUtc ?? '', candidate?.endUtc ?? '')).toBe(7)
  })

  /*
   * The two 2:00s are different hours and a person can answer them differently.
   * Keying availability by instant is what makes that expressible; keying it by
   * the label would silently merge them and lose an hour of somebody's evening.
   */
  it('treats the two occurrences of the repeated hour as separate hours', () => {
    const slots = overnight(AUTUMN)
    const repeated = slots.filter((slot) => slot.localHour === 2)
    const secondTwo = repeated[1]
    expect(secondTwo).toBeDefined()

    const availability = new Map<string, SlotState>(
      slots.map((slot) => [slot.startUtc, slot.startUtc === secondTwo?.startUtc ? 'NO' : 'YES']),
    )

    const keeper: SchedulingParticipant = {
      userId: 'keeper',
      priority: 'REQUIRED',
      isKeeper: true,
      hasResponded: true,
      availability,
    }

    const result = rankCandidates(
      input({
        slots,
        participants: [keeper, person(slots, 'anna', { days: everyDay([AUTUMN]) })],
        minSessionHours: 3,
      }),
    )

    const covers = (candidate: { startUtc: string; endUtc: string }, slot: SchedulingSlot) =>
      candidate.startUtc <= slot.startUtc && slot.startUtc < candidate.endUtc

    expect(result.ranked.length).toBeGreaterThan(0)
    expect(secondTwo && result.ranked.every((candidate) => !covers(candidate, secondTwo))).toBe(
      true,
    )
    expect(repeated[0] && result.ranked.some((candidate) => covers(candidate, repeated[0]!))).toBe(
      true,
    )
  })
})
