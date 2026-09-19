import { describe, expect, it } from 'vitest'
import { occupationCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/catalog'
import { skillCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/skill-catalog'
import { validateOccupationCatalogReferences } from '@/modules/investigators/domain/occupations'

describe('Investigator Handbook occupation catalog', () => {
  it('contains every occupation variant from the source chapter exactly once', () => {
    expect(occupationCatalog.occupations).toHaveLength(114)
    expect(new Set(occupationCatalog.occupations.map(({ id }) => id)).size).toBe(114)
  })

  it('keeps era restrictions and Lovecraftian tags as structured data', () => {
    expect(
      occupationCatalog.occupations.filter(
        ({ availability }) => availability.length === 1 && availability[0] === 'CLASSIC_1920S',
      ),
    ).toHaveLength(4)
    expect(
      occupationCatalog.occupations.filter(
        ({ availability }) => availability.length === 1 && availability[0] === 'MODERN',
      ),
    ).toHaveLength(3)
    expect(
      occupationCatalog.occupations.filter(({ tags }) => tags.includes('LOVECRAFTIAN')),
    ).toHaveLength(12)
  })

  it('uses only skills and specialization families from the ruleset catalog', () => {
    expect(validateOccupationCatalogReferences(occupationCatalog, skillCatalog)).toEqual({
      ok: true,
      value: undefined,
    })
  })

  it('preserves representative source mechanics', () => {
    expect(occupationCatalog.occupations.find(({ id }) => id === 'tribe-member')).toMatchObject({
      pointFormula: { id: 'EDU_X2_PLUS_DEX_X2_PLUS_STR_X2' },
      creditRating: { minimum: 0, maximum: 15 },
    })
    expect(occupationCatalog.occupations.find(({ id }) => id === 'alienist')).toMatchObject({
      availability: ['CLASSIC_1920S'],
      pointFormula: { id: 'EDU_X4' },
      creditRating: { minimum: 10, maximum: 60 },
    })
  })
})
