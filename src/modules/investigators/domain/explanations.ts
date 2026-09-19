import { MAXIMUM_SANITY_BASE, MOVEMENT_PENALTY_BY_MINIMUM_AGE } from './constants'
import type { CharacteristicKey } from './types'

/**
 * Where a calculated number came from.
 *
 * Section 8 asks every derived value to explain itself, and the reason is not
 * pedagogy: a player who cannot see why their Build is 2 has to either trust the
 * application or reach for the book, and one of those is how mistakes survive.
 *
 * The explanation is built from the same inputs the calculation used, so it
 * cannot drift into describing a formula the engine no longer applies. It says
 * what was used and how, and leaves the arithmetic on screen beside the answer.
 */
export type Explanation = {
  /** The rule, as a translation key. */
  readonly key: string
  /** The numbers that went into it, for the sentence to name. */
  readonly inputs: Readonly<Record<string, number | string>>
}

export function explainHitPoints(input: {
  readonly constitution: number
  readonly size: number
}): Explanation {
  return {
    key: 'investigators.why.hitPoints',
    inputs: { con: input.constitution, siz: input.size, total: input.constitution + input.size },
  }
}

export function explainMagicPoints(power: number): Explanation {
  return { key: 'investigators.why.magicPoints', inputs: { pow: power } }
}

export function explainSanity(power: number): Explanation {
  return { key: 'investigators.why.sanity', inputs: { pow: power } }
}

export function explainMaximumSanity(cthulhuMythos: number): Explanation {
  return {
    key: 'investigators.why.maximumSanity',
    inputs: { base: MAXIMUM_SANITY_BASE, mythos: cthulhuMythos },
  }
}

/**
 * Movement, which has three inputs and a table nobody remembers.
 *
 * The comparison that decided the base is named rather than the base alone: "8
 * because neither is higher than SIZ" is the sentence that stops somebody
 * checking.
 */
export function explainMovement(input: {
  readonly strength: number
  readonly dexterity: number
  readonly size: number
  readonly age: number
}): Explanation {
  const both = input.strength < input.size && input.dexterity < input.size
  const neither = input.strength > input.size && input.dexterity > input.size
  const penalty =
    MOVEMENT_PENALTY_BY_MINIMUM_AGE.find(({ minimumAge }) => input.age >= minimumAge)?.penalty ?? 0

  return {
    key: both
      ? 'investigators.why.movementLow'
      : neither
        ? 'investigators.why.movementHigh'
        : 'investigators.why.movementMiddle',
    inputs: {
      str: input.strength,
      dex: input.dexterity,
      siz: input.size,
      age: input.age,
      penalty,
    },
  }
}

export function explainBuild(input: {
  readonly strength: number
  readonly size: number
}): Explanation {
  return {
    key: 'investigators.why.build',
    inputs: { str: input.strength, siz: input.size, total: input.strength + input.size },
  }
}

export function explainSkillBase(input: {
  readonly kind: 'FIXED' | 'CHARACTERISTIC' | 'CHARACTERISTIC_FRACTION'
  readonly value?: number
  readonly characteristic?: CharacteristicKey
  readonly divisor?: number
}): Explanation {
  switch (input.kind) {
    case 'FIXED':
      return { key: 'investigators.why.skillFixed', inputs: { value: input.value ?? 0 } }
    case 'CHARACTERISTIC':
      return {
        key: 'investigators.why.skillCharacteristic',
        inputs: { characteristic: input.characteristic ?? '' },
      }
    case 'CHARACTERISTIC_FRACTION':
      return {
        key: 'investigators.why.skillFraction',
        inputs: { characteristic: input.characteristic ?? '', divisor: input.divisor ?? 1 },
      }
  }
}

export function explainThresholds(value: number): Explanation {
  return {
    key: 'investigators.why.thresholds',
    inputs: { value, hard: Math.floor(value / 2), extreme: Math.floor(value / 5) },
  }
}
