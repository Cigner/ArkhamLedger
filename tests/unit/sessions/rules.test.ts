import { describe, expect, it } from 'vitest'
import { defaultQuorum } from '@/modules/sessions/domain/constants'
import {
  canPublish,
  deadlineHasPassed,
  normalizeParticipants,
  presenceIsRequired,
  validateDeadline,
  validateGridBounds,
  validateQuorum,
  validateSearchWindow,
  type ParticipantDraft,
} from '@/modules/sessions/domain/rules'

/**
 * Session rules.
 *
 * Time is a parameter throughout, so deadline behaviour is pinned at exact
 * boundaries rather than approximately near them.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

function participant(overrides: Partial<ParticipantDraft> = {}): ParticipantDraft {
  return { userId: 'user-1', priority: 'PREFERRED', isKeeper: false, ...overrides }
}

describe('defaultQuorum', () => {
  /*
   * Half plus one. Requiring everybody hands a veto to whoever is busiest, which
   * is the failure mode that ends campaigns.
   */
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [7, 4],
  ])('%i investigators need %i', (investigators, expected) => {
    expect(defaultQuorum(investigators)).toBe(expected)
  })
})

describe('normalizeParticipants', () => {
  /*
   * Normalising rather than validating means a Keeper marked optional is not
   * merely rejected — it cannot be represented, so no later code needs to carry
   * a special case for the person running the game.
   */
  it('forces every Keeper to REQUIRED', () => {
    const result = normalizeParticipants([
      participant({ userId: 'k', isKeeper: true, priority: 'OPTIONAL' }),
      participant({ userId: 'p', priority: 'OPTIONAL' }),
    ])

    expect(result).toEqual([
      { userId: 'k', isKeeper: true, priority: 'REQUIRED' },
      { userId: 'p', isKeeper: false, priority: 'OPTIONAL' },
    ])
  })

  it('leaves investigators alone', () => {
    const input = [participant({ priority: 'REQUIRED' })]
    expect(normalizeParticipants(input)).toEqual(input)
  })
})

describe('validateSearchWindow', () => {
  it('accepts a single day', () => {
    expect(validateSearchWindow('2026-10-05', '2026-10-05').ok).toBe(true)
  })

  it('refuses an end before the start', () => {
    expect(validateSearchWindow('2026-10-05', '2026-10-04').ok).toBe(false)
  })

  it('accepts exactly ninety days and refuses ninety-one', () => {
    expect(validateSearchWindow('2026-10-01', '2026-12-29').ok).toBe(true)
    expect(validateSearchWindow('2026-10-01', '2026-12-30').ok).toBe(false)
  })
})

describe('validateGridBounds', () => {
  it('accepts a grid exactly as long as the minimum', () => {
    expect(validateGridBounds(18, 24, 6).ok).toBe(true)
  })

  it('refuses a grid shorter than the minimum it must contain', () => {
    const result = validateGridBounds(19, 24, 6)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('sessions.errors.gridTooShortForMinimum')
  })

  it('refuses an inverted grid', () => {
    expect(validateGridBounds(24, 16, 6).ok).toBe(false)
  })
})

describe('validateDeadline', () => {
  it('accepts no deadline at all', () => {
    expect(validateDeadline(null, '2026-10-05', NOW).ok).toBe(true)
  })

  it('refuses the present instant', () => {
    expect(validateDeadline(NOW, '2026-10-05', NOW).ok).toBe(false)
  })

  it('accepts one millisecond into the future', () => {
    expect(validateDeadline(new Date(NOW.getTime() + 1), '2026-10-05', NOW).ok).toBe(true)
  })

  /*
   * A deadline past the first candidate date would let somebody answer for a
   * date that has already gone.
   */
  it('refuses a deadline after the window opens', () => {
    const result = validateDeadline(new Date('2026-10-06T00:00:00Z'), '2026-10-05', NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('sessions.errors.deadlineAfterWindowStarts')
  })
})

describe('deadlineHasPassed', () => {
  it('treats the deadline instant itself as passed', () => {
    expect(deadlineHasPassed(NOW, NOW)).toBe(true)
    expect(deadlineHasPassed(new Date(NOW.getTime() + 1), NOW)).toBe(false)
    expect(deadlineHasPassed(null, NOW)).toBe(false)
  })
})

describe('validateQuorum', () => {
  it('refuses a quorum nobody could reach', () => {
    expect(validateQuorum(5, 4).ok).toBe(false)
    expect(validateQuorum(0, 4).ok).toBe(false)
    expect(validateQuorum(4, 4).ok).toBe(true)
  })
})

describe('canPublish', () => {
  const base = {
    status: 'DRAFT' as const,
    participants: [
      participant({ userId: 'k', isKeeper: true, priority: 'REQUIRED' as const }),
      participant({ userId: 'a' }),
      participant({ userId: 'b' }),
    ],
    quorum: 2,
    windowStart: '2026-10-05',
    windowEnd: '2026-10-18',
    deadline: new Date('2026-10-01T20:00:00Z'),
    now: NOW,
  }

  it('accepts a complete draft', () => {
    expect(canPublish(base).ok).toBe(true)
  })

  it('refuses a session nobody is running', () => {
    const result = canPublish({
      ...base,
      participants: [participant({ userId: 'a' }), participant({ userId: 'b' })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('sessions.errors.noKeeperAmongParticipants')
  })

  /*
   * A quorum above the number of people invited can never be met, so the session
   * would collect availability for a week and then report that no date works.
   */
  it('refuses a quorum larger than the guest list', () => {
    const result = canPublish({ ...base, quorum: 4 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.key).toBe('sessions.errors.fewerParticipantsThanQuorum')
      expect(result.error.params).toEqual({ participants: 3, quorum: 4 })
    }
  })

  it('refuses publishing something that is not a draft', () => {
    expect(canPublish({ ...base, status: 'COLLECTING' }).ok).toBe(false)
  })

  it('propagates window and deadline failures', () => {
    expect(canPublish({ ...base, windowEnd: '2026-10-01' }).ok).toBe(false)
    expect(canPublish({ ...base, deadline: new Date('2020-01-01T00:00:00Z') }).ok).toBe(false)
  })
})

describe('presenceIsRequired', () => {
  /*
   * The only slice of a participant's priority an Investigator is ever shown.
   * Being told you are "optional" is a social injury the feature does not need.
   */
  it('is true only for REQUIRED', () => {
    expect(presenceIsRequired('REQUIRED')).toBe(true)
    expect(presenceIsRequired('PREFERRED')).toBe(false)
    expect(presenceIsRequired('OPTIONAL')).toBe(false)
  })
})
