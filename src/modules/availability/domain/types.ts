/**
 * Availability model.
 *
 * Stored per hour, expressed per day.
 *
 * The database keeps one row per hour because that is what the scheduling
 * algorithm consumes and what daylight-saving transitions require. The interface
 * works in whole-day ranges because that is the only shape of answer this domain
 * can use: a session runs from its start to the end of the evening with a
 * minimum length, so "free 16–17 and 20–22" is expressible but useless — no
 * session fits in it.
 *
 * Converting between the two happens in one place, which keeps the constraint
 * out of the algorithm and leaves room to relax it later without a migration.
 */
import type { SessionStatus } from '@/modules/sessions/domain/types'

export type SlotState = 'YES' | 'IF_NEED_BE' | 'NO'

/** One day's answer. A null state means the day has not been answered. */
export type DayRange = {
  readonly date: string
  readonly state: SlotState | null
  /** Inclusive first hour, in the session's zone. Meaningless when state is null or NO. */
  readonly fromHour: number
  /** Exclusive last hour. */
  readonly toHour: number
}

/** A single stored cell, keyed by the instant it begins. */
export type AvailabilityCell = {
  readonly slotStartUtc: string
  readonly localDate: string
  readonly localHour: number
  readonly state: SlotState
}

/** What one participant said, ready for the grid. */
export type ParticipantAvailability = {
  readonly userId: string
  readonly name: string
  readonly respondedAt: Date | null
  readonly days: readonly DayRange[]
}

/**
 * Per-hour totals.
 *
 * Counts only. No identifiers appear in this shape at all, which is what makes
 * it safe to hand to an Investigator.
 */
export type SlotTally = {
  readonly slotStartUtc: string
  readonly localDate: string
  readonly localHour: number
  readonly yes: number
  readonly ifNeedBe: number
  readonly no: number
  /** Invited participants who have not answered at all. */
  readonly unknown: number
}

/** A window that could actually host the session, with how well it does. */
export type WindowSummary = {
  readonly date: string
  readonly startHour: number
  readonly endHour: number
  readonly available: number
  readonly ifNeedBe: number
  readonly total: number
  readonly quorumMet: boolean
}

/**
 * Everything the grid needs, already narrowed for its viewer.
 *
 * A Keeper's copy carries `participants`; an Investigator's never does. The
 * distinction is made when the DTO is built, so there is no payload in which the
 * names are present and merely unrendered.
 */
export type AvailabilityView = {
  readonly sessionId: string
  readonly timezone: string
  readonly gridStartHour: number
  readonly gridEndHour: number
  readonly minSessionHours: number
  readonly quorum: number
  readonly dates: readonly string[]
  readonly editable: boolean
  /**
   * Why answering is closed, when it is. "Not open yet" and "no longer open"
   * are opposite situations and used to read identically.
   */
  readonly status: SessionStatus
  readonly deadline: Date | null
  readonly own: readonly DayRange[]
  readonly tallies: readonly SlotTally[]
  readonly windows: readonly WindowSummary[]
  readonly respondentCount: number
  readonly participantCount: number
  /** Keeper only; empty for everybody else. */
  readonly participants: readonly ParticipantAvailability[]
}
