import { describe, expect, it } from 'vitest'
import { BACKSTORY_CATEGORIES } from '@/modules/investigators/domain/constants'
import {
  DERIVED_FIELD_SOURCES,
  HIDDEN_FIELD_DEFAULTS,
  INVESTIGATOR_FIELD_KEYS,
  type FieldVisibility,
  type InvestigatorFieldKey,
  isFieldVisible,
  isInvestigatorFieldKey,
  redactedFieldKeys,
  resolveVisibility,
} from '@/modules/investigators/domain/visibility'

/**
 * Per-field privacy.
 *
 * The interesting cases are all about leakage: a value that is hidden while
 * something calculated from it stays visible is not hidden at all, and a key the
 * registry does not know must not be able to hide anything.
 */
function hide(...keys: string[]): Iterable<readonly [string, FieldVisibility]> {
  return keys.map((key) => [key, 'HIDDEN'] as const)
}

describe('field registry', () => {
  it('has a key for every backstory section of the sheet', () => {
    for (const category of BACKSTORY_CATEGORIES) {
      expect(INVESTIGATOR_FIELD_KEYS).toContain(`backstory.${category}`)
    }
  })

  it('contains no duplicates', () => {
    expect(new Set(INVESTIGATOR_FIELD_KEYS).size).toBe(INVESTIGATOR_FIELD_KEYS.length)
  })

  it('only names fields that exist', () => {
    for (const [derived, sources] of Object.entries(DERIVED_FIELD_SOURCES)) {
      expect(isInvestigatorFieldKey(derived)).toBe(true)
      for (const source of sources) expect(isInvestigatorFieldKey(source)).toBe(true)
    }
    for (const key of Object.keys(HIDDEN_FIELD_DEFAULTS)) {
      expect(isInvestigatorFieldKey(key)).toBe(true)
    }
  })

  it('fits the column the visibility table stores it in', () => {
    for (const key of INVESTIGATOR_FIELD_KEYS) expect(key.length).toBeLessThanOrEqual(120)
  })

  it('rejects a key nobody defined', () => {
    expect(isInvestigatorFieldKey('identity.secret')).toBe(false)
    expect(isInvestigatorFieldKey('')).toBe(false)
  })
})

describe('resolveVisibility', () => {
  it('is public where the owner has said nothing', () => {
    const resolved = resolveVisibility([])
    for (const key of INVESTIGATOR_FIELD_KEYS) expect(resolved.get(key)).toBe('PUBLIC')
  })

  it('ignores stored keys the registry does not know', () => {
    const resolved = resolveVisibility(hide('identity.secret'))
    expect(resolved.has('identity.secret' as InvestigatorFieldKey)).toBe(false)
  })

  /*
   * The whole point of the cascade. Build is a published table lookup on STR and
   * SIZ, so a visible Build with a hidden SIZ discloses SIZ to anybody who owns
   * the rulebook - which is everybody at the table.
   */
  it('hides a calculated value whose source is hidden', () => {
    const resolved = resolveVisibility(hide('characteristics.SIZ'))

    expect(resolved.get('derived.build')).toBe('HIDDEN')
    expect(resolved.get('derived.damageBonus')).toBe('HIDDEN')
    expect(resolved.get('derived.hitPoints')).toBe('HIDDEN')
    expect(resolved.get('derived.movementRate')).toBe('HIDDEN')
    expect(resolved.get('derived.sanity')).toBe('PUBLIC')
  })

  it('lets the owner disclose a calculated value anyway', () => {
    const resolved = resolveVisibility([
      ['characteristics.SIZ', 'HIDDEN'],
      ['derived.build', 'PUBLIC'],
    ])

    expect(resolved.get('characteristics.SIZ')).toBe('HIDDEN')
    expect(resolved.get('derived.build')).toBe('PUBLIC')
    expect(resolved.get('derived.damageBonus')).toBe('HIDDEN')
  })

  it('carries Credit Rating through to the money it decides', () => {
    const resolved = resolveVisibility(hide('finances.creditRating'))

    expect(resolved.get('finances.cash')).toBe('HIDDEN')
    expect(resolved.get('finances.assets')).toBe('HIDDEN')
    expect(resolved.get('finances.spendingLevel')).toBe('HIDDEN')
  })
})

describe('isFieldVisible', () => {
  const resolved = resolveVisibility(hide('identity.age'))

  it('shows everything to the owner and to the Keepers of the campaign', () => {
    for (const role of ['OWNER', 'CREATOR_KEEPER', 'KEEPER'] as const) {
      expect(isFieldVisible(role, 'identity.age', resolved)).toBe(true)
    }
  })

  it('applies the owner’s choices to the other players', () => {
    expect(isFieldVisible('PLAYER', 'identity.age', resolved)).toBe(false)
    expect(isFieldVisible('PLAYER', 'identity.name', resolved)).toBe(true)
  })

  /*
   * Permanent access is served from the disclosure captured when access ended.
   * Reading the live sheet through a historical role would quietly turn "what
   * you were shown" into "what is true now".
   */
  it('shows a historical viewer nothing of the current sheet', () => {
    expect(isFieldVisible('HISTORICAL', 'identity.name', resolved)).toBe(false)
    expect(isFieldVisible(null, 'identity.name', resolved)).toBe(false)
  })
})

describe('redactedFieldKeys', () => {
  it('is empty for a reader who sees the whole sheet', () => {
    expect(redactedFieldKeys('OWNER', resolveVisibility(hide('identity.age')))).toEqual([])
  })

  it('names what a player is told exists but may not read', () => {
    const redacted = redactedFieldKeys('PLAYER', resolveVisibility(hide('characteristics.POW')))

    expect(redacted).toContain('characteristics.POW')
    expect(redacted).toContain('derived.sanity')
    expect(redacted).toContain('derived.magicPoints')
    expect(redacted).not.toContain('identity.name')
  })
})
