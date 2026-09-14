import { describe, expect, it } from 'vitest'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { MAX_PROPOSALS } from '@/modules/scheduling/domain/constants'
import type { SchedulingParticipant } from '@/modules/scheduling/domain/types'
import { everyDay, grid, input, person } from './fixtures'

/**
 * Determinism and scale.
 *
 * A Keeper who re-runs the search and gets a different answer stops trusting the
 * first one. The ranking therefore depends on nothing but the answers: not on
 * the order participants were loaded in, not on the clock, and not on how many
 * times it has been asked.
 */
const DATES = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

function mixedScenario(order: readonly string[] = ['keeper', 'anna', 'piotr', 'kasia', 'tomek']) {
  const slots = grid({ from: DATES[0]!, to: DATES[3]! })

  const people: Record<string, SchedulingParticipant> = {
    keeper: person(slots, 'keeper', { keeper: true, days: everyDay(DATES) }),
    anna: person(slots, 'anna', {
      priority: 'REQUIRED',
      days: everyDay(DATES, { from: 17 }),
    }),
    piotr: person(slots, 'piotr', { days: everyDay(DATES, { state: 'IF_NEED_BE' }) }),
    kasia: person(slots, 'kasia', { days: { [DATES[1]!]: {}, [DATES[2]!]: { from: 18 } } }),
    tomek: person(slots, 'tomek', { priority: 'OPTIONAL', responded: false }),
  }

  return input({
    slots,
    quorum: 2,
    participants: order.map((id) => people[id]!),
  })
}

describe('the same answers always give the same ranking', () => {
  it('returns an identical result on every call', () => {
    const first = rankCandidates(mixedScenario())

    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(rankCandidates(mixedScenario())).toEqual(first)
    }
  })

  /*
   * Participants arrive in whatever order the database returns them. If that
   * leaked into the ranking, the same session would rank differently after an
   * unrelated write.
   */
  it('does not depend on the order participants arrive in', () => {
    const forwards = rankCandidates(mixedScenario())
    const backwards = rankCandidates(mixedScenario(['tomek', 'kasia', 'piotr', 'anna', 'keeper']))

    expect(backwards.ranked.map((candidate) => [candidate.startUtc, candidate.score])).toEqual(
      forwards.ranked.map((candidate) => [candidate.startUtc, candidate.score]),
    )
  })

  it('orders every window, leaving no pair to chance', () => {
    const ranked = rankCandidates(mixedScenario()).ranked
    const keys = ranked.map((candidate) => candidate.startUtc)

    expect(new Set(keys).size).toBe(keys.length)
    expect(ranked.map((candidate) => candidate.rank)).toEqual(
      ranked.map((_candidate, index) => index + 1),
    )
  })
})

describe('scale', () => {
  /*
   * The widest search a Keeper can ask for. At this size the whole space is
   * still under a thousand windows, which is why there is a brute-force search
   * here and not a solver.
   */
  it('ranks a ninety-day search in well under 50ms', () => {
    const slots = grid({ from: '2026-01-01', to: '2026-03-31', startHour: 12, endHour: 24 })
    const dates = [...new Set(slots.map((slot) => slot.localDate))]

    const scenario = input({
      slots,
      quorum: 3,
      participants: [
        person(slots, 'keeper', { keeper: true, days: everyDay(dates) }),
        person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(dates, { from: 16 }) }),
        person(slots, 'piotr', { days: everyDay(dates) }),
        person(slots, 'kasia', { days: everyDay(dates, { state: 'IF_NEED_BE' }) }),
        person(slots, 'tomek', { priority: 'OPTIONAL', days: everyDay(dates) }),
        person(slots, 'ewa', { days: everyDay(dates, { from: 18 }) }),
      ],
    })

    const started = performance.now()
    const result = rankCandidates(scenario)
    const elapsed = performance.now() - started

    expect(result.summary.windowsConsidered).toBeGreaterThan(600)
    expect(elapsed).toBeLessThan(50)
  })

  it('keeps only the ten best, because nobody reads the eleventh', () => {
    const slots = grid({ from: '2026-10-01', to: '2026-10-31' })
    const dates = [...new Set(slots.map((slot) => slot.localDate))]

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(dates) }),
          person(slots, 'anna', { days: everyDay(dates) }),
        ],
      }),
    )

    expect(result.summary.windowsConsidered).toBe(93)
    expect(result.ranked).toHaveLength(MAX_PROPOSALS)
  })
})
