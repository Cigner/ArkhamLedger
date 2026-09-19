import { type Result, fail, ok } from '@/lib/result'

export type SkillPointAllocation = {
  readonly skillKey: string
  readonly baseValue: number
  readonly occupationPoints: number
  readonly personalInterestPoints: number
  readonly otherAdjustment: number
}

export type SkillPointAllocationInput = {
  readonly occupationBudget: number
  readonly personalInterestBudget: number
  readonly occupationSkillKeys: readonly string[]
  readonly creditRating: {
    readonly minimum: number
    readonly maximum: number
  }
  readonly allocations: readonly SkillPointAllocation[]
}

export type SkillPointAllocationSummary = {
  readonly occupationSpent: number
  readonly occupationRemaining: number
  readonly personalInterestSpent: number
  readonly personalInterestRemaining: number
}

export function summarizeSkillPointAllocation(
  input: SkillPointAllocationInput,
): SkillPointAllocationSummary {
  const occupationSpent = input.allocations.reduce(
    (total, allocation) => total + allocation.occupationPoints,
    0,
  )
  const personalInterestSpent = input.allocations.reduce(
    (total, allocation) => total + allocation.personalInterestPoints,
    0,
  )
  return {
    occupationSpent,
    occupationRemaining: input.occupationBudget - occupationSpent,
    personalInterestSpent,
    personalInterestRemaining: input.personalInterestBudget - personalInterestSpent,
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

export function validateSkillPointAllocation(
  input: SkillPointAllocationInput,
): Result<SkillPointAllocationSummary> {
  const seenSkillKeys = new Set<string>()
  const occupationSkillKeys = new Set(input.occupationSkillKeys)

  for (const allocation of input.allocations) {
    if (seenSkillKeys.has(allocation.skillKey)) {
      return fail('investigators.errors.duplicateSkillAllocation', {
        skillKey: allocation.skillKey,
      })
    }
    seenSkillKeys.add(allocation.skillKey)

    if (
      !isNonNegativeInteger(allocation.baseValue) ||
      !isNonNegativeInteger(allocation.occupationPoints) ||
      !isNonNegativeInteger(allocation.personalInterestPoints) ||
      !Number.isInteger(allocation.otherAdjustment)
    ) {
      return fail('investigators.errors.invalidSkillAllocation', {
        skillKey: allocation.skillKey,
      })
    }

    if (
      allocation.skillKey === 'cthulhu-mythos' &&
      (allocation.occupationPoints > 0 || allocation.personalInterestPoints > 0)
    ) {
      return fail('investigators.errors.cthulhuMythosCannotReceiveCreationPoints')
    }

    if (allocation.occupationPoints > 0 && !occupationSkillKeys.has(allocation.skillKey)) {
      return fail('investigators.errors.occupationPointsOnUnavailableSkill', {
        skillKey: allocation.skillKey,
      })
    }

    const value =
      allocation.baseValue +
      allocation.occupationPoints +
      allocation.personalInterestPoints +
      allocation.otherAdjustment
    if (value < 0 || value > 99) {
      return fail('investigators.errors.skillValueOutOfRange', {
        skillKey: allocation.skillKey,
        value,
      })
    }
  }

  const summary = summarizeSkillPointAllocation(input)
  if (summary.occupationSpent > input.occupationBudget) {
    return fail('investigators.errors.occupationPointBudgetExceeded', {
      budget: input.occupationBudget,
      spent: summary.occupationSpent,
    })
  }
  if (summary.personalInterestSpent > input.personalInterestBudget) {
    return fail('investigators.errors.personalInterestPointBudgetExceeded', {
      budget: input.personalInterestBudget,
      spent: summary.personalInterestSpent,
    })
  }

  const creditRating = input.allocations.find(({ skillKey }) => skillKey === 'credit-rating')
  const creditRatingValue = creditRating
    ? creditRating.baseValue +
      creditRating.occupationPoints +
      creditRating.personalInterestPoints +
      creditRating.otherAdjustment
    : 0
  if (
    creditRatingValue < input.creditRating.minimum ||
    creditRatingValue > input.creditRating.maximum
  ) {
    return fail('investigators.errors.creditRatingOutsideOccupationRange', {
      minimum: input.creditRating.minimum,
      maximum: input.creditRating.maximum,
      value: creditRatingValue,
    })
  }

  return ok(summary)
}
