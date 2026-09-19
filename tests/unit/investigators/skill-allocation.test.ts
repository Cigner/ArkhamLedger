import { describe, expect, it } from 'vitest'
import {
  summarizeSkillPointAllocation,
  validateSkillPointAllocation,
} from '@/modules/investigators/domain/skill-allocation'

const baseInput = {
  occupationBudget: 300,
  personalInterestBudget: 140,
  occupationSkillKeys: ['accounting', 'law', 'credit-rating'],
  creditRating: { minimum: 30, maximum: 70 },
  allocations: [
    {
      skillKey: 'accounting',
      baseValue: 5,
      occupationPoints: 70,
      personalInterestPoints: 10,
      otherAdjustment: 0,
    },
    {
      skillKey: 'law',
      baseValue: 5,
      occupationPoints: 60,
      personalInterestPoints: 0,
      otherAdjustment: 0,
    },
    {
      skillKey: 'credit-rating',
      baseValue: 0,
      occupationPoints: 40,
      personalInterestPoints: 0,
      otherAdjustment: 0,
    },
  ],
} as const

describe('skill point allocation', () => {
  it('reports spent and remaining point pools', () => {
    expect(summarizeSkillPointAllocation(baseInput)).toEqual({
      occupationSpent: 170,
      occupationRemaining: 130,
      personalInterestSpent: 10,
      personalInterestRemaining: 130,
    })
  })

  it('accepts a valid incomplete allocation', () => {
    expect(validateSkillPointAllocation(baseInput)).toEqual({
      ok: true,
      value: {
        occupationSpent: 170,
        occupationRemaining: 130,
        personalInterestSpent: 10,
        personalInterestRemaining: 130,
      },
    })
  })

  it('rejects occupation points assigned outside occupation skills', () => {
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: [
          ...baseInput.allocations,
          {
            skillKey: 'swim',
            baseValue: 20,
            occupationPoints: 10,
            personalInterestPoints: 0,
            otherAdjustment: 0,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.occupationPointsOnUnavailableSkill',
        params: { skillKey: 'swim' },
      },
    })
  })

  it('rejects overspending either point pool', () => {
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        occupationBudget: 100,
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.occupationPointBudgetExceeded',
        params: { budget: 100, spent: 170 },
      },
    })
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        personalInterestBudget: 5,
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.personalInterestPointBudgetExceeded',
        params: { budget: 5, spent: 10 },
      },
    })
  })

  it('rejects a Credit Rating outside the occupation range', () => {
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: baseInput.allocations.map((allocation) =>
          allocation.skillKey === 'credit-rating'
            ? { ...allocation, occupationPoints: 20 }
            : allocation,
        ),
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.creditRatingOutsideOccupationRange',
        params: { minimum: 30, maximum: 70, value: 20 },
      },
    })
  })

  it('rejects allocations to Cthulhu Mythos and values above 99', () => {
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: [
          ...baseInput.allocations,
          {
            skillKey: 'cthulhu-mythos',
            baseValue: 0,
            occupationPoints: 0,
            personalInterestPoints: 1,
            otherAdjustment: 0,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { key: 'investigators.errors.cthulhuMythosCannotReceiveCreationPoints' },
    })
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: baseInput.allocations.map((allocation) =>
          allocation.skillKey === 'accounting'
            ? { ...allocation, occupationPoints: 95 }
            : allocation,
        ),
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.skillValueOutOfRange',
        params: { skillKey: 'accounting', value: 110 },
      },
    })
  })

  it('rejects duplicate skill keys and negative allocations', () => {
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: [...baseInput.allocations, baseInput.allocations[0]],
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.duplicateSkillAllocation',
        params: { skillKey: 'accounting' },
      },
    })
    expect(
      validateSkillPointAllocation({
        ...baseInput,
        allocations: [{ ...baseInput.allocations[0], occupationPoints: -1 }],
      }),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.invalidSkillAllocation',
        params: { skillKey: 'accounting' },
      },
    })
  })
})
