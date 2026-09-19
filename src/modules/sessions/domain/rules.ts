import { type Result, fail, ok } from '@/lib/result'
import { MAX_SEARCH_WINDOW_DAYS } from './constants'
import type { ParticipantPriority, SessionStatus } from './types'

/**
 * Session business rules.
 *
 * Pure over already-loaded state, with time passed in rather than read, so that
 * deadline behaviour can be tested at exact boundaries.
 */
export type ParticipantDraft = {
  readonly userId: string
  readonly priority: ParticipantPriority
  readonly isKeeper: boolean
  /**
   * Whether this person brings a character.
   *
   * Independent of isKeeper on purpose: a Keeper may run the evening and play
   * somebody in it, and a campaign with two Keepers has one of them at the
   * table as a player. Tying the two together would make that impossible to
   * express.
   */
  readonly playsInvestigator?: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Keepers are a hard constraint, never a preference.
 *
 * Normalising here rather than validating means the UI cannot submit a Keeper
 * marked optional, and the scheduling algorithm can treat REQUIRED uniformly
 * instead of carrying a special case for the person running the game.
 */
export function normalizeParticipants(
  participants: readonly ParticipantDraft[],
): (ParticipantDraft & { playsInvestigator: boolean })[] {
  return participants.map((participant) => ({
    ...participant,
    priority: participant.isKeeper ? 'REQUIRED' : participant.priority,
    /*
     * A player brings a character unless told otherwise; a Keeper does not
     * unless told they do. Both are defaults for the common case rather than
     * rules - the flag is what decides, and the Keeper sets it.
     */
    playsInvestigator: participant.playsInvestigator ?? !participant.isKeeper,
  }))
}

export function validateSearchWindow(start: string, end: string): Result<void> {
  if (end < start) return fail('sessions.errors.windowEndsBeforeItStarts')

  const days = (Date.parse(end) - Date.parse(start)) / MS_PER_DAY + 1
  if (days > MAX_SEARCH_WINDOW_DAYS) {
    return fail('sessions.errors.windowTooWide', { maxDays: MAX_SEARCH_WINDOW_DAYS })
  }

  return ok()
}

/**
 * The grid has to be able to contain at least one viable session.
 *
 * Checked at definition time because the alternative is a Keeper collecting
 * availability for a week before the algorithm reports that no window could ever
 * have fitted.
 */
export function validateGridBounds(
  startHour: number,
  endHour: number,
  minSessionHours: number,
): Result<void> {
  if (endHour <= startHour) return fail('sessions.errors.gridEndsBeforeItStarts')
  if (minSessionHours < 1) return fail('sessions.errors.minimumTooShort')
  if (endHour - startHour < minSessionHours) {
    return fail('sessions.errors.gridTooShortForMinimum')
  }
  return ok()
}

/**
 * A deadline must leave time to answer and must not outlast the window it
 * decides. A deadline after the first candidate date would let people answer for
 * a date that has already passed.
 */
export function validateDeadline(
  deadline: Date | null,
  windowStart: string,
  now: Date,
): Result<void> {
  if (deadline === null) return ok()
  if (deadline.getTime() <= now.getTime()) return fail('sessions.errors.deadlineInThePast')

  const firstCandidate = Date.parse(`${windowStart}T00:00:00Z`)
  if (deadline.getTime() > firstCandidate) {
    return fail('sessions.errors.deadlineAfterWindowStarts')
  }

  return ok()
}

/**
 * Whether a session is ready to be published.
 *
 * Publishing is the point of no return for the definition, so everything that
 * would be awkward to discover later is checked here: a session needs somebody
 * to run it, enough people to reach its own quorum, and a window to search.
 */
export function canPublish(input: {
  readonly status: SessionStatus
  readonly participants: readonly ParticipantDraft[]
  readonly quorum: number
  readonly windowStart: string
  readonly windowEnd: string
  readonly deadline: Date | null
  readonly now: Date
}): Result<void> {
  if (input.status !== 'DRAFT') return fail('sessions.errors.alreadyPublished')

  const keepers = input.participants.filter((participant) => participant.isKeeper)
  if (keepers.length === 0) return fail('sessions.errors.noKeeperAmongParticipants')

  const players = countPlayers(input.participants)
  if (players < input.quorum) {
    return fail('sessions.errors.fewerParticipantsThanQuorum', {
      participants: players,
      quorum: input.quorum,
    })
  }

  const window = validateSearchWindow(input.windowStart, input.windowEnd)
  if (!window.ok) return window

  return validateDeadline(input.deadline, input.windowStart, input.now)
}

/**
 * How many people quorum is counted against.
 *
 * The Keeper is not one of them. They have to be there for the session to happen
 * at all, so counting them would let a threshold of three be reached by two
 * players - quietly weakening the number a campaign deliberately chose.
 */
export function countPlayers(participants: readonly ParticipantDraft[]): number {
  return participants.filter((participant) => !participant.isKeeper).length
}

/**
 * A quorum above the number of players is unreachable by construction: no set of
 * answers could ever satisfy it, and the session would search its whole window
 * and find nothing, with no way for the Keeper to see why.
 */
export function validateQuorum(quorum: number, playerCount: number): Result<void> {
  if (quorum < 1) return fail('sessions.errors.quorumTooLow')
  if (quorum > playerCount) {
    return fail('sessions.errors.quorumAboveParticipantCount', {
      quorum,
      participants: playerCount,
    })
  }
  return ok()
}

/** Whether collection has closed on its own, which the worker acts on. */
export function deadlineHasPassed(deadline: Date | null, now: Date): boolean {
  return deadline !== null && deadline.getTime() <= now.getTime()
}

/**
 * One participant, as the start check sees them.
 *
 * Deliberately not the participant DTO: this rule needs a name to put in the
 * message and nothing else about the person, and taking the full DTO would make
 * every future field of it look like an input to the decision.
 */
export type ParticipantAssignment = {
  readonly userId: string
  readonly name: string
  readonly playsInvestigator: boolean
  readonly investigatorId: string | null
}

/**
 * Whether everyone bringing a character has one.
 *
 * Checked when the session starts rather than when it is scheduled. Agreeing a
 * date is what other people are waiting on, and holding that up over a sheet
 * nobody has written yet would trade the useful half of the evening for the
 * tidy one. The failure names the people involved, because "an assignment is
 * missing" sends the Keeper back to read the whole list.
 */
export function validateInvestigatorAssignments(
  participants: readonly ParticipantAssignment[],
): Result<void> {
  const missing = participants
    .filter((participant) => participant.playsInvestigator && participant.investigatorId === null)
    .map((participant) => participant.name)

  if (missing.length > 0) {
    return fail('sessions.errors.missingInvestigatorAssignments', {
      count: missing.length,
      players: missing.join(', '),
    })
  }

  return ok()
}

/**
 * Whether an Investigator should be told their presence matters for this
 * session. Their exact priority is never disclosed; this is the one bit of it
 * that is useful to them and not hurtful.
 */
export function presenceIsRequired(priority: ParticipantPriority): boolean {
  return priority === 'REQUIRED'
}
