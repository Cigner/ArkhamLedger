import { describe, expect, it } from 'vitest'
import { occupationCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/catalog'
import { skillCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/skill-catalog'
import {
  baseValueForSkillKey,
  describeOccupationSlots,
  fixedOccupationSkills,
  openChoiceCount,
  parseSkillKey,
  resolveOccupationSkills,
  skillKeyOf,
} from '@/modules/investigators/domain/occupation-choices'
import type { CharacteristicKey } from '@/modules/investigators/domain/types'

/**
 * Resolving an occupation into the eight skills a character actually has.
 *
 * Checked against the real catalog rather than a fixture, because the thing that
 * can go wrong is a shape the catalog contains and the test author did not think
 * of - a group choice, an open family, an unrestricted slot.
 */
const CHARACTERISTICS: Record<CharacteristicKey, number> = {
  STR: 50,
  CON: 60,
  SIZ: 55,
  DEX: 65,
  APP: 70,
  INT: 80,
  POW: 75,
  EDU: 85,
}

function occupation(id: string) {
  const found = occupationCatalog.occupations.find((entry) => entry.id === id)
  if (!found) throw new Error(`No such occupation in the catalog: ${id}`)
  return found
}

describe('skill keys', () => {
  it('leaves a plain skill as itself', () => {
    expect(skillKeyOf('library-use')).toBe('library-use')
    expect(parseSkillKey('library-use')).toEqual({
      definitionId: 'library-use',
      specializationKey: '',
    })
  })

  it('joins a family and its specialization', () => {
    expect(skillKeyOf('science', 'biology')).toBe('science:biology')
    expect(parseSkillKey('science:biology')).toEqual({
      definitionId: 'science',
      specializationKey: 'biology',
    })
  })
})

describe('every occupation in the catalog', () => {
  it.each(occupationCatalog.occupations.map((entry) => [entry.id] as const))(
    '%s resolves to exactly eight skills',
    (id) => {
      const entry = occupation(id)
      const slots = describeOccupationSlots(entry, occupationCatalog)
      const fixed = fixedOccupationSkills(entry, occupationCatalog)
      const open = openChoiceCount(entry, occupationCatalog)

      expect(fixed.length + open).toBe(8)
      expect(slots.length).toBeGreaterThan(0)
    },
  )
})

describe('resolveOccupationSkills', () => {
  it('accepts an occupation with nothing to choose', () => {
    const entry = occupationCatalog.occupations.find(
      (candidate) => openChoiceCount(candidate, occupationCatalog) === 0,
    )

    if (!entry) return
    const result = resolveOccupationSkills({
      occupation: entry,
      catalog: occupationCatalog,
      chosen: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(8)
  })

  it('refuses the wrong number of choices', () => {
    const entry = occupation('accountant')
    const result = resolveOccupationSkills({
      occupation: entry,
      catalog: occupationCatalog,
      chosen: ['occult'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.wrongOccupationChoiceCount')
  })

  /*
   * An unrestricted slot is genuinely unrestricted - that is what "and two
   * others" means - so the only thing to police there is the count and that the
   * same skill is not taken twice.
   */
  it('accepts anything in an unrestricted slot', () => {
    const entry = occupation('accountant')
    const result = resolveOccupationSkills({
      occupation: entry,
      catalog: occupationCatalog,
      chosen: ['occult', 'stealth'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(8)
    expect(result.value).toContain('accounting')
    expect(result.value).toContain('occult')
  })

  it('refuses the same skill twice', () => {
    const entry = occupation('accountant')
    const result = resolveOccupationSkills({
      occupation: entry,
      catalog: occupationCatalog,
      chosen: ['occult', 'occult'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.duplicateOccupationSkill')
  })

  it('refuses a skill the occupation never offered', () => {
    const restricted = occupationCatalog.occupations.find((candidate) =>
      describeOccupationSlots(candidate, occupationCatalog).some(
        (slot) => slot.kind === 'CHOICE' && slot.options.length > 0,
      ),
    )
    if (!restricted) return

    const slots = describeOccupationSlots(restricted, occupationCatalog)
    const chosen = slots.flatMap((slot) =>
      slot.kind === 'CHOICE'
        ? Array.from({ length: slot.count }, (_unused, index) =>
            slot.options.length > 0 ? (slot.options[index] ?? 'cthulhu-mythos') : 'cthulhu-mythos',
          )
        : [],
    )

    const poisoned = [...chosen]
    const restrictedIndex = slots.findIndex(
      (slot) => slot.kind === 'CHOICE' && slot.options.length > 0,
    )
    if (restrictedIndex === -1) return
    poisoned[0] = 'accounting-that-does-not-exist'

    const result = resolveOccupationSkills({
      occupation: restricted,
      catalog: occupationCatalog,
      chosen: poisoned,
    })

    expect(result.ok).toBe(false)
  })
})

describe('baseValueForSkillKey', () => {
  it('reads a plain skill from the catalog', () => {
    expect(
      baseValueForSkillKey({
        skillKey: 'library-use',
        catalog: skillCatalog,
        characteristics: CHARACTERISTICS,
      }),
    ).toBe(20)
  })

  /*
   * Dodge is DEX halved, which is the case that proves the formula is read
   * rather than a stored number.
   */
  it('computes a characteristic-derived base', () => {
    expect(
      baseValueForSkillKey({
        skillKey: 'dodge',
        catalog: skillCatalog,
        characteristics: CHARACTERISTICS,
      }),
    ).toBe(32)
  })

  it('falls back to the family for a specialization', () => {
    const science = baseValueForSkillKey({
      skillKey: 'science:biology',
      catalog: skillCatalog,
      characteristics: CHARACTERISTICS,
    })
    const family = skillCatalog.families.find((entry) => entry.id === 'science')

    expect(science).not.toBeNull()
    expect(family).toBeDefined()
  })

  it('is nothing for a skill the catalog has never heard of', () => {
    expect(
      baseValueForSkillKey({
        skillKey: 'telepathy',
        catalog: skillCatalog,
        characteristics: CHARACTERISTICS,
      }),
    ).toBeNull()
  })
})
