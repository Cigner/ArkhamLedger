import { describe, expect, it } from 'vitest'
import { evaluateEducationImprovement } from '@/modules/investigators/domain/education'

/**
 * Education improvement checks used during age adjustment.
 */
describe('evaluateEducationImprovement', () => {
  it('adds a d10 result when the percentile roll exceeds education', () => {
    expect(
      evaluateEducationImprovement({
        education: 80,
        percentileRoll: 81,
        improvementRoll: 7,
      }),
    ).toEqual({
      ok: true,
      value: { improved: true, previous: 80, current: 87, increase: 7 },
    })
  })

  it('does not improve when the percentile roll equals education', () => {
    expect(
      evaluateEducationImprovement({
        education: 80,
        percentileRoll: 80,
      }),
    ).toEqual({
      ok: true,
      value: { improved: false, previous: 80, current: 80, increase: 0 },
    })
  })

  it('caps education at 99', () => {
    expect(
      evaluateEducationImprovement({
        education: 95,
        percentileRoll: 100,
        improvementRoll: 10,
      }),
    ).toEqual({
      ok: true,
      value: { improved: true, previous: 95, current: 99, increase: 4 },
    })
  })

  it('requires an improvement roll only after a successful check', () => {
    expect(
      evaluateEducationImprovement({
        education: 60,
        percentileRoll: 61,
      }),
    ).toEqual({
      ok: false,
      error: { key: 'investigators.errors.educationImprovementRollRequired' },
    })
  })

  it.each([
    [
      { education: 100, percentileRoll: 50 },
      {
        key: 'investigators.errors.invalidEducation',
        params: { minimum: 0, maximum: 99 },
      },
    ],
    [
      { education: 50, percentileRoll: 0 },
      {
        key: 'investigators.errors.invalidPercentileRoll',
        params: { minimum: 1, maximum: 100 },
      },
    ],
    [
      { education: 50, percentileRoll: 60, improvementRoll: 11 },
      {
        key: 'investigators.errors.invalidImprovementRoll',
        params: { minimum: 1, maximum: 10 },
      },
    ],
  ] as const)('rejects invalid input %#', (input, expectedError) => {
    expect(evaluateEducationImprovement(input)).toEqual({
      ok: false,
      error: expectedError,
    })
  })
})
