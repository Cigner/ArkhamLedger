import { describe, expect, it } from 'vitest'
import { ageAdjustmentFor } from '@/modules/investigators/domain/age'

/**
 * Age adjustments.
 *
 * The age bands are inclusive and combine independent obligations: education
 * checks, physical reductions, appearance reductions, Luck rolls, and movement
 * penalties. Testing complete records prevents one part drifting from another.
 */
describe('ageAdjustmentFor', () => {
  it.each([
    [
      15,
      {
        educationImprovementChecks: 0,
        educationReduction: 5,
        physicalReduction: { total: 5, eligible: ['STR', 'SIZ'] },
        appearanceReduction: 0,
        luckRolls: 2,
        movementPenalty: 0,
      },
    ],
    [
      20,
      {
        educationImprovementChecks: 1,
        educationReduction: 0,
        physicalReduction: { total: 0, eligible: [] },
        appearanceReduction: 0,
        luckRolls: 1,
        movementPenalty: 0,
      },
    ],
    [
      40,
      {
        educationImprovementChecks: 2,
        educationReduction: 0,
        physicalReduction: { total: 5, eligible: ['STR', 'CON', 'DEX'] },
        appearanceReduction: 5,
        luckRolls: 1,
        movementPenalty: 1,
      },
    ],
    [
      50,
      {
        educationImprovementChecks: 3,
        educationReduction: 0,
        physicalReduction: { total: 10, eligible: ['STR', 'CON', 'DEX'] },
        appearanceReduction: 10,
        luckRolls: 1,
        movementPenalty: 2,
      },
    ],
    [
      60,
      {
        educationImprovementChecks: 4,
        educationReduction: 0,
        physicalReduction: { total: 20, eligible: ['STR', 'CON', 'DEX'] },
        appearanceReduction: 15,
        luckRolls: 1,
        movementPenalty: 3,
      },
    ],
    [
      70,
      {
        educationImprovementChecks: 4,
        educationReduction: 0,
        physicalReduction: { total: 40, eligible: ['STR', 'CON', 'DEX'] },
        appearanceReduction: 20,
        luckRolls: 1,
        movementPenalty: 4,
      },
    ],
    [
      90,
      {
        educationImprovementChecks: 4,
        educationReduction: 0,
        physicalReduction: { total: 80, eligible: ['STR', 'CON', 'DEX'] },
        appearanceReduction: 25,
        luckRolls: 1,
        movementPenalty: 5,
      },
    ],
  ] as const)('returns the complete rule for age %i', (age, expected) => {
    expect(ageAdjustmentFor(age)).toEqual({ ok: true, value: expected })
  })

  it.each([14, 91, 15.5])('rejects unsupported age %s', (age) => {
    expect(ageAdjustmentFor(age)).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.ageOutOfRange',
        params: { minimum: 15, maximum: 90 },
      },
    })
  })
})
