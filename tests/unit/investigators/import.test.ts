import { describe, expect, it } from 'vitest'
import { investigatorImportSchema, reviewImport } from '@/modules/investigators/domain/import'

/**
 * Reading a character out of a file.
 *
 * The tests are all about what is not trusted. A file is somebody's claim, and
 * the ways it can lie are the ways an import can be used to write a character
 * nobody rolled.
 */
const KNOWN = {
  knownSkillIds: new Set(['library-use', 'spot-hidden', 'cthulhu-mythos']),
  knownFamilyIds: new Set(['science']),
  knownOccupationIds: new Set(['author']),
  rulesetId: 'coc7-classic-1920s',
  rulesetVersion: '1.0.0',
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    format: 'arkham-ledger/investigator',
    schemaVersion: 1,
    ruleset: { id: 'coc7-classic-1920s', version: '1.0.0' },
    sheet: {
      identity: {
        name: 'Harriet Vane',
        age: 34,
        species: 'Human',
        occupationId: 'author',
        occupationContact: 'An editor at the Advertiser',
      },
      characteristics: {
        STR: 50,
        CON: 60,
        SIZ: 55,
        DEX: 65,
        APP: 70,
        INT: 80,
        POW: 75,
        EDU: 85,
      },
      luck: { current: 55 },
      skills: [{ definitionId: 'library-use', specializationKey: '', currentValue: 60 }],
      backstory: [],
      possessions: [],
      weapons: [],
    },
    ...overrides,
  }
}

describe('the shape of the file', () => {
  it('accepts an export of this application', () => {
    expect(investigatorImportSchema.safeParse(file()).success).toBe(true)
  })

  it('keeps the occupation contact, which is something somebody typed', () => {
    const parsed = investigatorImportSchema.safeParse(file())

    expect(parsed.success && parsed.data.sheet.identity.occupationContact).toBe(
      'An editor at the Advertiser',
    )
  })

  it('refuses something that is not a character', () => {
    expect(investigatorImportSchema.safeParse({ hello: 'world' }).success).toBe(false)
    expect(investigatorImportSchema.safeParse(file({ format: 'something-else' })).success).toBe(
      false,
    )
  })

  /*
   * The numbers a file asserts are still bounded by what a character can be.
   * This is the difference between importing a sheet and importing a wish.
   */
  it('refuses a characteristic outside the scale', () => {
    const impossible = file()
    ;(impossible.sheet.characteristics as Record<string, number>)['STR'] = 200

    expect(investigatorImportSchema.safeParse(impossible).success).toBe(false)
  })

  it('refuses a skill above ninety-nine', () => {
    const impossible = file()
    impossible.sheet.skills = [
      { definitionId: 'library-use', specializationKey: '', currentValue: 140 },
    ]

    expect(investigatorImportSchema.safeParse(impossible).success).toBe(false)
  })

  it('refuses an age outside what the rules allow', () => {
    const child = file()
    ;(child.sheet.identity as Record<string, unknown>)['age'] = 9

    expect(investigatorImportSchema.safeParse(child).success).toBe(false)
  })

  /*
   * Ownership, status and history are not in the schema at all, so a file
   * claiming them is not refused - the claims are simply never read.
   */
  it('ignores ownership and status a file tries to assert', () => {
    const forged = file()
    Object.assign(forged.sheet, {
      ownerId: 'somebody-else',
      status: 'ACTIVE',
      firstUsedAt: '2020-01-01T00:00:00.000Z',
    })

    const parsed = investigatorImportSchema.safeParse(forged)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.sheet).not.toHaveProperty('ownerId')
    expect(parsed.data.sheet).not.toHaveProperty('status')
  })

  it('ignores play improvement and development marks', () => {
    const earned = file()
    /*
     * Built as a plain object rather than through the typed fixture: the point
     * is a file carrying fields the schema does not know about, which is
     * exactly what TypeScript would refuse to let the fixture express.
     */
    const withEarnings = {
      ...earned,
      sheet: {
        ...earned.sheet,
        skills: [
          {
            definitionId: 'library-use',
            specializationKey: '',
            currentValue: 60,
            playImprovement: 40,
            hasDevelopmentMark: true,
          },
        ],
      },
    }

    const parsed = investigatorImportSchema.safeParse(withEarnings)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.sheet.skills[0]).not.toHaveProperty('playImprovement')
  })
})

describe('reviewImport', () => {
  function parse(document: unknown) {
    const parsed = investigatorImportSchema.parse(document)
    return reviewImport({ parsed, ...KNOWN })
  }

  it('accepts a file from this ruleset', () => {
    const result = parse(file())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.warnings).toEqual([])
  })

  it('refuses a file from another ruleset entirely', () => {
    const result = parse(file({ ruleset: { id: 'coc7-modern', version: '1.0.0' } }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.importWrongRuleset')
  })

  /*
   * Refusing a different version would orphan every file exported before a
   * content update, and the values are checked against this build's catalog
   * regardless.
   */
  it('warns about a different version rather than refusing', () => {
    const result = parse(file({ ruleset: { id: 'coc7-classic-1920s', version: '0.9.0' } }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.warnings.map((warning) => warning.key)).toContain(
      'investigators.import.differentVersion',
    )
  })

  it('drops a skill nobody has heard of, with a note', () => {
    const invented = file()
    invented.sheet.skills = [
      { definitionId: 'library-use', specializationKey: '', currentValue: 60 },
      { definitionId: 'telepathy', specializationKey: '', currentValue: 90 },
    ]

    const result = parse(invented)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skills).toHaveLength(1)
    expect(result.value.warnings.map((warning) => warning.detail)).toContain('telepathy')
  })

  it('keeps a specialization of a family it knows', () => {
    const specialised = file()
    specialised.sheet.skills = [
      { definitionId: 'science', specializationKey: 'biology', currentValue: 40 },
    ]

    const result = parse(specialised)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skills).toHaveLength(1)
  })

  it('refuses a file listing the same skill twice', () => {
    const doubled = file()
    doubled.sheet.skills = [
      { definitionId: 'library-use', specializationKey: '', currentValue: 60 },
      { definitionId: 'library-use', specializationKey: '', currentValue: 90 },
    ]

    const result = parse(doubled)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.importDuplicateSkills')
  })

  it('warns about an occupation this build does not have', () => {
    const result = parse(
      file({
        sheet: { ...file().sheet, identity: { ...file().sheet.identity, occupationId: 'wizard' } },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.warnings.map((warning) => warning.detail)).toContain('wizard')
  })
})
