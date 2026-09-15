import { PRIORITY_WEIGHT, STATE_VALUE } from './constants'
import type { ParticipantQuality, SchedulingParticipant, SchedulingSlot } from './types'

/**
 * How a window is valued.
 *
 * Split from the algorithm because these are the parts that will be tuned:
 * what an answer is worth, how much a person's priority weighs, and which of two
 * equally scored windows wins. The algorithm that generates and filters
 * candidates does not change when any of those do.
 *
 * Everything here is a pure function of its arguments. No clock, no order
 * dependence, no accumulated state - the same window scored twice scores the
 * same, which is the property the whole feature's credibility rests on.
 */

/** What one participant's answer is worth for a single hour. */
export function valueAt(participant: SchedulingParticipant, slot: SchedulingSlot): number {
  const state = participant.availability.get(slot.startUtc)
  return state === undefined ? STATE_VALUE.UNKNOWN : STATE_VALUE[state]
}

/**
 * What one participant is worth over a whole window: their weakest hour.
 *
 * The minimum rather than the mean, because a session is not divisible.
 * Somebody free for five hours of a six-hour session cannot attend it; averaging
 * would admit them at 0.83 and quietly build a date around a person who has to
 * leave before the end.
 *
 * An unanswered hour scores the same as a refusal. Treating silence as a
 * maybe would let a date be chosen on the strength of people who never replied,
 * which is exactly the failure the tool exists to prevent - the Keeper is told
 * separately how many have not answered.
 */
export function qualityOver(
  participant: SchedulingParticipant,
  core: readonly SchedulingSlot[],
): number {
  let weakest = 1

  for (const slot of core) {
    const value = valueAt(participant, slot)
    if (value === 0) return 0
    if (value < weakest) weakest = value
  }

  return weakest
}

export function qualitiesFor(
  participants: readonly SchedulingParticipant[],
  core: readonly SchedulingSlot[],
): ParticipantQuality[] {
  return participants.map((participant) => ({
    userId: participant.userId,
    priority: participant.priority,
    isKeeper: participant.isKeeper,
    quality: qualityOver(participant, core),
  }))
}

/**
 * Percentage of the achievable total this window actually reaches.
 *
 * Keepers are excluded: their availability is a hard constraint, so including
 * them would add a term that is the same for every window that survives at all,
 * compressing the range of scores for no information.
 *
 * A session with no participants but its Keeper scores 100 rather than dividing
 * by nothing - every person whose availability mattered is free.
 */
export function scoreFor(qualities: readonly ParticipantQuality[]): number {
  let earned = 0
  let available = 0

  for (const entry of qualities) {
    if (entry.isKeeper) continue
    const weight = PRIORITY_WEIGHT[entry.priority]
    earned += weight * entry.quality
    available += weight
  }

  if (available === 0) return 100

  return round2((100 * earned) / available)
}

/**
 * Two decimals, which is also the precision the score column stores.
 *
 * Applied before ranking rather than only on display: 0.6 × 3 is not exactly 1.8
 * in binary floating point, so two windows that are equal to the eye would
 * otherwise be ordered by a difference of 1e-15 and skip the tie-breakers that
 * are supposed to decide them.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Order two windows that a Keeper is choosing between.
 *
 * The chain is deterministic to the last step, which is what lets the same
 * answers always produce the same ranking. Earlier date and earlier start are a
 * single comparison here: instants sort chronologically as strings, so comparing
 * `startUtc` is exactly "earlier day, then earlier hour".
 */
export const SCORING_TIEBREAKERS = [
  'score',
  'firmlyFreeCount',
  'extendedHours',
  'unknownCount',
  'startUtc',
] as const

export type ComparableCandidate = {
  readonly score: number
  /** Participants, Keepers included, who are firmly free rather than free at a push. */
  readonly firmCount: number
  readonly extendedHours: number
  /** Participants with no answer covering this window: how much is being guessed. */
  readonly unknownCount: number
  readonly startUtc: string
}

export function compareCandidates(a: ComparableCandidate, b: ComparableCandidate): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.firmCount !== b.firmCount) return b.firmCount - a.firmCount
  if (a.extendedHours !== b.extendedHours) return b.extendedHours - a.extendedHours
  if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount
  return a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : 0
}
