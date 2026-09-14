/**
 * Session policy constants.
 */

/** Hours the availability grid covers by default: an evening game. */
export const DEFAULT_GRID_START_HOUR = 16
export const DEFAULT_GRID_END_HOUR = 24

/**
 * Shortest run worth gathering people for.
 *
 * A session is assumed to continue to the end of the grid unless somebody's
 * availability cuts it short, so this is the floor rather than the length.
 */
export const DEFAULT_MIN_SESSION_HOURS = 6

/** Widest search window a Keeper may ask for, in days. */
export const MAX_SEARCH_WINDOW_DAYS = 90

export const TITLE_MIN_LENGTH = 3
export const TITLE_MAX_LENGTH = 200
export const DESCRIPTION_MAX_LENGTH = 4000
export const CANCELLATION_REASON_MAX_LENGTH = 500

/**
 * Default quorum: half the participants plus one.
 *
 * Requiring everybody hands a veto to whoever is busiest, which is the failure
 * mode that ends campaigns. Keepers are outside this count — a session without
 * its Keeper is not a session.
 */
export function defaultQuorum(investigatorCount: number): number {
  return Math.floor(investigatorCount / 2) + 1
}
