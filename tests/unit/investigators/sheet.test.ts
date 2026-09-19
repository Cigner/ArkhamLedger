import { describe, expect, it } from 'vitest'
import type { InvestigatorSheet } from '@/modules/investigators/domain/sheet'
import { projectSheet } from '@/modules/investigators/domain/sheet'
import { resolveVisibility } from '@/modules/investigators/domain/visibility'

/**
 * Sheet projection.
 *
 * Every assertion here is about what does not come back. A projection that
 * returns too much is not a rendering problem: the value has already left the
 * server by the time anything decides not to draw it.
 */
const SHEET: InvestigatorSheet = {
  id: 'inv-1',
  lineageId: 'lin-1',
  ownerId: 'owner',
  status: 'ACTIVE',
  creationMethod: 'STANDARD_ROLLS',
  rulesetId: 'coc7-classic-1920s',
  rulesetVersion: '1.0.0',
  era: 'CLASSIC_1920S',
  firstUsedAt: null,
  lockVersion: 3,
  identity: {
    name: 'Harriet Vane',
    age: 34,
    sex: 'Female',
    residence: 'Oxford',
    birthplace: 'Yorkshire',
    species: 'Deep One hybrid',
    occupationId: 'author',
    occupationCharacteristic: null,
    occupationContact: null,
  },
  characteristics: { STR: 50, CON: 60, SIZ: 55, DEX: 65, APP: 70, INT: 80, POW: 75, EDU: 85 },
  luck: { current: 55, maximum: 99 },
  hitPoints: { current: 8, maximum: 11 },
  sanity: { current: 62, maximum: 99 },
  magicPoints: { current: 15, maximum: 15 },
  movementRate: 8,
  damageBonus: { kind: 'FIXED', value: 0 },
  build: 0,
  conditions: {
    majorWound: true,
    temporaryInsanity: false,
    indefiniteInsanity: false,
    unconscious: false,
    dying: false,
  },
  finances: { creditRating: 55, cash: 275, assets: 5500, spendingLevel: 50 },
  skills: [
    {
      definitionId: 'library-use',
      specializationKey: '',
      specializationLabel: null,
      baseValue: 20,
      occupationPoints: 40,
      personalInterestPoints: 0,
      playImprovement: 0,
      otherAdjustment: 0,
      currentValue: 60,
      isOccupationSkill: true,
      thresholds: { regular: 60, hard: 30, extreme: 12 },
      hasDevelopmentMark: true,
    },
  ],
  backstory: [
    { category: 'TRAITS', content: 'Never refuses a puzzle.', position: 0, isKeyConnection: false },
    {
      category: 'PHOBIAS_AND_MANIAS',
      content: 'Terrified of deep water.',
      position: 0,
      isKeyConnection: false,
    },
  ],
  weapons: [
    {
      name: 'Walking stick',
      skillKey: 'fighting-brawl',
      damage: '1D6',
      range: null,
      attacks: '1',
      ammunition: null,
      malfunction: null,
      notes: null,
    },
  ],
  possessions: [
    {
      name: 'Notebook',
      description: null,
      quantity: 1,
      value: null,
      isTreasured: true,
    },
  ],
  overrides: [{ fieldKey: 'derived.build', value: 1, reason: 'Keeper ruling after the fall' }],
}

