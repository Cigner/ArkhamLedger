import { describe, expect, it } from 'vitest'
import { skillCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/skill-catalog'
import { calculateSkillBaseValue } from '@/modules/investigators/domain/skills'

/**
 * Call of Cthulhu 7e operational skill catalog.
 *
 * The catalog carries stable ids, i18n keys, base-value formulas,
 * specialization families, era availability, and creation policies.
 */
describe('Call of Cthulhu 7e skill catalog', () => {
  it('contains every supported sheet skill once', () => {
    expect(skillCatalog.skills).toHaveLength(44)
    expect(new Set(skillCatalog.skills.map(({ id }) => id)).size).toBe(44)
  })

  it('defines every open specialization family once', () => {
    expect(skillCatalog.families.map(({ id }) => id)).toEqual([
      'art-craft',
      'fighting',
      'firearms',
      'language-other',
      'pilot',
      'science',
      'survival',
    ])
  })

  it('keeps modern-only skills out of the Classic 1920s selection', () => {
    expect(skillCatalog.skills.find(({ id }) => id === 'computer-use')).toMatchObject({
      availability: ['MODERN'],
      baseValue: { kind: 'FIXED', value: 5 },
    })
    expect(skillCatalog.skills.find(({ id }) => id === 'electronics')).toMatchObject({
      availability: ['MODERN'],
      baseValue: { kind: 'FIXED', value: 1 },
    })
  })

  it('keeps Cthulhu Mythos outside ordinary creation and development', () => {
    expect(skillCatalog.skills.find(({ id }) => id === 'cthulhu-mythos')).toMatchObject({
      creationRule: 'KEEPER_OVERRIDE',
      developmentRule: 'MYTHOS_ONLY',
      baseValue: { kind: 'FIXED', value: 0 },
    })
  })

  it('represents characteristic-derived bases as formulas', () => {
    expect(skillCatalog.skills.find(({ id }) => id === 'dodge')?.baseValue).toEqual({
      kind: 'CHARACTERISTIC_FRACTION',
      characteristic: 'DEX',
      divisor: 2,
    })
    expect(skillCatalog.skills.find(({ id }) => id === 'language-own')?.baseValue).toEqual({
      kind: 'CHARACTERISTIC',
      characteristic: 'EDU',
    })
  })
})

describe('calculateSkillBaseValue', () => {
  const characteristics = {
    STR: 40,
    CON: 50,
    SIZ: 60,
    DEX: 55,
    APP: 45,
    INT: 70,
    POW: 65,
    EDU: 75,
  } as const

  it('returns a fixed base value', () => {
    expect(calculateSkillBaseValue({ kind: 'FIXED', value: 25 }, characteristics)).toBe(25)
  })

  it('uses a complete characteristic value', () => {
    expect(
      calculateSkillBaseValue({ kind: 'CHARACTERISTIC', characteristic: 'EDU' }, characteristics),
    ).toBe(75)
  })

  it('rounds a characteristic fraction down', () => {
    expect(
      calculateSkillBaseValue(
        {
          kind: 'CHARACTERISTIC_FRACTION',
          characteristic: 'DEX',
          divisor: 2,
        },
        characteristics,
      ),
    ).toBe(27)
  })
})
