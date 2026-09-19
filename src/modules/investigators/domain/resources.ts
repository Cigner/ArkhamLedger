import type { InvestigatorStatus } from './lifecycle'

/**
 * What happens to a character when the numbers move.
 *
 * These are the rules the table already knows, written down so the sheet stops
 * being a place where somebody forgets them at two in the morning. Every
 * threshold here is from the Keeper Rulebook: wounds on page 131, Sanity on
 * pages 172 and 173.
 *
 * Nothing here rolls anything. The rules call for a CON roll to stay conscious
 * and an INT roll to realize what you have seen, and both belong to the people
 * at the table - so this reports that a roll is called for and what the outcome
 * would mean, rather than deciding it.
 */
export type ResourceKind = 'HP' | 'SAN' | 'MP' | 'LUCK'

export type Conditions = {
  readonly majorWound: boolean
  readonly temporaryInsanity: boolean
  readonly indefiniteInsanity: boolean
  readonly unconscious: boolean
  readonly dying: boolean
}

export const NO_CONDITIONS: Conditions = {
  majorWound: false,
  temporaryInsanity: false,
  indefiniteInsanity: false,
  unconscious: false,
  dying: false,
}

export type DamageOutcome = {
  readonly hitPoints: number
  readonly conditions: Conditions
  /** A single blow of half the character's maximum or more. */
  readonly majorWoundInflicted: boolean
  /** More than the character's maximum in one blow: no roll, no recovery. */
  readonly killedOutright: boolean
  /** The rules call for a CON roll to stay on your feet. */
  readonly constitutionRollRequired: boolean
}

/**
 * Applies damage, and says what the rules make of it.
 *
 * The size of a single blow is what separates a bruise from a week in hospital,
 * so damage is applied one attack at a time rather than as a running total: two
 * hits of four are not the same as one hit of eight, and a sheet that only
 * stored the subtraction could not tell them apart.
 *
 * Hit points stop at zero. The rulebook is explicit that nobody carries a
 * negative score, and the state below zero is described by the conditions
 * instead - which is also why dying is a flag rather than a number.
 */
export function applyDamage(input: {
  readonly damage: number
  readonly hitPoints: number
  readonly maximumHitPoints: number
  readonly conditions: Conditions
  readonly status: InvestigatorStatus
}): DamageOutcome {
  const damage = Math.max(0, Math.floor(input.damage))
  const remaining = Math.max(0, input.hitPoints - damage)

  const majorWoundInflicted = damage >= Math.ceil(input.maximumHitPoints / 2)
  const killedOutright = damage > input.maximumHitPoints

  const majorWound = input.conditions.majorWound || majorWoundInflicted
  const unconscious = input.conditions.unconscious || remaining === 0
  const dying = killedOutright || (remaining === 0 && majorWound)

  return {
    hitPoints: remaining,
    conditions: { ...input.conditions, majorWound, unconscious, dying },
    majorWoundInflicted,
    killedOutright,
    constitutionRollRequired: majorWoundInflicted && !killedOutright,
  }
}

export type SanityOutcome = {
  readonly sanity: number
  readonly conditions: Conditions
  /**
   * Five or more from one roll. The rules then call for an INT roll, and it is
   * success that costs you: realizing what you saw is what breaks a mind, while
   * failing to take it in is the mercy.
   */
  readonly intelligenceRollRequired: boolean
  /** A fifth of the day's starting Sanity, gone. */
  readonly indefiniteInsanityThresholdReached: boolean
  /** Sanity at zero is permanent madness, and the character leaves play. */
  readonly permanentlyInsane: boolean
}

export function applySanityLoss(input: {
  readonly loss: number
  readonly sanity: number
  readonly conditions: Conditions
  /** Sanity when the current in-game day began, for the one-fifth rule. */
  readonly sanityAtStartOfDay: number
  /** Everything lost today, before this roll. */
  readonly lostToday: number
}): SanityOutcome {
  const loss = Math.max(0, Math.floor(input.loss))
  const remaining = Math.max(0, input.sanity - loss)

  const intelligenceRollRequired = loss >= 5
  const threshold = Math.ceil(input.sanityAtStartOfDay / 5)
  const indefiniteInsanityThresholdReached = threshold > 0 && input.lostToday + loss >= threshold
  const permanentlyInsane = remaining === 0

  return {
    sanity: remaining,
    conditions: {
      ...input.conditions,
      indefiniteInsanity: input.conditions.indefiniteInsanity || indefiniteInsanityThresholdReached,
    },
    intelligenceRollRequired,
    indefiniteInsanityThresholdReached,
    permanentlyInsane,
  }
}

/**
 * A plain adjustment, for everything that is not damage or horror.
 *
 * Magic points, Luck, and healing all move the same way: up or down, bounded by
 * zero and the maximum, with no rules attached. Keeping them out of the two
 * functions above is deliberate - those two exist because their thresholds
 * matter, and folding everything into one would bury that.
 */
export function adjustResource(input: {
  readonly current: number
  readonly delta: number
  readonly maximum: number | null
}): number {
  const next = input.current + Math.floor(input.delta)
  const capped = input.maximum === null ? next : Math.min(next, input.maximum)
  return Math.max(0, capped)
}

/**
 * Whether a character can still be played.
 *
 * Dying is not the same as dead: somebody bleeding out is still at the table,
 * and First Aid within the hour is the whole point of the rule. Only the status
 * ends a character.
 */
export function isPlayable(status: InvestigatorStatus): boolean {
  return status === 'ACTIVE'
}
