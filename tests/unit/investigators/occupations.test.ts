import { describe, expect, it } from 'vitest'
import {
  calculateOccupationSkillPoints,
  calculatePersonalInterestPoints,
  occupationCatalogSchema,
  occupationDefinitionSchema,
  validateOccupationCatalogReferences,
} from '@/modules/investigators/domain/occupations'
import { skillCatalogSchema } from '@/modules/investigators/domain/skills'

/**
 * Occupation definitions and point formulas.
 */
describe('occupation skill point formulas', () => {
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

  it('calculates four times education', () => {
    expect(calculateOccupationSkillPoints({ id: 'EDU_X4' }, characteristics)).toEqual({
      ok: true,
      value: 300,
    })
  })

  it('calculates education plus an allowed selected characteristic', () => {
    expect(
      calculateOccupationSkillPoints(
        {
          id: 'EDU_X2_PLUS_SELECTED_X2',
          allowedCharacteristics: ['DEX', 'STR'],
        },
        characteristics,
        'DEX',
      ),
    ).toEqual({ ok: true, value: 260 })
  })

  it('rejects a missing selected characteristic', () => {
    expect(
      calculateOccupationSkillPoints(
        {
          id: 'EDU_X2_PLUS_SELECTED_X2',
          allowedCharacteristics: ['APP', 'POW'],
        },
        characteristics,
      ),
    ).toEqual({
      ok: false,
      error: { key: 'investigators.errors.occupationCharacteristicRequired' },
    })
  })

  it('rejects a characteristic outside the occupation choices', () => {
    expect(
      calculateOccupationSkillPoints(
        {
          id: 'EDU_X2_PLUS_SELECTED_X2',
          allowedCharacteristics: ['APP', 'POW'],
        },
        characteristics,
        'DEX',
      ),
    ).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.occupationCharacteristicNotAllowed',
        params: { characteristic: 'DEX' },
      },
    })
  })

  it('supports the exceptional education, dexterity, and strength formula', () => {
    expect(
      calculateOccupationSkillPoints({ id: 'EDU_X2_PLUS_DEX_X2_PLUS_STR_X2' }, characteristics),
    ).toEqual({ ok: true, value: 340 })
  })
})

describe('personal interest points', () => {
  it('calculates twice intelligence', () => {
    expect(calculatePersonalInterestPoints(70)).toBe(140)
  })
})

describe('occupationDefinitionSchema', () => {
  const validOccupation = {
    id: 'test-occupation',
    nameKey: 'investigators.occupations.testOccupation',
    availability: ['CLASSIC_1920S', 'MODERN'],
    tags: [],
    pointFormula: { id: 'EDU_X4' },
    creditRating: { minimum: 10, maximum: 40 },
    skillSlots: [
      { kind: 'SKILL', skillId: 'accounting' },
      { kind: 'SKILL', skillId: 'law' },
      { kind: 'SKILL', skillId: 'library-use' },
      { kind: 'FAMILY', familyId: 'language-other' },
      {
        kind: 'ONE_OF',
        count: 2,
        options: [
          { kind: 'SKILL', skillId: 'charm' },
          { kind: 'SKILL', skillId: 'fast-talk' },
          { kind: 'SKILL', skillId: 'intimidate' },
          { kind: 'SKILL', skillId: 'persuade' },
        ],
      },
      { kind: 'ANY', count: 2 },
    ],
  } as const

  it('accepts an occupation resolving to eight skill slots', () => {
    expect(occupationDefinitionSchema.safeParse(validOccupation).success).toBe(true)
  })

  it('rejects an occupation resolving to any other number of slots', () => {
    expect(
      occupationDefinitionSchema.safeParse({
        ...validOccupation,
        skillSlots: validOccupation.skillSlots.slice(0, -1),
      }).success,
    ).toBe(false)
  })

  it('rejects a reversed Credit Rating range', () => {
    expect(
      occupationDefinitionSchema.safeParse({
        ...validOccupation,
        creditRating: { minimum: 50, maximum: 20 },
      }).success,
    ).toBe(false)
  })
})

describe('occupation catalog validation', () => {
  const skills = skillCatalogSchema.parse({
    version: '1.0.0',
    families: [
      {
        id: 'art-craft',
        nameKey: 'investigators.skillFamilies.artCraft',
        baseValue: { kind: 'FIXED', value: 5 },
      },
    ],
    skills: [
      {
        id: 'accounting',
        nameKey: 'investigators.skills.accounting',
        baseValue: { kind: 'FIXED', value: 5 },
        creationRule: 'STANDARD',
        developmentRule: 'STANDARD',
      },
    ],
  })

  const validCatalog = {
    version: '1.0.0',
    choiceGroups: [
      {
        id: 'professional',
        options: [
          { kind: 'SKILL', skillId: 'accounting' },
          { kind: 'FAMILY', familyId: 'art-craft' },
        ],
      },
    ],
    occupations: [
      {
        id: 'test-occupation',
        nameKey: 'investigators.occupations.testOccupation',
        availability: ['CLASSIC_1920S', 'MODERN'],
        tags: [],
        pointFormula: { id: 'EDU_X4' },
        creditRating: { minimum: 10, maximum: 40 },
        skillSlots: [
          { kind: 'SKILL', skillId: 'accounting' },
          { kind: 'FAMILY', familyId: 'art-craft' },
          { kind: 'GROUP', groupId: 'professional', count: 2 },
          { kind: 'ANY', count: 4 },
        ],
      },
    ],
  } as const

  it('accepts reusable choice groups and valid catalog references', () => {
    const catalog = occupationCatalogSchema.parse(validCatalog)
    expect(validateOccupationCatalogReferences(catalog, skills)).toEqual({
      ok: true,
      value: undefined,
    })
  })

  it('rejects a group choice count larger than the group', () => {
    expect(
      occupationCatalogSchema.safeParse({
        ...validCatalog,
        occupations: [
          {
            ...validCatalog.occupations[0],
            skillSlots: [
              { kind: 'GROUP', groupId: 'professional', count: 3 },
              { kind: 'ANY', count: 5 },
            ],
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('reports unknown skill, family, and group references', () => {
    const catalog = occupationCatalogSchema.parse({
      ...validCatalog,
      occupations: [
        {
          ...validCatalog.occupations[0],
          skillSlots: [
            { kind: 'SKILL', skillId: 'unknown-skill' },
            { kind: 'FAMILY', familyId: 'unknown-family' },
            { kind: 'GROUP', groupId: 'professional', count: 1 },
            { kind: 'ANY', count: 5 },
          ],
        },
      ],
    })

    expect(validateOccupationCatalogReferences(catalog, skills)).toEqual({
      ok: false,
      error: {
        key: 'investigators.errors.invalidOccupationCatalogReferences',
        params: { references: 'family:unknown-family,skill:unknown-skill' },
      },
    })
  })
})
