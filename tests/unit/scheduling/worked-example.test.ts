import { describe, expect, it } from 'vitest'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { grid, input, person } from './fixtures'

/**
 * The worked example from docs/architecture/scheduling.md.
 *
 * Every number here was derived on paper before the algorithm existed, which is
 * what makes it a check rather than a recording of current behaviour. If a
 * weight changes, this file is where it shows up first — and the document and
 * the constants have to move together.
 *
 *   Marek is the Keeper, Anna is required, Piotr and Kasia preferred, Tomek
 *   optional. Grid 16:00–24:00, six hours minimum, quorum two.
 *
 *     Thu 9 · 18:00   5×1.0 + 3×1.0 + 3×0.6 + 1×1.0  = 10.8 / 12  = 90.00
 *     Thu 9 · 17:00   5×1.0 + 3×1.0 + 0     + 0      =  8.0 / 12  = 66.67
 *     Fri 10 · 18:00  5×0.6 + 3×1.0 + 0     + 1×1.0  =  7.0 / 12  = 58.33
 *     Wed 8 · any     rejected — Anna is required and cannot make it
 */
const WED = '2026-10-07'
const THU = '2026-10-08'
const FRI = '2026-10-09'

function scenario() {
  const slots = grid({ from: WED, to: FRI })

  return input({
    slots,
    quorum: 2,
    participants: [
      person(slots, 'marek', {
        keeper: true,
        days: { [WED]: {}, [THU]: {}, [FRI]: { from: 18 } },
      }),
      person(slots, 'anna', {
        priority: 'REQUIRED',
        days: {
          [WED]: { state: 'NO' },
          [THU]: { from: 17 },
          [FRI]: { state: 'IF_NEED_BE', from: 18 },
        },
      }),
      person(slots, 'piotr', {
        days: { [WED]: {}, [THU]: {}, [FRI]: { from: 18 } },
      }),
      person(slots, 'kasia', {
        days: { [WED]: {}, [THU]: { state: 'IF_NEED_BE', from: 18 }, [FRI]: { state: 'NO' } },
      }),
      person(slots, 'tomek', {
        priority: 'OPTIONAL',
        days: { [WED]: {}, [THU]: { from: 18 }, [FRI]: { from: 18 } },
      }),
    ],
  })
}

describe('the worked example', () => {
  const result = rankCandidates(scenario())

  it('ranks exactly the three windows that survive', () => {
    expect(
      result.ranked.map((candidate) => ({
        rank: candidate.rank,
        date: candidate.localDate,
        startHour: candidate.startHour,
        score: candidate.score,
      })),
    ).toEqual([
      { rank: 1, date: THU, startHour: 18, score: 90 },
      { rank: 2, date: THU, startHour: 17, score: 66.67 },
      { rank: 3, date: FRI, startHour: 18, score: 58.33 },
    ])
  })

  it('runs the winning evening to the end of the grid', () => {
    expect(result.ranked[0]?.breakdown.extendedHours).toBe(6)
    expect(result.ranked[0]?.endUtc).toBe('2026-10-08T22:00:00Z')
  })

  it('explains the winner as everyone required plus one preferred at a push', () => {
    expect(result.ranked[0]?.explanation).toEqual({
      headline: 'ALL_REQUIRED_FREE',
      requiredMet: 1,
      requiredTotal: 1,
      preferredMet: 1,
      preferredTotal: 2,
      optionalMet: 1,
      optionalTotal: 1,
      notes: [{ kind: 'AT_A_PUSH', userIds: ['kasia'] }],
    })
  })

  /*
   * Six of the nine windows fall: all three on Wednesday plus Thursday at 16:00
   * to Anna, and the two early Friday starts to Marek. The list is ordered by
   * how many windows each person closed, which is the order a Keeper would want
   * to make phone calls in.
   */
  it('attributes every rejected window to somebody', () => {
    expect(result.summary.windowsConsidered).toBe(9)
    expect(result.summary.windowsRejected).toBe(6)
    expect(result.summary.byReason).toEqual({
      KEEPER_UNAVAILABLE: 2,
      REQUIRED_UNAVAILABLE: 4,
      QUORUM_NOT_MET: 0,
    })
    expect(result.summary.blockedBy).toEqual([
      { userId: 'anna', windows: 4 },
      { userId: 'marek', windows: 2 },
    ])
  })

  /*
   * Thursday at 17:00 is the case the weakest-hour rule exists for: Kasia and
   * Tomek are free from 18:00, so a window starting an hour earlier loses them
   * entirely rather than counting them at five sixths.
   */
  it('drops the two who arrive an hour later from the earlier window', () => {
    const second = result.ranked[1]
    expect(second?.breakdown.availableCount).toBe(2)
    expect(second?.explanation.notes).toContainEqual({
      kind: 'UNAVAILABLE',
      userIds: ['kasia', 'tomek'],
    })
  })
})
