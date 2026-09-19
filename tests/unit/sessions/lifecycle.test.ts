import { describe, expect, it } from 'vitest'
import {
  SESSION_TRANSITIONS,
  canAssignInvestigators,
  canEditDefinition,
  canEditParticipants,
  canRecordAttendance,
  canSetDate,
  canStartSession,
  canSubmitAvailability,
  editInvalidatesAnswers,
  canTransition,
  isTerminal,
} from '@/modules/sessions/domain/lifecycle'
import type { SessionStatus } from '@/modules/sessions/domain/types'

/**
 * Session lifecycle.
 *
 * Checked over the full cross product of statuses rather than by example. A
 * transition table is only worth having if it is known to be total: every one of
 * the forty-nine ordered pairs is either explicitly allowed here or explicitly
 * refused, and adding a seventh status breaks these tests rather than silently
 * inheriting whatever the default branch did.
 */
const ALL_STATUSES: readonly SessionStatus[] = [
  'DRAFT',
  'COLLECTING',
  'PROPOSED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]

const ALL_PAIRS = ALL_STATUSES.flatMap((from) => ALL_STATUSES.map((to) => [from, to] as const))

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

  it.each(['DRAFT', 'COLLECTING', 'PROPOSED', 'SCHEDULED', 'IN_PROGRESS'] as const)(
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
  /*
   * Editable while answers are being collected too. Refusing meant a mistyped
   * date could only be fixed by cancelling the session and starting again; the
   * cost is paid by clearing the answers, which the action does and the form
   * warns about.
   */
  it.each(ALL_STATUSES)('definition is editable in DRAFT and COLLECTING (%s)', (status) => {
    expect(canEditDefinition(status).ok).toBe(status === 'DRAFT' || status === 'COLLECTING')
  })

  it.each([
    ['searchWindowStart', '2026-10-06'],
    ['searchWindowEnd', '2026-10-20'],
    ['gridStartHour', 14],
    ['gridEndHour', 22],
  ] as const)('changing %s discards the answers already given', (field, value) => {
    const before = {
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-19',
      gridStartHour: 12,
      gridEndHour: 24,
    }

    expect(editInvalidatesAnswers(before, { ...before, [field]: value })).toBe(true)
  })

  /*
   * An answer describes the question it was asked. Retitling a session or moving
   * its deadline does not change that question, so the answers stand.
   */
  it('leaves the answers alone when only the wording or the deadline changes', () => {
    const definition = {
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-19',
      gridStartHour: 12,
      gridEndHour: 24,
    }

    expect(editInvalidatesAnswers(definition, { ...definition })).toBe(false)
  })

  it.each(ALL_STATUSES)('participants are editable in DRAFT and COLLECTING (%s)', (status) => {
    expect(canEditParticipants(status).ok).toBe(status === 'DRAFT' || status === 'COLLECTING')
  })

  it.each(ALL_STATUSES)('availability is accepted only while COLLECTING (%s)', (status) => {
    expect(canSubmitAvailability(status).ok).toBe(status === 'COLLECTING')
  })

  it.each(ALL_STATUSES)('attendance is recorded only while IN_PROGRESS (%s)', (status) => {
    expect(canRecordAttendance(status).ok).toBe(status === 'IN_PROGRESS')
  })

  it.each(ALL_STATUSES)('only a scheduled session can be started (%s)', (status) => {
    expect(canStartSession(status).ok).toBe(status === 'SCHEDULED')
  })

  /*
   * Starting and completing have to compose: if starting were possible from a
   * status that cannot then reach COMPLETED, a Keeper could strand a session
   * one press away from history with no way back.
   */
  it('a started session can always be completed', () => {
    const startable = ALL_STATUSES.filter((status) => canStartSession(status).ok)
    expect(startable).not.toHaveLength(0)
    for (const status of startable) {
      expect(canTransition(status, 'IN_PROGRESS').ok).toBe(true)
      expect(canRecordAttendance('IN_PROGRESS').ok).toBe(true)
      expect(canTransition('IN_PROGRESS', 'COMPLETED').ok).toBe(true)
    }
  })

  /*
   * Moving a session that already has a date is a change of when it happens, not
   * a change of state. Routing it through the transition table would make
   * "change the date" fail on exactly the sessions that have one.
   */
  it.each(ALL_STATUSES)(
    'a date can be set or changed unless the session is over (%s)',
    (status) => {
      expect(canSetDate(status).ok).toBe(!isTerminal(status) && status !== 'IN_PROGRESS')
    },
  )
})

/**
 * Starting a session points each assignment at the snapshot taken for it, so
 * the assignment is the record of who played what. Rewriting one afterwards
 * would delete that record and leave the snapshots orphaned.
 */
describe('canAssignInvestigators', () => {
  it.each([['DRAFT'], ['COLLECTING'], ['PROPOSED'], ['SCHEDULED']] as const)(
    'allows choosing characters while the session is %s',
    (status) => {
      expect(canAssignInvestigators(status).ok).toBe(true)
    },
  )

  it.each([['IN_PROGRESS'], ['COMPLETED'], ['CANCELLED']] as const)(
    'refuses once the session is %s',
    (status) => {
      const result = canAssignInvestigators(status)

      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error.key).toBe('sessions.errors.assignmentsLocked')
    },
  )
})