describe('projectSheet', () => {
  it('gives the owner the sheet unchanged', () => {
    const projected = projectSheet(SHEET, resolveVisibility([]), 'OWNER')

    expect(projected.redacted).toEqual([])
    expect(projected.identity.name).toBe('Harriet Vane')
    expect(projected.skills).toHaveLength(1)
  })

  it('gives another player everything that is public', () => {
    const projected = projectSheet(SHEET, resolveVisibility([]), 'PLAYER')

    expect(projected.redacted).toEqual([])
    expect(projected.finances.cash).toBe(275)
  })

  it('returns nothing at all to somebody with no role', () => {
    const projected = projectSheet(SHEET, resolveVisibility([]), null)

    expect(projected.identity.name).toBeNull()
    expect(projected.characteristics.POW).toBeNull()
    expect(projected.skills).toEqual([])
    expect(projected.backstory).toEqual([])
  })

  /*
   * The defined default. A blank species reads as an unfinished sheet; "Human"
   * reads as an answer, which is the point for a character who is not one.
   */
  it('substitutes the sheet default for a hidden species', () => {
    const resolved = resolveVisibility([['identity.species', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.identity.species).toBe('Human')
    expect(projected.redacted).toContain('identity.species')
  })

  it('hides a calculated value along with the characteristic behind it', () => {
    const resolved = resolveVisibility([['characteristics.POW', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.characteristics.POW).toBeNull()
    expect(projected.sanity).toEqual({ current: null, maximum: null })
    expect(projected.magicPoints).toEqual({ current: null, maximum: null })
    expect(projected.characteristics.INT).toBe(80)
  })

  it('withholds a resource completely rather than only its current value', () => {
    const resolved = resolveVisibility([['derived.hitPoints', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.hitPoints).toEqual({ current: null, maximum: null })
  })

  it('filters backstory section by section', () => {
    const resolved = resolveVisibility([['backstory.PHOBIAS_AND_MANIAS', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.backstory.map((entry) => entry.category)).toEqual(['TRAITS'])
    expect(projected.redacted).toContain('backstory.PHOBIAS_AND_MANIAS')
  })

  it('shows the Keeper of the campaign what the party cannot see', () => {
    const resolved = resolveVisibility([
      ['characteristics.POW', 'HIDDEN'],
      ['backstory.PHOBIAS_AND_MANIAS', 'HIDDEN'],
    ])
    const projected = projectSheet(SHEET, resolved, 'KEEPER')

    expect(projected.characteristics.POW).toBe(75)
    expect(projected.backstory).toHaveLength(2)
    expect(projected.redacted).toEqual([])
  })

  /*
   * Conditions go to their resting state rather than to null, because the sheet
   * renders them as flags: a null wound would have to be drawn as either hurt or
   * unhurt, and one of those is a lie.
   */
  it('reports no conditions when they are hidden', () => {
    const resolved = resolveVisibility([['state.conditions', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.conditions.majorWound).toBe(false)
    expect(projected.redacted).toContain('state.conditions')
  })

  it('never lists the same withheld field twice', () => {
    const projected = projectSheet(SHEET, resolveVisibility([]), null)

    expect(new Set(projected.redacted).size).toBe(projected.redacted.length)
  })
})

describe('overrides', () => {
  /*
   * An override is a claim about the sheet, and it travels with the field it
   * replaced. A player who may not see Build must not be told that somebody
   * overrode it, or the reason would disclose the value by describing it.
   */
  it('reaches a reader who may see the field it replaced', () => {
    const projected = projectSheet(SHEET, resolveVisibility([]), 'PLAYER')

    expect(projected.overrides).toHaveLength(1)
  })

  it('is withheld along with the field it replaced', () => {
    const resolved = resolveVisibility([['derived.build', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.build).toBeNull()
    expect(projected.overrides).toEqual([])
  })

  it('is withheld when the characteristic behind the field is hidden', () => {
    const resolved = resolveVisibility([['characteristics.SIZ', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'PLAYER')

    expect(projected.overrides).toEqual([])
  })

  it('still reaches the Keeper', () => {
    const resolved = resolveVisibility([['derived.build', 'HIDDEN']])
    const projected = projectSheet(SHEET, resolved, 'KEEPER')

    expect(projected.overrides).toHaveLength(1)
  })

  it('drops an override naming a field the registry does not know', () => {
    const projected = projectSheet(
      { ...SHEET, overrides: [{ fieldKey: 'derived.invented', value: 9, reason: 'because' }] },
      resolveVisibility([]),
      'OWNER',
    )

    expect(projected.overrides).toEqual([])
  })
})

describe('the occupation choice', () => {
  /*
   * The chosen characteristic is part of the occupation, so it is withheld with
   * it. Leaking it would tell a reader which of EDU, DEX or STR the character
   * leaned on, which is most of what the occupation says about them.
   */
  it('is withheld along with the occupation', () => {
    const withChoice = {
      ...SHEET,
      identity: {
        ...SHEET.identity,
        occupationCharacteristic: 'DEX' as const,
        occupationContact: 'Chief of police, Arkham',
      },
    }
    const resolved = resolveVisibility([['identity.occupation', 'HIDDEN']])

    const forPlayer = projectSheet(withChoice, resolved, 'PLAYER')
    expect(forPlayer.identity.occupationId).toBeNull()
    expect(forPlayer.identity.occupationCharacteristic).toBeNull()

    const forKeeper = projectSheet(withChoice, resolved, 'KEEPER')
    expect(forKeeper.identity.occupationCharacteristic).toBe('DEX')
    expect(forPlayer.identity.occupationContact).toBeNull()
    expect(forKeeper.identity.occupationContact).toBe('Chief of police, Arkham')
  })
})
