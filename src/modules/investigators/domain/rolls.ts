import { type Result, fail, ok } from '@/lib/result'
import type { CreationRollFormula } from './ruleset'

/**
 * Characteristic creation roll formulas.
 *
 * Dice generation is injected outside the domain. This module validates and
 * evaluates the recorded result so app-generated and physical rolls follow the
 * same path.
 */
const CREATION_ROLL_FORMULAS = {
  THREE_D6_TIMES_FIVE: { diceCount: 3, flatBonus: 0 },
  TWO_D6_PLUS_SIX_TIMES_FIVE: { diceCount: 2, flatBonus: 6 },
} as const satisfies Readonly<
  Record<CreationRollFormula, { readonly diceCount: number; readonly flatBonus: number }>
>

export function evaluateCreationRoll(
  formula: CreationRollFormula,
  dice: readonly number[],
): Result<number> {
  const definition = CREATION_ROLL_FORMULAS[formula]
  if (dice.length !== definition.diceCount) {
    return fail('investigators.errors.wrongDiceCount', {
      expected: definition.diceCount,
      actual: dice.length,
    })
  }

  const invalidIndex = dice.findIndex((value) => !Number.isInteger(value) || value < 1 || value > 6)
  if (invalidIndex !== -1) {
    return fail('investigators.errors.invalidDieValue', {
      position: invalidIndex + 1,
      value: dice[invalidIndex]!,
    })
  }

  const total = dice.reduce((sum, value) => sum + value, definition.flatBonus)
  return ok(total * 5)
}
