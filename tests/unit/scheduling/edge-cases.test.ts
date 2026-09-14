import { describe, expect, it } from 'vitest'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { everyDay, grid, input, person } from './fixtures'

/**
 * The ends of the range.
 *
 * Sessions with nobody but a Keeper, windows one day wide, campaigns where
 * everybody must attend, and the case where every answer is no. None of these
 * should throw, and each has an answer that reads sensibly to whoever asked.
 */
const DAY = '2026-10-08'
const DAYS = [DAY]

describe('unusual sessions', () => {
  it('handles a session nobody but the Keeper was invited to', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        quorum: 0,
        participants: [person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) })],
      }),
    )

    expect(result.ranked).toHaveLength(3)
    expect(result.ranked[0]?.score).toBe(100)
    expect(result.ranked[0]?.explanation.headline).toBe('EVERYONE_FREE')
  })

  it('handles a window one day wide', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
        ],
      }),
    )

    expect(result.ranked.map((candidate) => candidate.startHour)).toEqual([16, 17, 18])
  })

  it('handles a quorum of everybody invited', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        quorum: 3,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { days: everyDay(DAYS) }),
          person(slots, 'kasia', { days: everyDay(DAYS, { from: 18 }) }),
        ],
      }),
    )

    expect(result.ranked.map((candidate) => candidate.startHour)).toEqual([18])
  })

  it('finds nothing when every answer is a refusal', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS, { state: 'NO' }) }),
          person(slots, 'anna', { days: everyDay(DAYS, { state: 'NO' }) }),
        ],
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.windowsRejected).toBe(result.summary.windowsConsidered)
  })

  it('finds nothing when nobody has answered at all', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, responded: false }),
          person(slots, 'anna', { responded: false }),
        ],
      }),
    )

    expect(result.ranked).toEqual([])
    expect(result.summary.byReason.KEEPER_UNAVAILABLE).toBe(3)
  })
})

describe('what a proposal says about the people in it', () => {
  it('reports how many have not answered', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { responded: false }),
        ],
      }),
    )

    expect(result.ranked[0]?.breakdown.noResponseCount).toBe(1)
    expect(result.ranked[0]?.explanation.notes).toContainEqual({ kind: 'NO_RESPONSE', count: 1 })
  })

  /*
   * A refusal and a silence score the same but read differently: one is a person
   * who has decided, the other a person who has not been reached. The Keeper's
   * next move differs accordingly, so the note has to distinguish them.
   */
  it('names somebody who has not answered only as unanswered', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { responded: false }),
        ],
      }),
    )

    expect(result.ranked[0]?.explanation.notes).toEqual([{ kind: 'NO_RESPONSE', count: 1 }])
  })

  it('does not report somebody who answered with a refusal as unanswered', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS) }),
          person(slots, 'piotr', { days: everyDay(DAYS, { state: 'NO' }) }),
        ],
      }),
    )

    expect(result.ranked[0]?.breakdown.noResponseCount).toBe(0)
    expect(result.ranked[0]?.explanation.notes).toContainEqual({
      kind: 'UNAVAILABLE',
      userIds: ['piotr'],
    })
  })

  it('carries every participant into the breakdown, Keepers included', () => {
    const slots = grid({ from: DAY })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { days: everyDay(DAYS, { state: 'IF_NEED_BE' }) }),
        ],
      }),
    )

    expect(result.ranked[0]?.breakdown.perParticipant).toEqual([
      { userId: 'keeper', priority: 'REQUIRED', isKeeper: true, quality: 1 },
      { userId: 'anna', priority: 'PREFERRED', isKeeper: false, quality: 0.6 },
    ])
  })
})

describe('the end of the evening', () => {
  /*
   * The session runs until somebody who has to be there leaves. An optional
   * player going home early does not end it.
   */
  it('stops when a required participant has to leave', () => {
    const slots = grid({ from: DAY, startHour: 12, endHour: 24 })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS, { to: 20 }) }),
          person(slots, 'piotr', { priority: 'OPTIONAL', days: everyDay(DAYS) }),
        ],
      }),
    )

    const best = result.ranked[0]
    expect(best?.startHour).toBe(12)
    expect(best?.breakdown.extendedHours).toBe(8)
  })

  it('does not stop when an optional participant has to leave', () => {
    const slots = grid({ from: DAY, startHour: 12, endHour: 24 })

    const result = rankCandidates(
      input({
        slots,
        participants: [
          person(slots, 'keeper', { keeper: true, days: everyDay(DAYS) }),
          person(slots, 'anna', { priority: 'REQUIRED', days: everyDay(DAYS) }),
          person(slots, 'piotr', { priority: 'OPTIONAL', days: everyDay(DAYS, { to: 20 }) }),
        ],
      }),
    )

    expect(result.ranked[0]?.breakdown.extendedHours).toBe(12)
  })
})
