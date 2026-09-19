import { describe, expect, it } from 'vitest'
import { compareSheets } from '@/modules/investigators/domain/comparison'
import type { InvestigatorSheet } from '@/modules/investigators/domain/sheet'

/**
 * Comparing a character before and after a session.
 *
 * The test that matters is the one about noise: a comparison listing everything
 * buries the two numbers somebody actually wants.
 */
function sheet(overrides: Partial<InvestigatorSheet> = {}): InvestigatorSheet {
  return {
    id: 'inv-1',
    lineageId: 'lin-1',
    ownerId: 'owner',
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    firstUsedAt: null,
    lockVersion: 0,
    identity: {
      name: 'Harriet Vane',
      age: 34,
      sex: null,
      residence: null,
      birthplace: null,
      species: 'Human',
      occupationId: 'author',
      occupationCharacteristic: null,
      occupationContact: null,
    },
    characteristics: { STR: 50, CON: 60, SIZ: 55, DEX: 65, APP: 70, INT: 80, POW: 75, EDU: 85 },
    luck: { current: 55, maximum: 99 },
    hitPoints: { current: 11, maximum: 11 },
    sanity: { current: 75, maximum: 99 },
    magicPoints: { current: 15, maximum: 15 },
    movementRate: 8,
    damageBonus: { kind: 'FIXED', value: 0 },
    build: 0,
    conditions: {
      majorWound: false,
      temporaryInsanity: false,
      indefiniteInsanity: false,
      unconscious: false,
      dying: false,
    },
    finances: { creditRating: 55, cash: 275, assets: 5500, spendingLevel: 50 },
    skills: [],
    backstory: [],
    weapons: [],
    possessions: [],
    overrides: [],
    ...overrides,
  }
}

function skill(definitionId: string, currentValue: number) {
  return {
    definitionId,
    specializationKey: '',
    specializationLabel: null,
    baseValue: 20,
    occupationPoints: 0,
    personalInterestPoints: 0,
    playImprovement: 0,
    otherAdjustment: 0,
    currentValue,
    isOccupationSkill: false,
    thresholds: { regular: currentValue, hard: 0, extreme: 0 },
    hasDevelopmentMark: false,
  }
}

describe('compareSheets', () => {
  it('says nothing happened when nothing did', () => {
    const comparison = compareSheets(sheet(), sheet())

    expect(comparison.unchanged).toBe(true)
    expect(comparison.resources).toEqual([])
  })

  it('reports what an evening cost', () => {
    const after = sheet({
      hitPoints: { current: 3, maximum: 11 },
      sanity: { current: 62, maximum: 99 },
    })

    const comparison = compareSheets(sheet(), after)

    expect(comparison.resources).toEqual([
      { resource: 'HP', before: 11, after: 3, delta: -8 },
      { resource: 'SAN', before: 75, after: 62, delta: -13 },
    ])
    expect(comparison.unchanged).toBe(false)
  })

  /*
   * Everything that did not move is left out. A summary that listed the other
   * forty skills would bury the one that improved.
   */
  it('lists only the skills that moved', () => {
    const before = sheet({ skills: [skill('library-use', 60), skill('spot-hidden', 25)] })
    const after = sheet({ skills: [skill('library-use', 67), skill('spot-hidden', 25)] })

    const comparison = compareSheets(before, after)

    expect(comparison.skills).toEqual([
      {
        definitionId: 'library-use',
        specializationKey: '',
        before: 60,
        after: 67,
        delta: 7,
        isNew: false,
      },
    ])
  })

  it('marks a skill that appeared during the session', () => {
    const before = sheet({ skills: [] })
    const after = sheet({ skills: [skill('cthulhu-mythos', 6)] })

    const comparison = compareSheets(before, after)

    expect(comparison.skills[0]?.isNew).toBe(true)
    expect(comparison.skills[0]?.delta).toBe(6)
  })

  it('reports a wound taken but not one that healed', () => {
    const wounded = sheet({
      conditions: {
        majorWound: true,
        temporaryInsanity: false,
        indefiniteInsanity: false,
        unconscious: false,
        dying: false,
      },
    })

    expect(compareSheets(sheet(), wounded).conditions).toEqual([
      { condition: 'majorWound', gained: true },
    ])
    expect(compareSheets(wounded, sheet()).conditions).toEqual([])
  })

  it('ignores a resource that was withheld from the reader', () => {
    const before = sheet({ sanity: { current: null, maximum: null } })
    const after = sheet({ sanity: { current: null, maximum: null } })

    expect(compareSheets(before, after).resources).toEqual([])
  })
})
