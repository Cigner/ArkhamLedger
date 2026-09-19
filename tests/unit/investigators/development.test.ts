import { describe, expect, it } from 'vitest'
import { developmentSucceeds, resolveDevelopment } from '@/modules/investigators/domain/development'

/**
 * The development roll.
 *
 * Keeper Rulebook page 105: roll higher than the skill, or above 95, and gain
 * 1D10. The shape of that rule is the point - an expert improves rarely and a
 * beginner often - so the tests are written at the boundaries where it bites.
 */
describe('developmentSucceeds', () => {
  it('improves on a roll above the skill', () => {
    const result = developmentSucceeds({ percentileRoll: 61, currentValue: 60 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('ABOVE_SKILL')
  })

  it('does not improve on a roll equal to the skill', () => {
    const result = developmentSucceeds({ percentileRoll: 60, currentValue: 60 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBeNull()
  })

  /*
   * The clause that stops anybody being finished. At 99 nothing can roll higher,
   * so without it an expert could never learn again.
   */
  it('improves above 95 however good the character is', () => {
    const result = developmentSucceeds({ percentileRoll: 96, currentValue: 99 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('ABOVE_95')
  })

  it('does not improve at exactly 95 for an expert', () => {
    const result = developmentSucceeds({ percentileRoll: 95, currentValue: 99 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBeNull()
  })

  it('refuses a roll outside a hundred-sided die', () => {
    expect(developmentSucceeds({ percentileRoll: 0, currentValue: 50 }).ok).toBe(false)
    expect(developmentSucceeds({ percentileRoll: 101, currentValue: 50 }).ok).toBe(false)
  })
})

describe('resolveDevelopment', () => {
  it('adds the improvement roll when it succeeded', () => {
    const result = resolveDevelopment({
      currentValue: 40,
      percentileRoll: 71,
      improvementRoll: 7,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      improved: true,
      previous: 40,
      current: 47,
      increase: 7,
      basis: 'ABOVE_SKILL',
    })
  })

  it('leaves the skill alone when it failed', () => {
    const result = resolveDevelopment({ currentValue: 80, percentileRoll: 40 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.improved).toBe(false)
    expect(result.value.current).toBe(80)
  })

  it('needs the second roll once the first one earned it', () => {
    const result = resolveDevelopment({ currentValue: 40, percentileRoll: 71 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.improvementRollRequired')
  })

  /*
   * Ninety-nine is the ceiling, so a character at 97 who rolls a ten gains two.
   * Reporting the increase rather than the die is what the sheet needs.
   */
  it('stops at the ceiling and reports the real gain', () => {
    const result = resolveDevelopment({
      currentValue: 97,
      percentileRoll: 98,
      improvementRoll: 10,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.current).toBe(99)
    expect(result.value.increase).toBe(2)
  })

  it('refuses an improvement roll that is not a ten-sided die', () => {
    expect(
      resolveDevelopment({ currentValue: 40, percentileRoll: 71, improvementRoll: 11 }).ok,
    ).toBe(false)
    expect(
      resolveDevelopment({ currentValue: 40, percentileRoll: 71, improvementRoll: 0 }).ok,
    ).toBe(false)
  })
})
