import { type Result, fail, ok } from '@/lib/result'

/**
 * Education improvement checks applied by age rules.
 */
const MINIMUM_EDUCATION = 0
const MAXIMUM_EDUCATION = 99
const MINIMUM_PERCENTILE_ROLL = 1
const MAXIMUM_PERCENTILE_ROLL = 100
const MINIMUM_IMPROVEMENT_ROLL = 1
const MAXIMUM_IMPROVEMENT_ROLL = 10

type EducationImprovementInput = {
  readonly education: number
  readonly percentileRoll: number
  readonly improvementRoll?: number
}

type EducationImprovement = {
  readonly improved: boolean
  readonly previous: number
  readonly current: number
  readonly increase: number
}

function isIntegerBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

export function evaluateEducationImprovement(
  input: EducationImprovementInput,
): Result<EducationImprovement> {
  if (!isIntegerBetween(input.education, MINIMUM_EDUCATION, MAXIMUM_EDUCATION)) {
    return fail('investigators.errors.invalidEducation', {
      minimum: MINIMUM_EDUCATION,
      maximum: MAXIMUM_EDUCATION,
    })
  }

  if (!isIntegerBetween(input.percentileRoll, MINIMUM_PERCENTILE_ROLL, MAXIMUM_PERCENTILE_ROLL)) {
    return fail('investigators.errors.invalidPercentileRoll', {
      minimum: MINIMUM_PERCENTILE_ROLL,
      maximum: MAXIMUM_PERCENTILE_ROLL,
    })
  }

  if (input.percentileRoll <= input.education) {
    return ok({
      improved: false,
      previous: input.education,
      current: input.education,
      increase: 0,
    })
  }

  if (input.improvementRoll === undefined) {
    return fail('investigators.errors.educationImprovementRollRequired')
  }

  if (
    !isIntegerBetween(input.improvementRoll, MINIMUM_IMPROVEMENT_ROLL, MAXIMUM_IMPROVEMENT_ROLL)
  ) {
    return fail('investigators.errors.invalidImprovementRoll', {
      minimum: MINIMUM_IMPROVEMENT_ROLL,
      maximum: MAXIMUM_IMPROVEMENT_ROLL,
    })
  }

  const current = Math.min(MAXIMUM_EDUCATION, input.education + input.improvementRoll)
  return ok({
    improved: true,
    previous: input.education,
    current,
    increase: current - input.education,
  })
}
