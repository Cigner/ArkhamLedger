import { type Result, fail, ok } from '@/lib/result'
import type { SessionStatus } from './types'

/**
 * Session lifecycle.
 *
 * The transition table is data rather than a chain of conditionals, so the whole
 * machine can be read at once and tested exhaustively: every pair of statuses is
 * either listed here or impossible, with no third case hiding in an else branch.
 *
 *   DRAFT ─────┬─▶ COLLECTING ─┬─▶ PROPOSED ─┬─▶ SCHEDULED ─▶ COMPLETED
 *              │       ▲       │      │      │       │
 *              └───────┴───────┴──────┴──────┴───────┴─────▶ CANCELLED
 *
 * Two edges are less obvious and both exist because plans change: PROPOSED and
 * SCHEDULED can return to COLLECTING, which is how a Keeper reopens a date that
 * stopped working. COMPLETED and CANCELLED are terminal - a session that already
 * happened is a historical record, and reviving a cancelled one would silently
 * resurrect notifications people already acted on.
 */
export const SESSION_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  DRAFT: ['COLLECTING', 'SCHEDULED', 'CANCELLED'],
  COLLECTING: ['DRAFT', 'PROPOSED', 'SCHEDULED', 'CANCELLED'],
  PROPOSED: ['COLLECTING', 'SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['COLLECTING', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export const TERMINAL_STATUSES: readonly SessionStatus[] = ['COMPLETED', 'CANCELLED']

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function canTransition(from: SessionStatus, to: SessionStatus): Result<void> {
  if (from === to) return fail('sessions.errors.alreadyInThatState')
  if (isTerminal(from)) return fail('sessions.errors.sessionIsFinal')
  if (!SESSION_TRANSITIONS[from].includes(to)) {
    return fail('sessions.errors.invalidTransition')
  }
  return ok()
}

/**
 * Statuses in which the Keeper may still change what the session is about.
 *
 * Both DRAFT and COLLECTING. Editing while people are answering has a cost -
 * answers given against a window that has moved describe a question nobody
 * asked - so the action clears them when the dates or hours change, and the form
 * says so before it is submitted. Refusing the edit outright was worse: the only
 * way to fix a mistyped date was to cancel the session and start again.
 */
export function canEditDefinition(status: SessionStatus): Result<void> {
  if (status === 'DRAFT' || status === 'COLLECTING') return ok()
  return fail('sessions.errors.definitionLocked')
}

/**
 * Whether a change to the definition invalidates the answers already given.
 *
 * Only the question changing does that. Retitling a session, or moving its
 * deadline, leaves every answer meaning exactly what it meant.
 */
export function editInvalidatesAnswers(
  before: {
    readonly searchWindowStart: string
    readonly searchWindowEnd: string
    readonly gridStartHour: number
    readonly gridEndHour: number
  },
  after: {
    readonly searchWindowStart: string
    readonly searchWindowEnd: string
    readonly gridStartHour: number
    readonly gridEndHour: number
  },
): boolean {
  return (
    before.searchWindowStart !== after.searchWindowStart ||
    before.searchWindowEnd !== after.searchWindowEnd ||
    before.gridStartHour !== after.gridStartHour ||
    before.gridEndHour !== after.gridEndHour
  )
}

/** Whether participants and their priorities may still be changed. */
export function canEditParticipants(status: SessionStatus): Result<void> {
  if (status === 'DRAFT' || status === 'COLLECTING') return ok()
  return fail('sessions.errors.participantsLocked')
}

/** Whether a participant may still record or change their availability. */
export function canSubmitAvailability(status: SessionStatus): Result<void> {
  if (status === 'COLLECTING') return ok()
  return fail('sessions.errors.notCollecting')
}

/**
 * Whether a date may be set or changed.
 *
 * Moving a session that already has a date is a change of when it happens, not a
 * change of what state it is in, so it is allowed from SCHEDULED even though
 * SCHEDULED is not a transition to itself. Plans move; a Keeper should not have
 * to cancel a session to shift it by an hour.
 */
export function canSetDate(status: SessionStatus): Result<void> {
  if (status === 'SCHEDULED') return ok()
  return canTransition(status, 'SCHEDULED')
}

/** Whether attendance may be recorded, which is what completing a session means. */
export function canRecordAttendance(status: SessionStatus): Result<void> {
  if (status === 'SCHEDULED') return ok()
  return fail('sessions.errors.notScheduled')
}
