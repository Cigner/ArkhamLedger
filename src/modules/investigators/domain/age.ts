import { type Result, fail, ok } from '@/lib/result'
import { MAXIMUM_INVESTIGATOR_AGE, MINIMUM_INVESTIGATOR_AGE } from './constants'
import type { AgeAdjustment } from './types'

/**
 * Call of Cthulhu 7e age adjustments.
 *
 * Each band is a complete value so consumers cannot accidentally apply the
 * movement penalty while omitting an education or characteristic adjustment.
 */
const AGE_BANDS = [
  {
    minimum: 15,
    maximum: 19,
    adjustment: {
      educationImprovementChecks: 0,
      educationReduction: 5,
      physicalReduction: { total: 5, eligible: ['STR', 'SIZ'] },
      appearanceReduction: 0,
      luckRolls: 2,
      movementPenalty: 0,
    },
  },
  {
    minimum: 20,
    maximum: 39,
    adjustment: {
      educationImprovementChecks: 1,
      educationReduction: 0,
      physicalReduction: { total: 0, eligible: [] },
      appearanceReduction: 0,
      luckRolls: 1,
      movementPenalty: 0,
    },
  },
  {
    minimum: 40,
    maximum: 49,
    adjustment: {
      educationImprovementChecks: 2,
      educationReduction: 0,
      physicalReduction: { total: 5, eligible: ['STR', 'CON', 'DEX'] },
      appearanceReduction: 5,
      luckRolls: 1,
      movementPenalty: 1,
    },
  },
  {
    minimum: 50,
    maximum: 59,
    adjustment: {
      educationImprovementChecks: 3,
      educationReduction: 0,
      physicalReduction: { total: 10, eligible: ['STR', 'CON', 'DEX'] },
      appearanceReduction: 10,
      luckRolls: 1,
      movementPenalty: 2,
    },
  },
  {
    minimum: 60,
    maximum: 69,
    adjustment: {
      educationImprovementChecks: 4,
      educationReduction: 0,
      physicalReduction: { total: 20, eligible: ['STR', 'CON', 'DEX'] },
      appearanceReduction: 15,
      luckRolls: 1,
      movementPenalty: 3,
    },
  },
  {
    minimum: 70,
    maximum: 79,
    adjustment: {
      educationImprovementChecks: 4,
      educationReduction: 0,
      physicalReduction: { total: 40, eligible: ['STR', 'CON', 'DEX'] },
      appearanceReduction: 20,
      luckRolls: 1,
      movementPenalty: 4,
    },
  },
  {
    minimum: 80,
    maximum: 90,
    adjustment: {
      educationImprovementChecks: 4,
      educationReduction: 0,
      physicalReduction: { total: 80, eligible: ['STR', 'CON', 'DEX'] },
      appearanceReduction: 25,
      luckRolls: 1,
      movementPenalty: 5,
    },
  },
] as const satisfies readonly {
  readonly minimum: number
  readonly maximum: number
  readonly adjustment: AgeAdjustment
}[]

export function ageAdjustmentFor(age: number): Result<AgeAdjustment> {
  if (!Number.isInteger(age) || age < MINIMUM_INVESTIGATOR_AGE || age > MAXIMUM_INVESTIGATOR_AGE) {
    return fail('investigators.errors.ageOutOfRange', {
      minimum: MINIMUM_INVESTIGATOR_AGE,
      maximum: MAXIMUM_INVESTIGATOR_AGE,
    })
  }

  const band = AGE_BANDS.find(({ minimum, maximum }) => age >= minimum && age <= maximum)
  if (!band) {
    return fail('investigators.errors.ageOutOfRange', {
      minimum: MINIMUM_INVESTIGATOR_AGE,
      maximum: MAXIMUM_INVESTIGATOR_AGE,
    })
  }

  return ok(band.adjustment)
}
