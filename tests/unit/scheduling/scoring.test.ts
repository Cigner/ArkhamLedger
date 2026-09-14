import { describe, expect, it } from 'vitest'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { compareCandidates, qualityOver, scoreFor } from '@/modules/scheduling/domain/scoring'
import { everyDay, grid, input, person } from './fixtures'

/**
 * Scoring.
 *
 * The score is the number a Keeper reads and repeats to the table, so it has to
 * mean something exact: the percentage of the achievable total that this window
 * actually reaches, where the total is weighted by how much each person's
 * presence was asked for.
 */
const DAY = '2026-10-08'
const DAYS = [DAY]

function scoreOfBest(participants: Parameters<typeof input>[0]['participants'], quorum = 1) {
  const slots = grid({ from: DAY, startHour: 18, endHour: 24 })
  return rankCandidates(input({ slots, participants, quorum })).ranked[0]?.score
}

describe('the score', () => {
  it('is exactly 100 when everyone is firmly free', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    expect(
      scoreOfBest([
        person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
        person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS) }),
        person(slots, 'piotr', { days: everyDay(DAYS) }),
        person(slots, 'tomek', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
      ]),
    ).toBe(100)
  })

  it('is exactly 60 when everyone can only manage it at a push', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    expect(
      scoreOfBest([
        person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
        person(slots, 'anna', {
          priority: 'REQUIRED',
          days: everyDay(DAYS, { state: 'IF_NEED_BE' }),
        }),
        person(slots, 'piotr', { days: everyDay(DAYS, { state: 'IF_NEED_BE' }) }),
      ]),
    ).toBe(60)
  })

  /*
   * A session nobody optional was invited to is not thereby worse. Dividing by
   * people who were never asked would cap every such session below 100.
   */
  it('still reaches 100 with no optional participants invited', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    expect(
      scoreOfBest([
        person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
        person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS) }),
      ]),
    ).toBe(100)
  })

  it('weighs one preferred participant as three optional ones', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    const withPreferredOut = scoreOfBest([
      person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
      person(slots, 'piotr', { days: everyDay(DAYS, { state: 'NO' }) }),
      person(slots, 'a', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
      person(slots, 'b', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
      person(slots, 'c', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
    ])

    const withThreeOptionalOut = scoreOfBest([
      person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
      person(slots, 'piotr', { days: everyDay(DAYS) }),
      person(slots, 'a', { priority: 'OPTIONAL', days: everyDay(DAYS, { state: 'NO' }) }),
      person(slots, 'b', { priority: 'OPTIONAL', days: everyDay(DAYS, { state: 'NO' }) }),
      person(slots, 'c', { priority: 'OPTIONAL', days: everyDay(DAYS, { state: 'NO' }) }),
    ])

    expect(withPreferredOut).toBe(withThreeOptionalOut)
  })

  /*
   * Silence is not a maybe. Scoring an unanswered hour above zero would let a
   * date be chosen on the strength of people who never replied, which is the
   * exact failure this tool exists to prevent.
   */
  it('treats no answer exactly as a refusal', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    const silent = scoreOfBest([
      person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
      person(slots, 'anna', { days: everyDay(DAYS) }),
      person(slots, 'piotr', { responded: false }),
    ])

    const refused = scoreOfBest([
      person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
      person(slots, 'anna', { days: everyDay(DAYS) }),
      person(slots, 'piotr', { days: everyDay(DAYS, { state: 'NO' }) }),
    ])

    expect(silent).toBe(refused)
  })

  it('rounds to the two decimals the proposal stores', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    // 5 + 3 + 1.8 + 1 of 12 — a value binary floating point cannot hold exactly.
    expect(
      scoreOfBest([
        person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
        person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS) }),
        person(slots, 'piotr', { days: everyDay(DAYS) }),
        person(slots, 'kasia', { days: everyDay(DAYS, { state: 'IF_NEED_BE' }) }),
        person(slots, 'tomek', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
      ]),
    ).toBe(90)
  })
})

describe('quality over a window', () => {
  it('is the weakest hour, not the average', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })
    const anna = person(slots, 'anna', { days: everyDay(DAYS, { to: 23 }) })

    expect(qualityOver(anna, slots)).toBe(0)
    expect(qualityOver(anna, slots.slice(0, 5))).toBe(1)
  })

  it('takes the firmness of the weakest hour', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })
    const anna = person(slots, 'anna', { days: everyDay(DAYS, { state: 'IF_NEED_BE' }) })

    expect(qualityOver(anna, slots)).toBe(0.6)
  })
})

describe('the tie-breaker chain', () => {
  const base = {
    score: 80,
    firmCount: 3,
    extendedHours: 6,
    unknownCount: 0,
    startUtc: '2026-10-08T16:00:00Z',
  }

  it('prefers the higher score above everything else', () => {
    expect(compareCandidates({ ...base, score: 81, firmCount: 0 }, base)).toBeLessThan(0)
  })

  it('prefers firm answers over answers at a push', () => {
    expect(compareCandidates({ ...base, firmCount: 4 }, base)).toBeLessThan(0)
  })

  it('prefers the longer evening', () => {
    expect(compareCandidates({ ...base, extendedHours: 8 }, base)).toBeLessThan(0)
  })

  it('prefers the window with less guesswork in it', () => {
    expect(compareCandidates(base, { ...base, unknownCount: 1 })).toBeLessThan(0)
  })

  it('falls back to the earlier instant, which orders day then hour', () => {
    expect(compareCandidates(base, { ...base, startUtc: '2026-10-08T17:00:00Z' })).toBeLessThan(0)
    expect(compareCandidates(base, { ...base, startUtc: '2026-10-09T15:00:00Z' })).toBeLessThan(0)
  })

  it('leaves no pair unordered', () => {
    expect(compareCandidates(base, base)).toBe(0)
  })
})

describe('scoreFor', () => {
  it('ignores Keepers, whose availability is already a hard constraint', () => {
    expect(
      scoreFor([
        { userId: 'keeper', priority: 'REQUIRED', isKeeper: true, quality: 0.6 },
        { userId: 'anna', priority: 'PREFERRED', isKeeper: false, quality: 1 },
      ]),
    ).toBe(100)
  })

  it('scores a session with nobody but its Keeper as complete', () => {
    expect(scoreFor([{ userId: 'keeper', priority: 'REQUIRED', isKeeper: true, quality: 1 }])).toBe(
      100,
    )
  })
})
