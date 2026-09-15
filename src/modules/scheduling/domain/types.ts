import type { SlotState } from '@/modules/availability/domain/types'
import type { ParticipantPriority } from '@/modules/sessions/domain/types'

/**
 * Scheduling model.
 *
 * The algorithm never sees a date, a zone or a clock. It is given the grid as an
 * ordered list of hour slots, each already resolved to the instant it begins,
 * and everything it decides is expressed in terms of those slots. That is what
 * keeps daylight saving out of the ranking: a 25-hour day simply arrives with 25
 * slots, and six consecutive slots are six real hours on every day of the year.
 *
 * Nothing here carries a display name. A breakdown identifies people by id, and
 * the Keeper's view resolves those to names - an availability answer is
 * private data, and the algorithm has no business holding it in a readable form.
 */
export type SchedulingSlot = {
  /** Instant this hour begins, ISO 8601 with a Z offset. Sorts chronologically. */
  readonly startUtc: string
  /** Instant this hour ends. Supplied rather than derived, so the domain does no time arithmetic. */
  readonly endUtc: string
  readonly localDate: string
  readonly localHour: number
}

export type SchedulingParticipant = {
  readonly userId: string
  readonly priority: ParticipantPriority
  readonly isKeeper: boolean
  /**
   * Whether they answered at all. An unanswered session and a session answered
   * with a flat refusal score identically, but they read very differently to a
   * Keeper deciding whether to chase somebody.
   */
  readonly hasResponded: boolean
  /** Keyed by slot `startUtc`. A missing key means no answer for that hour. */
  readonly availability: ReadonlyMap<string, SlotState>
}

export type SchedulingInput = {
  /** Chronological, and already bounded by the search window and grid hours. */
  readonly slots: readonly SchedulingSlot[]
  readonly minSessionHours: number
  readonly quorum: number
  readonly participants: readonly SchedulingParticipant[]
}

/** What one person's answer is worth over one window: 1, 0.6 or 0. */
export type ParticipantQuality = {
  readonly userId: string
  readonly priority: ParticipantPriority
  readonly isKeeper: boolean
  readonly quality: number
}

/**
 * A caveat worth printing next to a proposal.
 *
 * Carries ids rather than sentences: the wording belongs to the presentation
 * layer, and the names belong to the Keeper's view, which is the only place
 * authorized to resolve them.
 */
export type ExplanationNote =
  | { readonly kind: 'AT_A_PUSH'; readonly userIds: readonly string[] }
  | { readonly kind: 'UNAVAILABLE'; readonly userIds: readonly string[] }
  | { readonly kind: 'NO_RESPONSE'; readonly count: number }

export type CandidateExplanation = {
  /**
   * `EVERYONE_FREE` only when every invited person is firmly free for the whole
   * core - including the ones whose absence would not have blocked it.
   */
  readonly headline: 'EVERYONE_FREE' | 'ALL_REQUIRED_FREE'
  readonly requiredMet: number
  readonly requiredTotal: number
  readonly preferredMet: number
  readonly preferredTotal: number
  readonly optionalMet: number
  readonly optionalTotal: number
  readonly notes: readonly ExplanationNote[]
}

/**
 * Why a window was ranked where it was.
 *
 * "Met" means firmly free for the whole core, not merely able to come: a
 * participant at a push is available and counts towards quorum, but saying "all
 * preferred available" of them would overstate what they offered.
 */
export type CandidateBreakdown = {
  readonly coreHours: number
  readonly extendedHours: number
  /** Non-Keeper participants who could attend at all. Compared against quorum. */
  readonly availableCount: number
  readonly investigatorCount: number
  readonly noResponseCount: number
  readonly quorum: number
  readonly quorumMet: boolean
  readonly perParticipant: readonly ParticipantQuality[]
}

export type RankedCandidate = {
  readonly rank: number
  readonly startUtc: string
  readonly endUtc: string
  readonly localDate: string
  readonly startHour: number
  /** 0–100, rounded to two decimals - the number a Keeper is shown. */
  readonly score: number
  readonly breakdown: CandidateBreakdown
  readonly explanation: CandidateExplanation
}

export type RejectionReason = 'KEEPER_UNAVAILABLE' | 'REQUIRED_UNAVAILABLE' | 'QUORUM_NOT_MET'

/**
 * What stood in the way, aggregated.
 *
 * Kept as counts rather than a list of every rejected window: a ninety-day
 * search rejects around a thousand of them, and the useful question is not which
 * ones but who, and by how much.
 */
export type RejectionSummary = {
  readonly windowsConsidered: number
  readonly windowsRejected: number
  readonly byReason: Readonly<Record<RejectionReason, number>>
  /** Who blocked the most windows, most first. Keepers and required players only. */
  readonly blockedBy: readonly { readonly userId: string; readonly windows: number }[]
  /** The closest any window came to quorum, for windows that failed on quorum alone. */
  readonly bestAvailableCount: number
  readonly quorum: number
}

export type SchedulingOutput = {
  readonly algorithmVersion: string
  readonly ranked: readonly RankedCandidate[]
  readonly summary: RejectionSummary
}

/**
 * What the scheduling screen renders.
 *
 * Keeper-only, which is why it may carry names: choosing a date means weighing
 * who is only free at a push, and that cannot be done against anonymous counts.
 * An Investigator never reaches the query that builds this.
 */
export type ProposalView = {
  readonly id: string
  readonly rank: number
  readonly startUtc: Date
  readonly endUtc: Date
  readonly score: number
  readonly breakdown: CandidateBreakdown
  readonly explanation: CandidateExplanation
}

export type SchedulingRunView = {
  readonly id: string
  readonly createdAt: Date
  readonly algorithmVersion: string
  readonly summary: RejectionSummary
  /**
   * Somebody answered after this search ran, so its ranking no longer reflects
   * what the group said. Shown rather than hidden: silently re-running would
   * change a list the Keeper is in the middle of reading.
   */
  readonly staleAnswers: boolean
}

export type SchedulingView = {
  readonly sessionId: string
  readonly timezone: string
  readonly quorum: number
  readonly minSessionHours: number
  readonly searchWindowStart: string
  readonly searchWindowEnd: string
  readonly participantCount: number
  readonly respondentCount: number
  /** Participant ids to display names, for resolving a breakdown. */
  readonly names: Readonly<Record<string, string>>
  readonly run: SchedulingRunView | null
  readonly proposals: readonly ProposalView[]
  readonly acceptedProposalId: string | null
  readonly confirmedStartUtc: Date | null
  readonly confirmedEndUtc: Date | null
  /** Whether the session's current status allows a search at all. */
  readonly canRun: boolean
}
