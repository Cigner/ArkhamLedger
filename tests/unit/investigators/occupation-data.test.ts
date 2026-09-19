import { describe, expect, it } from 'vitest'
import { normalizeOccupationCatalog } from '@/modules/investigators/domain/occupation-data'

describe('normalizeOccupationCatalog', () => {
  it('normalizes compact skill, family, specialization, group, and choice slots', () => {
    const catalog = normalizeOccupationCatalog({
      version: '1.0.0',
      choiceGroups: {
        interpersonal: ['charm', 'fast-talk'],
      },
      occupations: [
        {
          id: 'test-occupation',
          points: { selected: ['APP', 'DEX'] },
          credit: [10, 50],
          skills: [
            'accounting',
            '@art-craft:acting',
            { group: 'interpersonal', count: 1 },
            { oneOf: ['law', '@language-other'], count: 1 },
            { any: 4 },
          ],
        },
      ],
    })

    expect(catalog.occupations[0]).toMatchObject({
      id: 'test-occupation',
      nameKey: 'investigators.occupations.testOccupation',
      availability: ['CLASSIC_1920S', 'MODERN'],
      tags: [],
      pointFormula: {
        id: 'EDU_X2_PLUS_SELECTED_X2',
        allowedCharacteristics: ['APP', 'DEX'],
      },
      creditRating: { minimum: 10, maximum: 50 },
      skillSlots: [
        { kind: 'SKILL', skillId: 'accounting' },
        {
          kind: 'FAMILY',
          familyId: 'art-craft',
          specializationId: 'acting',
          specializationNameKey: 'investigators.specializations.acting',
        },
        { kind: 'GROUP', groupId: 'interpersonal', count: 1 },
        {
          kind: 'ONE_OF',
          count: 1,
          options: [
            { kind: 'SKILL', skillId: 'law' },
            { kind: 'FAMILY', familyId: 'language-other' },
          ],
        },
        { kind: 'ANY', count: 4 },
      ],
    })
  })

  it('rejects a source occupation that does not resolve to eight skills', () => {
    expect(() =>
      normalizeOccupationCatalog({
        version: '1.0.0',
        choiceGroups: {},
        occupations: [
          {
            id: 'invalid',
            points: 'EDU_X4',
            credit: [0, 10],
            skills: [{ any: 7 }],
          },
        ],
      }),
    ).toThrow()
  })
})
