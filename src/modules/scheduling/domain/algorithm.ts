import { ALGORITHM_VERSION, MAX_PROPOSALS } from './constants'
import { compareCandidates, qualitiesFor, scoreFor, valueAt } from './scoring'
import type {
  CandidateBreakdown,
  CandidateExplanation,
  ExplanationNote,
  ParticipantQuality,
  RankedCandidate,
  RejectionReason,
  RejectionSummary,
  SchedulingInput,
  SchedulingOutput,
  SchedulingParticipant,
  SchedulingSlot,
} from './types'

/**
 * Session scheduling.
 *
 * Ranks every window the session could actually run in, and explains both the
 * ones that survived and the ones that did not. Pure and deterministic: no
 * clock, no database, no randomness, no dependence on the order participants
 * happen to arrive in. The same answers always produce the same ranking, which
 * is what makes a proposal something a Keeper can defend to the table.
 *
 * A candidate is a start hour on one day. Its core is the first
 * `minSessionHours` from that start, and the core is what the hard constraints
 * are checked against; the end is then extended for as long as the people who
 * have to be there stay free, which is the "plays until it stops" rule.
 *
 * Hard constraints reject a window outright:
 *   - every Keeper free for the whole core;
 *   - every REQUIRED participant free for the whole core;
 *   - enough participants free to reach quorum.
 *
 * Everything else is score. See scoring.ts for the weights and the tie-breakers,
 * and docs/architecture/scheduling.md for the reasoning behind both.
 */
type DayGroup = {
  readonly localDate: string
  readonly slots: readonly SchedulingSlot[]
}

type Rejection = {
  readonly reason: RejectionReason
  readonly userIds: readonly string[]
  readonly availableCount: number
}

/**
 * Ranks the windows this session could run in.
 *
 * Returns at most `MAX_PROPOSALS` candidates, best first, together with a
 * summary of what blocked the rest. The summary is not diagnostics for its own
 * sake: when nothing qualifies, it is the only thing the Keeper can act on.
 *
 * @throws never - malformed input is rejected by the caller's schema validation.
 */
export function rankCandidates(input: SchedulingInput): SchedulingOutput {
  const days = groupByDate(input.slots)
  const investigatorCount = input.participants.filter((person) => !person.isKeeper).length
  const silent = new Set(
    input.participants.filter((person) => !person.hasResponded).map((person) => person.userId),
  )
  const mustAttend = input.participants.filter(
    (person) => person.isKeeper || person.priority === 'REQUIRED',
  )

  const scored: (RankedCandidate & { readonly sortKey: ReturnType<typeof sortKeyFor> })[] = []
  const rejections: Rejection[] = []
  let windowsConsidered = 0

  for (const day of days) {
    for (let start = 0; start + input.minSessionHours <= day.slots.length; start += 1) {
      windowsConsidered += 1

      const core = day.slots.slice(start, start + input.minSessionHours)
      const qualities = qualitiesFor(input.participants, core)

      const rejection = reject(qualities, input.quorum)
      if (rejection) {
        rejections.push(rejection)
        continue
      }

      const end = extendEnd(day, start + input.minSessionHours, mustAttend)
      const lastSlot = day.slots[end - 1]
      const firstSlot = core[0]
      if (!firstSlot || !lastSlot) continue

      const breakdown = breakdownFor({
        qualities,
        coreHours: core.length,
        extendedHours: end - start,
        investigatorCount,
        noResponseCount: silent.size,
        quorum: input.quorum,
      })

      const score = scoreFor(qualities)

      scored.push({
        rank: 0,
        startUtc: firstSlot.startUtc,
        endUtc: lastSlot.endUtc,
        localDate: day.localDate,
        startHour: firstSlot.localHour,
        score,
        breakdown,
        explanation: explain(qualities, silent),
        sortKey: sortKeyFor(firstSlot.startUtc, score, breakdown, qualities),
      })
    }
  }

  scored.sort((a, b) => compareCandidates(a.sortKey, b.sortKey))

  const ranked = scored.slice(0, MAX_PROPOSALS).map((candidate, index) => {
    const { sortKey: _sortKey, ...rest } = candidate
    return { ...rest, rank: index + 1 }
  })

  return {
    algorithmVersion: ALGORITHM_VERSION,
    ranked,
    summary: summarize(rejections, windowsConsidered, input.quorum),
  }
}

/** Slots grouped into local days, each keeping the order it arrived in. */
function groupByDate(slots: readonly SchedulingSlot[]): DayGroup[] {
  const days: { localDate: string; slots: SchedulingSlot[] }[] = []

  for (const slot of slots) {
    const current = days[days.length - 1]
    if (current && current.localDate === slot.localDate) current.slots.push(slot)
    else days.push({ localDate: slot.localDate, slots: [slot] })
  }

  return days
}

/**
 * The first hard constraint this window fails, if any.
 *
 * Order matters for the explanation rather than for correctness: a window
 * missing its Keeper is reported as missing its Keeper even when it also misses
 * quorum, because that is the one a Keeper can do something about.
 */
function reject(qualities: readonly ParticipantQuality[], quorum: number): Rejection | null {
  const keepersOut = qualities.filter((entry) => entry.isKeeper && entry.quality === 0)
  if (keepersOut.length > 0) {
    return {
      reason: 'KEEPER_UNAVAILABLE',
      userIds: keepersOut.map((entry) => entry.userId),
      availableCount: 0,
    }
  }

  const requiredOut = qualities.filter(
    (entry) => !entry.isKeeper && entry.priority === 'REQUIRED' && entry.quality === 0,
  )
  if (requiredOut.length > 0) {
    return {
      reason: 'REQUIRED_UNAVAILABLE',
      userIds: requiredOut.map((entry) => entry.userId),
      availableCount: 0,
    }
  }

  const availableCount = countAvailable(qualities)
  if (availableCount < quorum) {
    return { reason: 'QUORUM_NOT_MET', userIds: [], availableCount }
  }

  return null
}

