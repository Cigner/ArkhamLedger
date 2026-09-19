import { describe, expect, it } from 'vitest'
import messages from '@/messages/en.json'
import { occupationCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/catalog'
import { skillCatalog } from '@/modules/investigators/domain/rulesets/coc7-classic-1920s/skill-catalog'
import { BACKSTORY_CATEGORIES } from '@/modules/investigators/domain/constants'
import { INVESTIGATOR_FIELD_KEYS } from '@/modules/investigators/domain/visibility'

/**
 * Every name a ruleset package refers to has to exist.
 *
 * Packages carry i18n keys rather than words, which is what lets the catalog be
 * translated and eventually edited by an administrator. The cost of that choice
 * is that a typo in a key is invisible until somebody opens the screen and reads
 * `investigators.occupations.acountant` where a job title should be. This closes
 * that gap at build time.
 */
function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in node) {
      return (node as Record<string, unknown>)[part]
    }
    return undefined
  }, messages)
}

function specializationKeysOf(slots: unknown): string[] {
  return [...JSON.stringify(slots).matchAll(/"specializationNameKey":"([^"]+)"/g)].map(
    (match) => match[1] ?? '',
  )
}

describe('skill catalog', () => {
  it.each(skillCatalog.skills.map((skill) => [skill.id, skill.nameKey]))(
    '%s has a name',
    (_id, nameKey) => {
      expect(typeof lookup(nameKey)).toBe('string')
    },
  )

  it.each(skillCatalog.families.map((family) => [family.id, family.nameKey]))(
    'the %s family has a name',
    (_id, nameKey) => {
      expect(typeof lookup(nameKey)).toBe('string')
    },
  )
})

describe('occupation catalog', () => {
  it('covers every occupation and every named specialization', () => {
    const missing = occupationCatalog.occupations.flatMap((occupation) => [
      ...(lookup(occupation.nameKey) === undefined ? [occupation.nameKey] : []),
      ...specializationKeysOf(occupation.skillSlots).filter((key) => lookup(key) === undefined),
    ])

    expect([...new Set(missing)]).toEqual([])
  })

  /*
   * A count, so that adding an occupation without its name is a failure rather
   * than a silently smaller catalog.
   */
  it('has the whole Investigator Handbook catalog', () => {
    expect(occupationCatalog.occupations).toHaveLength(114)
    expect(skillCatalog.skills).toHaveLength(44)
    expect(skillCatalog.families).toHaveLength(7)
  })
})

/**
 * The privacy screen names every field it can hide.
 *
 * Same failure as an untranslated occupation and the same fix: a field key with
 * no label renders as `identity_birthplace` next to a checkbox, and the person
 * reading it is being asked to decide something about a string.
 */
describe('field labels', () => {
  it.each(INVESTIGATOR_FIELD_KEYS.map((key) => [key] as const))('%s has a label', (key) => {
    const lookupKey = key.startsWith('backstory.')
      ? `investigators.backstoryCategories.${key.slice('backstory.'.length)}`
      : `investigators.fields.${key.replace(/\./g, '_')}`

    expect(typeof lookup(lookupKey)).toBe('string')
  })

  it.each(BACKSTORY_CATEGORIES.map((category) => [category] as const))(
    'the %s box has a name',
    (category) => {
      expect(typeof lookup(`investigators.backstoryCategories.${category}`)).toBe('string')
    },
  )
})
