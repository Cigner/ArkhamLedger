import { describe, expect, it } from 'vitest'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { everyDay, grid, input, person } from './fixtures'

/**
 * Hard constraints.
 *
 * A window that breaks one of these is not a worse date, it is not a date at
 * all: the session cannot run without whoever is missing. Every rejection has to
 * be attributable, because an empty result is only actionable if it names who to
 * talk to.
 */
const DAY = '2026-10-08'
const DAYS = [DAY]

describe('the Keeper has to be there', () => {
  it('rejects every window when the Keeper is not free', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS, { state: 'NO' }) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.byReason.KEEPER_UNAVAILABLE).toBe(result.summary.windowsConsidered)
  })

  it('names the Keeper who blocked it', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS, { state: 'NO' }) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.summary.blockedBy).toEqual([{ userId: 'keeper', windows: 3 }])
  })

  /*
   * Two Keepers means both, not either. A co-Keeper who cannot make it is not a
   * spare: the session was planned around them being there.
   */
  it('rejects when one of two Keepers is unavailable', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper-a', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'keeper-b', { keeper: true, days: everyDay(DAYS, { from: 20 }) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.blockedBy).toEqual([{ userId: 'keeper-b', windows: 3 }])
  })

  it('accepts a window a Keeper can only manage at a push', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS, { state: 'IF_NEED_BE' }) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.ranked).toHaveLength(3)
  })
})

describe('required participants', () => {
  it('rejects windows a required participant cannot attend', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS, { from: 18 }) }),
          person(slots, 'piotr', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.ranked.map((candidate) => candidate.startHour)).toEqual([18])
    expect(result.summary.byReason.REQUIRED_UNAVAILABLE).toBe(2)
    expect(result.summary.blockedBy).toEqual([{ userId: 'anna', windows: 2 }])
  })

  /*
   * The weakest hour decides. Five hours of a six-hour session is not attendance,
   * and admitting it would build the evening around somebody who leaves first.
   */
  it('counts a participant free for all but the last hour as unavailable', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS, { to: 21 }) }),
        ],
        minSessionHours: 6,
      }),
    )

    expect(result.ranked).toEqual([])
  })
})

describe('quorum', () => {
  it('rejects windows that not enough players can attend', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { days: everyDay(DAYS, { state: 'NO' }) }),
          person(slots, 'kasia', { days: everyDay(DAYS, { state: 'NO' }) }),
        ],
        quorum: 2,
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.byReason.QUORUM_NOT_MET).toBe(3)
    expect(result.summary.bestAvailableCount).toBe(1)
  })

  /*
   * The Keeper is not one of the players. Counting them would let a campaign's
   * chosen threshold be met by one fewer person than it asked for.
   */
  it('does not count the Keeper towards quorum', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
        quorum: 2,
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.bestAvailableCount).toBe(1)
  })

  it('reports a Keeper absence rather than the quorum it also failed', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS, { state: 'NO' }) }),
          person(slots, 'anna', { days: everyDay(DAYS, { state: 'NO' }) }),
        ],
        quorum: 1,
      }),
    )

    expect(result.summary.byReason).toEqual({
      KEEPER_UNAVAILABLE: 3,
      REQUIRED_UNAVAILABLE: 0,
      QUORUM_NOT_MET: 0,
    })
  })
})

describe('windows that cannot exist', () => {
  it('generates nothing when the grid is shorter than the session', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 22 })

    const result = rankCandidates(
      input({
        slots,
        participants: [person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) })],
        minSessionHours: 6,
      }),
    )

    expect(result.summary.windowsConsidered).toBe(0)
    expect(result.ranked).toEqual([])
  })

  it('offers exactly one window when the grid is the length of the session', () => {
    const slots = grid({ from: DAY, startHour: 18, endHour: 24 })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
        minSessionHours: 6,
      }),
    )

    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0]?.breakdown.extendedHours).toBe(6)
  })

  /*
   * An empty result has to say something. A summary of nothing at all would send
   * a Keeper looking for a bug instead of for the person who is busy.
   */
  it('summarises what blocked everything when nothing qualifies', () => {
    const slots = grid({ from: DAY, to: '2026-10-10' })
    const dates = ['2026-10-08', '2026-10-09', '2026-10-10']

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(dates) }),
          person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(dates, { state: 'NO' }) }),
        ],
      }),
    )

    expect(result.summary.windowsConsidered).toBe(9)
    expect(result.summary.windowsRejected).toBe(9)
    expect(result.summary.blockedBy).toEqual([{ userId: 'anna', windows: 9 }])
  })
})
