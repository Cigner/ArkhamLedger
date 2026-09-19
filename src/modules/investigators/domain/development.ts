import { type Result, fail, ok } from '@/lib/result'

/**
 * Learning from what you survived.
 *
 * A skill used successfully in play gets a tick, and at the end of a chapter
 * each ticked skill gets one development roll - one, however many times it was
 * ticked. The rules are on page 105 of the Keeper Rulebook.
 *
 * The roll succeeds when it comes up higher than the skill, or above 95. The
 * first clause is the interesting one: being expert at something means you
 * usually succeed at it and rarely learn anything new, which is why a character
 * at 80 improves far less often than one at 20. The second clause is the
 * reason nobody is ever completely finished.
 *
 * Both rolls are supplied rather than generated. Dice belong to the table.
 */
const MINIMUM_SKILL = 0
const MAXIMUM_SKILL = 99
const ALWAYS_IMPROVES_ABOVE = 95

const MINIMUM_PERCENTILE_ROLL = 1
const MAXIMUM_PERCENTILE_ROLL = 100
const MINIMUM_IMPROVEMENT_ROLL = 1
const MAXIMUM_IMPROVEMENT_ROLL = 10

export type DevelopmentOutcome = {
  readonly improved: boolean
  readonly previous: number
  readonly current: number
  readonly increase: number
  /** Why it improved, for a sheet that can explain itself afterwards. */
  readonly basis: 'ABOVE_SKILL' | 'ABOVE_95' | null
}

function isIntegerBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

/**
 * Whether a percentile roll earns an improvement.
 *
 * Separate from applying it, because the table rolls in two steps and the
 * second die is only thrown when the first one earned it.
 */
export function developmentSucceeds(input: {
  readonly percentileRoll: number
  readonly currentValue: number
}): Result<'ABOVE_SKILL' | 'ABOVE_95' | null> {
  if (!isIntegerBetween(input.currentValue, MINIMUM_SKILL, MAXIMUM_SKILL)) {
    return fail('investigators.errors.skillValueOutOfRange', { value: input.currentValue })
  }

  if (!isIntegerBetween(input.percentileRoll, MINIMUM_PERCENTILE_ROLL, MAXIMUM_PERCENTILE_ROLL)) {
    return fail('investigators.errors.invalidPercentileRoll', {
      minimum: MINIMUM_PERCENTILE_ROLL,
      maximum: MAXIMUM_PERCENTILE_ROLL,
    })
  }

  if (input.percentileRoll > ALWAYS_IMPROVES_ABOVE) return ok('ABOVE_95')
  if (input.percentileRoll > input.currentValue) return ok('ABOVE_SKILL')
  return ok(null)
}

export function resolveDevelopment(input: {
  readonly currentValue: number
  readonly percentileRoll: number
  readonly improvementRoll?: number
}): Result<DevelopmentOutcome> {
  const basis = developmentSucceeds({
    percentileRoll: input.percentileRoll,
    currentValue: input.currentValue,
  })
  if (!basis.ok) return basis

  if (basis.value === null) {
    return ok({
      improved: false,
      previous: input.currentValue,
      current: input.currentValue,
      increase: 0,
      basis: null,
    })
  }

  if (input.improvementRoll === undefined) {
    return fail('investigators.errors.improvementRollRequired')
  }

  if (
    !isIntegerBetween(input.improvementRoll, MINIMUM_IMPROVEMENT_ROLL, MAXIMUM_IMPROVEMENT_ROLL)
  ) {
    return fail('investigators.errors.invalidImprovementRoll', {
      minimum: MINIMUM_IMPROVEMENT_ROLL,
      maximum: MAXIMUM_IMPROVEMENT_ROLL,
    })
  }

  const current = Math.min(MAXIMUM_SKILL, input.currentValue + input.improvementRoll)

  return ok({
    improved: true,
    previous: input.currentValue,
    current,
    increase: current - input.currentValue,
    basis: basis.value,
  })
}
