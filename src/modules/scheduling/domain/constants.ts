/**
 * Scheduling policy constants.
 *
 * Kept apart from the algorithm so weights and limits can be tuned without
 * reading the logic they feed, and so a change to either is visible in a diff
 * as a change to policy rather than to mechanism.
 */

/**
 * Stamped on every run.
 *
 * A proposal scored under one set of weights stays explainable after the weights
 * change: the run records which version produced it, so an old ranking is never
 * silently reinterpreted under new rules. Bump this whenever weights, hard
 * constraints or tie-breakers change.
 */
export const ALGORITHM_VERSION = '1.0.0'

/** How many ranked windows are kept. Beyond ten, nobody reads further. */
export const MAX_PROPOSALS = 10

/**
 * How firmly somebody said they could be there.
 *
 * "At a push" is worth well over half a firm yes rather than a token amount: it
 * is a real offer, and treating it as nearly worthless would discard dates that
 * work in favour of dates that merely look tidier.
 */
export const STATE_VALUE = {
  YES: 1,
  IF_NEED_BE: 0.6,
  NO: 0,
  /** Never answered. Deliberately identical to a refusal — see scoring.ts. */
  UNKNOWN: 0,
} as const

/**
 * How much one person's availability moves the score.
 *
 * REQUIRED carries a weight even though its availability is already a hard
 * constraint: without one, a required player being free at a push rather than
 * firmly free would not move the ranking at all, and it should.
 */
export const PRIORITY_WEIGHT = {
  REQUIRED: 5,
  PREFERRED: 3,
  OPTIONAL: 1,
} as const
