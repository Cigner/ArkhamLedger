import { describe, expect, it } from 'vitest'
import {
  SESSION_TRANSITIONS,
  canEditDefinition,
  canEditParticipants,
  canRecordAttendance,
  canSetDate,
  canSubmitAvailability,
  canTransition,
  isTerminal,
} from '@/modules/sessions/domain/lifecycle'
import type { SessionStatus } from '@/modules/sessions/domain/types'

/**
 * Session lifecycle.
 *
 * Checked over the full cross product of statuses rather than by example. A
 * transition table is only worth having if it is known to be total: every one of
 * the thirty-six ordered pairs is either explicitly allowed here or explicitly
 * refused, and adding a seventh status breaks these tests rather than silently
 * inheriting whatever the default branch did.
 */
const ALL_STATUSES: readonly SessionStatus[] = [
  'DRAFT',
  'COLLECTING',
  'PROPOSED',
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
]

const ALL_PAIRS = ALL_STATUSES.flatMap((from) =>
  ALL_STATUSES.map((to) => [from, to] as const),
)

describe('transition table', () => {
  it('covers every status', () => {
    expect(Object.keys(SESSION_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort())
  })

  it('never lists a status as a transition to itself', () => {
    for (const [from, targets] of Object.entries(SESSION_TRANSITIONS)) {
      expect(targets).not.toContain(from)
    }
  })

  it('only names statuses that exist', () => {
    for (const targets of Object.values(SESSION_TRANSITIONS)) {
      for (const target of targets) expect(ALL_STATUSES).toContain(target)
    }
  })
})

describe('canTransition', () => {
  it.each(ALL_PAIRS)('%s -> %s matches the table', (from, to) => {
    const expected = from !== to && SESSION_TRANSITIONS[from].includes(to)
    expect(canTransition(from, to).ok).toBe(expected)
  })

  it('refuses a transition to the same status with its own message', () => {
    const result = canTransition('COLLECTING', 'COLLECTING')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('sessions.errors.alreadyInThatState')
  })

  /*
   * Terminal statuses are the reason attendance and notifications can be trusted
   * as a record: a completed session cannot be reopened and a cancelled one
   * cannot be revived to re-fire notifications people already acted on.
   */
  it.each(['COMPLETED', 'CANCELLED'] as const)('treats %s as final', (status) => {
    expect(isTerminal(status)).toBe(true)
    expect(SESSION_TRANSITIONS[status]).toHaveLength(0)

    for (const target of ALL_STATUSES) {
      const result = canTransition(status, target)
      expect(result.ok).toBe(false)
    }
  })

  it.each(['DRAFT', 'COLLECTING', 'PROPOSED', 'SCHEDULED'] as const)(
    '%s can always be cancelled',
    (status) => {
      expect(canTransition(status, 'CANCELLED').ok).toBe(true)
    },
  )

  /*
   * The two edges that exist because plans change: a Keeper must be able to
   * reopen a date that stopped working without discarding everyone's answers.
   */
  it('allows reopening collection from PROPOSED and SCHEDULED', () => {
    expect(canTransition('PROPOSED', 'COLLECTING').ok).toBe(true)
    expect(canTransition('SCHEDULED', 'COLLECTING').ok).toBe(true)
  })

  it('allows a Keeper to skip collection entirely', () => {
    expect(canTransition('DRAFT', 'SCHEDULED').ok).toBe(true)
  })

  it('refuses skipping straight to completed', () => {
    expect(canTransition('DRAFT', 'COMPLETED').ok).toBe(false)
    expect(canTransition('COLLECTING', 'COMPLETED').ok).toBe(false)
    expect(canTransition('PROPOSED', 'COMPLETED').ok).toBe(false)
  })
})

describe('capability gates', () => {
  it.each(ALL_STATUSES)('definition is editable only in DRAFT (%s)', (status) => {
    expect(canEditDefinition(status).ok).toBe(status === 'DRAFT')
  })

  it.each(ALL_STATUSES)('participants are editable in DRAFT and COLLECTING (%s)', (status) => {
    expect(canEditParticipants(status).ok).toBe(status === 'DRAFT' || status === 'COLLECTING')
  })

  it.each(ALL_STATUSES)('availability is accepted only while COLLECTING (%s)', (status) => {
    expect(canSubmitAvailability(status).ok).toBe(status === 'COLLECTING')
  })

  it.each(ALL_STATUSES)('attendance is recorded only from SCHEDULED (%s)', (status) => {
    expect(canRecordAttendance(status).ok).toBe(status === 'SCHEDULED')
  })

  /*
   * Moving a session that already has a date is a change of when it happens, not
   * a change of state. Routing it through the transition table would make
   * "change the date" fail on exactly the sessions that have one.
   */
  it.each(ALL_STATUSES)('a date can be set or changed unless the session is over (%s)', (status) => {
    expect(canSetDate(status).ok).toBe(!isTerminal(status))
  })
})
