import { describe, expect, it } from 'vitest'
import {
  calculateDamageBonusAndBuild,
  calculateHitPoints,
  calculateMagicPoints,
  calculateMaximumSanity,
  calculateMovementRate,
  calculateStartingSanity,
  calculateSuccessThresholds,
} from '@/modules/investigators/domain/derived-values'

/**
 * Investigator derived values.
 *
 * Boundaries are the risk: half and fifth values round down, movement changes
 * when either comparison crosses equality, and damage bonus changes at
 * irregular table edges before settling into repeating eighty-point bands.
 */
describe('success thresholds', () => {
  it('rounds hard and extreme values down', () => {
    expect(calculateSuccessThresholds(81)).toEqual({
      regular: 81,
      hard: 40,
      extreme: 16,
    })
  })

  it('keeps values below their divisor at zero', () => {
    expect(calculateSuccessThresholds(1)).toEqual({
      regular: 1,
      hard: 0,
      extreme: 0,
    })
  })
})

describe('resources', () => {
  it('rounds maximum hit points down', () => {
    expect(calculateHitPoints({ constitution: 45, size: 64 })).toBe(10)
  })

  it('derives magic points and starting sanity from power', () => {
    expect(calculateMagicPoints(65)).toBe(13)
    expect(calculateStartingSanity(65)).toBe(65)
  })

  it('reduces maximum sanity by Cthulhu Mythos', () => {
    expect(calculateMaximumSanity(12)).toBe(87)
  })
})

describe('movement rate', () => {
  it.each([
    [{ strength: 40, dexterity: 45, size: 50, age: 30 }, 7],
    [{ strength: 50, dexterity: 45, size: 50, age: 30 }, 8],
    [{ strength: 50, dexterity: 50, size: 50, age: 30 }, 8],
    [{ strength: 55, dexterity: 60, size: 50, age: 30 }, 9],
    [{ strength: 55, dexterity: 60, size: 50, age: 45 }, 8],
    [{ strength: 55, dexterity: 60, size: 50, age: 85 }, 4],
  ] as const)('calculates $1 for %o', (input, expected) => {
    expect(calculateMovementRate(input)).toBe(expected)
  })
})

describe('damage bonus and build', () => {
  it.each([
    [64, { damageBonus: { kind: 'FIXED', value: -2 }, build: -2 }],
    [65, { damageBonus: { kind: 'FIXED', value: -1 }, build: -1 }],
    [84, { damageBonus: { kind: 'FIXED', value: -1 }, build: -1 }],
    [85, { damageBonus: { kind: 'FIXED', value: 0 }, build: 0 }],
    [124, { damageBonus: { kind: 'FIXED', value: 0 }, build: 0 }],
    [125, { damageBonus: { kind: 'DICE', count: 1, sides: 4 }, build: 1 }],
    [164, { damageBonus: { kind: 'DICE', count: 1, sides: 4 }, build: 1 }],
    [165, { damageBonus: { kind: 'DICE', count: 1, sides: 6 }, build: 2 }],
    [204, { damageBonus: { kind: 'DICE', count: 1, sides: 6 }, build: 2 }],
    [205, { damageBonus: { kind: 'DICE', count: 2, sides: 6 }, build: 3 }],
    [284, { damageBonus: { kind: 'DICE', count: 2, sides: 6 }, build: 3 }],
    [285, { damageBonus: { kind: 'DICE', count: 3, sides: 6 }, build: 4 }],
    [524, { damageBonus: { kind: 'DICE', count: 5, sides: 6 }, build: 6 }],
    [525, { damageBonus: { kind: 'DICE', count: 6, sides: 6 }, build: 7 }],
  ] as const)('maps a combined strength and size of %i', (combined, expected) => {
    expect(calculateDamageBonusAndBuild(combined)).toEqual(expected)
  })
})