/**
 * How many players could attend at all.
 *
 * Keepers are outside the count, matching how the default quorum is derived:
 * counting them would inflate every window by the number of Keepers and quietly
 * weaken the threshold a campaign chose.
 */
function countAvailable(qualities: readonly ParticipantQuality[]): number {
  return qualities.filter((entry) => !entry.isKeeper && entry.quality > 0).length
}

/**
 * How far past the core the session can run.
 *
 * Only the people who have to be there hold the end open - a session does not
 * stop because an optional player has to leave. The walk stops at the end of the
 * grid, so an evening never spills into the next day's slots.
 */
function extendEnd(
  day: DayGroup,
  from: number,
  mustAttend: readonly SchedulingParticipant[],
): number {
  let end = from

  while (end < day.slots.length) {
    const slot = day.slots[end]
    if (!slot) break
    if (!mustAttend.every((person) => valueAt(person, slot) > 0)) break
    end += 1
  }

  return end
}

function breakdownFor(input: {
  qualities: readonly ParticipantQuality[]
  coreHours: number
  extendedHours: number
  investigatorCount: number
  noResponseCount: number
  quorum: number
}): CandidateBreakdown {
  const availableCount = countAvailable(input.qualities)

  return {
    coreHours: input.coreHours,
    extendedHours: input.extendedHours,
    availableCount,
    investigatorCount: input.investigatorCount,
    noResponseCount: input.noResponseCount,
    quorum: input.quorum,
    quorumMet: availableCount >= input.quorum,
    perParticipant: input.qualities,
  }
}

/**
 * The counts a sentence is built from, plus the caveats worth printing.
 *
 * "Met" means firmly free for the whole window, not merely able to come. A
 * player at a push counts towards quorum but is named in a note instead, because
 * reporting them as available is how a Keeper ends up surprised on the night.
 */
function explain(
  qualities: readonly ParticipantQuality[],
  silent: ReadonlySet<string>,
): CandidateExplanation {
  const investigators = qualities.filter((entry) => !entry.isKeeper)
  const countBy = (priority: ParticipantQuality['priority']) => {
    const group = investigators.filter((entry) => entry.priority === priority)
    return { total: group.length, met: group.filter((entry) => entry.quality === 1).length }
  }

  const required = countBy('REQUIRED')
  const preferred = countBy('PREFERRED')
  const optional = countBy('OPTIONAL')

  const atAPush = qualities.filter((entry) => entry.quality > 0 && entry.quality < 1)

  /*
   * Somebody who never answered is not somebody who said no. They score the same
   * - silence cannot be counted on - but naming them as unable to come puts words
   * in their mouth, and the Keeper's next move is to chase them, not to work
   * around them.
   */
  const unavailable = qualities.filter((entry) => entry.quality === 0 && !silent.has(entry.userId))

  const notes: ExplanationNote[] = []
  if (atAPush.length > 0) {
    notes.push({ kind: 'AT_A_PUSH', userIds: atAPush.map((entry) => entry.userId) })
  }
  if (unavailable.length > 0) {
    notes.push({ kind: 'UNAVAILABLE', userIds: unavailable.map((entry) => entry.userId) })
  }
  if (silent.size > 0) {
    notes.push({ kind: 'NO_RESPONSE', count: silent.size })
  }

  return {
    headline: qualities.every((entry) => entry.quality === 1)
      ? 'EVERYONE_FREE'
      : 'ALL_REQUIRED_FREE',
    requiredMet: required.met,
    requiredTotal: required.total,
    preferredMet: preferred.met,
    preferredTotal: preferred.total,
    optionalMet: optional.met,
    optionalTotal: optional.total,
    notes,
  }
}

function sortKeyFor(
  startUtc: string,
  score: number,
  breakdown: CandidateBreakdown,
  qualities: readonly ParticipantQuality[],
) {
  return {
    score,
    firmCount: qualities.filter((entry) => entry.quality === 1).length,
    extendedHours: breakdown.extendedHours,
    unknownCount: qualities.filter((entry) => entry.quality === 0).length,
    startUtc,
  }
}

/**
 * What blocked the windows that did not make it.
 *
 * The blocking list is ordered by how many windows each person closed, because
 * the question behind an empty result is always "who do I need to talk to".
 */
function summarize(
  rejections: readonly Rejection[],
  windowsConsidered: number,
  quorum: number,
): RejectionSummary {
  const byReason: Record<RejectionReason, number> = {
    KEEPER_UNAVAILABLE: 0,
    REQUIRED_UNAVAILABLE: 0,
    QUORUM_NOT_MET: 0,
  }

  const blocking = new Map<string, number>()
  let bestAvailableCount = 0

  for (const rejection of rejections) {
    byReason[rejection.reason] += 1
    for (const userId of rejection.userIds) {
      blocking.set(userId, (blocking.get(userId) ?? 0) + 1)
    }
    if (rejection.reason === 'QUORUM_NOT_MET' && rejection.availableCount > bestAvailableCount) {
      bestAvailableCount = rejection.availableCount
    }
  }

  const blockedBy = [...blocking.entries()]
    .map(([userId, windows]) => ({ userId, windows }))
    .sort((a, b) => b.windows - a.windows || (a.userId < b.userId ? -1 : 1))

  return {
    windowsConsidered,
    windowsRejected: rejections.length,
    byReason,
    blockedBy,
    bestAvailableCount,
    quorum,
  }
}
