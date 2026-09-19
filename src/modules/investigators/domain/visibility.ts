import { BACKSTORY_CATEGORIES } from './constants'
import type { InvestigatorRole } from './access'

/**
 * Per-field privacy on an Investigator sheet.
 *
 * Three rules, and the third is the one that is easy to get wrong:
 *
 *   1. Everything is public to the rest of the party unless the owner says
 *      otherwise. A sheet nobody can read is not a character other players get
 *      to meet.
 *   2. Keys come from a fixed registry. An arbitrary key would let a stored
 *      string decide what gets hidden, which is a decision the code should own.
 *   3. A derived value inherits the privacy of what it is derived from. Hiding
 *      SIZ while showing Build discloses SIZ to anybody with the table, so the
 *      cascade hides Build too - until the owner discloses it deliberately,
 *      which stays their decision to make.
 *
 * Skills are one block rather than one key each. Per-skill privacy is additive
 * later; starting there would put four dozen switches in front of somebody whose
 * actual question is whether the party can see their sheet.
 */
export type FieldVisibility = 'PUBLIC' | 'HIDDEN'

const IDENTITY_KEYS = [
  'identity.name',
  'identity.age',
  'identity.sex',
  'identity.residence',
  'identity.birthplace',
  'identity.species',
  'identity.occupation',
] as const

const CHARACTERISTIC_KEYS = [
  'characteristics.STR',
  'characteristics.CON',
  'characteristics.SIZ',
  'characteristics.DEX',
  'characteristics.APP',
  'characteristics.INT',
  'characteristics.POW',
  'characteristics.EDU',
  'characteristics.luck',
] as const

const DERIVED_KEYS = [
  'derived.hitPoints',
  'derived.sanity',
  'derived.magicPoints',
  'derived.movementRate',
  'derived.damageBonus',
  'derived.build',
] as const

const SHEET_KEYS = [
  'state.conditions',
  'skills',
  'finances.creditRating',
  'finances.cash',
  'finances.assets',
  'finances.spendingLevel',
  'possessions',
  'weapons',
] as const

const BACKSTORY_KEYS = BACKSTORY_CATEGORIES.map((category) => `backstory.${category}` as const)

export const INVESTIGATOR_FIELD_KEYS = [
  ...IDENTITY_KEYS,
  ...CHARACTERISTIC_KEYS,
  ...DERIVED_KEYS,
  ...SHEET_KEYS,
  ...BACKSTORY_KEYS,
] as const

export type InvestigatorFieldKey = (typeof INVESTIGATOR_FIELD_KEYS)[number]

const FIELD_KEY_SET: ReadonlySet<string> = new Set(INVESTIGATOR_FIELD_KEYS)

export function isInvestigatorFieldKey(key: string): key is InvestigatorFieldKey {
  return FIELD_KEY_SET.has(key)
}

/**
 * What each calculated field would disclose about the sheet it came from.
 *
 * Only the fields a reader could invert. Sanity follows POW because starting
 * Sanity is POW; Credit Rating drives the money, so hiding the rating and
 * showing the cash would give it away to anyone with the spending table.
 */
export const DERIVED_FIELD_SOURCES: Readonly<
  Partial<Record<InvestigatorFieldKey, readonly InvestigatorFieldKey[]>>
> = {
  'derived.hitPoints': ['characteristics.CON', 'characteristics.SIZ'],
  'derived.sanity': ['characteristics.POW'],
  'derived.magicPoints': ['characteristics.POW'],
  'derived.movementRate': [
    'characteristics.STR',
    'characteristics.DEX',
    'characteristics.SIZ',
    'identity.age',
  ],
  'derived.damageBonus': ['characteristics.STR', 'characteristics.SIZ'],
  'derived.build': ['characteristics.STR', 'characteristics.SIZ'],
  'finances.cash': ['finances.creditRating'],
  'finances.assets': ['finances.creditRating'],
  'finances.spendingLevel': ['finances.creditRating'],
}

/**
 * Values a hidden field shows instead of nothing.
 *
 * Only where the empty answer would be misread. Species defaults to Human on the
 * paper sheet, so a blank one reads as an omission rather than as a secret -
 * which is exactly the wrong signal for a character who is hiding what they are.
 */
export const HIDDEN_FIELD_DEFAULTS: Readonly<Partial<Record<InvestigatorFieldKey, string>>> = {
  'identity.species': 'Human',
}

/**
 * The effective visibility of every field.
 *
 * Stored overrides are the owner's explicit decisions; everything absent is
 * public. The cascade runs afterwards and only ever hides: a derived field the
 * owner has explicitly published stays published, because disclosing what your
 * Build is remains theirs to choose even when SIZ is private.
 */
export function resolveVisibility(
  overrides: Iterable<readonly [string, FieldVisibility]>,
): ReadonlyMap<InvestigatorFieldKey, FieldVisibility> {
  const stored = new Map<InvestigatorFieldKey, FieldVisibility>()
  for (const [key, visibility] of overrides) {
    if (isInvestigatorFieldKey(key)) stored.set(key, visibility)
  }

  const resolved = new Map<InvestigatorFieldKey, FieldVisibility>()
  for (const key of INVESTIGATOR_FIELD_KEYS) {
    resolved.set(key, stored.get(key) ?? 'PUBLIC')
  }

  for (const [derived, sources] of Object.entries(DERIVED_FIELD_SOURCES)) {
    const key = derived as InvestigatorFieldKey
    if (stored.get(key) === 'PUBLIC') continue
    const revealsHiddenSource = sources.some((source) => resolved.get(source) === 'HIDDEN')
    if (revealsHiddenSource) resolved.set(key, 'HIDDEN')
  }

  return resolved
}

/**
 * Whether one field reaches a given reader.
 *
 * A Keeper sees the campaign-context sheet in full, which is what running a game
 * requires. HISTORICAL reads nothing here on purpose: what a former viewer keeps
 * is the disclosure captured when their access ended, never the sheet as it is
 * now.
 */
export function isFieldVisible(
  role: InvestigatorRole | null,
  key: InvestigatorFieldKey,
  resolved: ReadonlyMap<InvestigatorFieldKey, FieldVisibility>,
): boolean {
  if (role === 'OWNER' || role === 'CREATOR_KEEPER' || role === 'KEEPER') return true
  if (role !== 'PLAYER') return false
  return (resolved.get(key) ?? 'PUBLIC') === 'PUBLIC'
}

/**
 * The fields a reader is told exist but may not read.
 *
 * Returned so the sheet can mark them redacted rather than render a default as
 * though it were the answer - a blank age and an age somebody chose to withhold
 * are different facts about a character.
 */
export function redactedFieldKeys(
  role: InvestigatorRole | null,
  resolved: ReadonlyMap<InvestigatorFieldKey, FieldVisibility>,
): InvestigatorFieldKey[] {
  return INVESTIGATOR_FIELD_KEYS.filter((key) => !isFieldVisible(role, key, resolved))
}
