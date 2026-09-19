import { MAXIMUM_SANITY_BASE, MOVEMENT_PENALTY_BY_MINIMUM_AGE } from './constants'
import type { DamageBonusAndBuild, MovementInput, SuccessThresholds } from './types'

/**
 * Call of Cthulhu 7e Investigator derived values.
 *
 * The functions assume already-validated sheet values and are deliberately
 * independent of persistence, UI, time, and randomness.
 */
export function calculateSuccessThresholds(value: number): SuccessThresholds {
  return {
    regular: value,
    hard: Math.floor(value / 2),
    extreme: Math.floor(value / 5),
  }
}

export function calculateHitPoints(input: {
  readonly constitution: number
  readonly size: number
}): number {
  return Math.floor((input.constitution + input.size) / 10)
}

export function calculateMagicPoints(power: number): number {
  return Math.floor(power / 5)
}

export function calculateStartingSanity(power: number): number {
  return power
}

export function calculateMaximumSanity(cthulhuMythos: number): number {
  return MAXIMUM_SANITY_BASE - cthulhuMythos
}

export function calculateMovementRate(input: MovementInput): number {
  const base =
    input.strength < input.size && input.dexterity < input.size
      ? 7
      : input.strength > input.size && input.dexterity > input.size
        ? 9
        : 8

  const penalty =
    MOVEMENT_PENALTY_BY_MINIMUM_AGE.find(({ minimumAge }) => input.age >= minimumAge)?.penalty ?? 0

  return base - penalty
}

/**
 * Maps the irregular human-scale bands and the repeating high-value bands from
 * the rulebook table to a structured bonus that the UI can localize.
 */
export function calculateDamageBonusAndBuild(combinedStrengthAndSize: number): DamageBonusAndBuild {
  if (combinedStrengthAndSize <= 64) {
    return { damageBonus: { kind: 'FIXED', value: -2 }, build: -2 }
  }
  if (combinedStrengthAndSize <= 84) {
    return { damageBonus: { kind: 'FIXED', value: -1 }, build: -1 }
  }
  if (combinedStrengthAndSize <= 124) {
    return { damageBonus: { kind: 'FIXED', value: 0 }, build: 0 }
  }
  if (combinedStrengthAndSize <= 164) {
    return { damageBonus: { kind: 'DICE', count: 1, sides: 4 }, build: 1 }
  }
  if (combinedStrengthAndSize <= 204) {
    return { damageBonus: { kind: 'DICE', count: 1, sides: 6 }, build: 2 }
  }

  const additionalBands = Math.floor((combinedStrengthAndSize - 205) / 80)
  return {
    damageBonus: { kind: 'DICE', count: 2 + additionalBands, sides: 6 },
    build: 3 + additionalBands,
  }
}

/**
 * The calculated values a Keeper may replace by hand.
 *
 * Section 8 allows an override with a reason, and this is the list it applies
 * to: the numbers the rules compute. Damage Bonus is deliberately absent - it
 * is a die expression rather than a number, and the one thing worse than no
 * override is one that silently fails to parse.
 */
export const OVERRIDABLE_DERIVED_KEYS = [
  'derived.hitPoints',
  'derived.sanity',
  'derived.magicPoints',
  'derived.movementRate',
  'derived.build',
] as const

export type OverridableDerivedKey = (typeof OVERRIDABLE_DERIVED_KEYS)[number]
