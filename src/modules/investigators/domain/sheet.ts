import type { InvestigatorStatus } from './lifecycle'
import type { CreationMethod } from './ruleset'
import type { BackstoryCategory } from './constants'
import type { CharacteristicKey, DamageBonus, SuccessThresholds } from './types'
import type { InvestigatorRole } from './access'
import {
  type FieldVisibility,
  type InvestigatorFieldKey,
  HIDDEN_FIELD_DEFAULTS,
  isFieldVisible,
  isInvestigatorFieldKey,
} from './visibility'

/**
 * The Investigator sheet as one value.
 *
 * Assembled once and then projected per reader, which is what makes the privacy
 * rules enforceable: there is a single place where a field either survives into
 * the result or does not, rather than a decision repeated in every query and
 * every component.
 *
 * Resources are blocks rather than loose numbers because privacy follows the
 * concept, not the column - somebody who hides their Sanity means all of it, and
 * publishing the maximum while hiding the current value discloses how badly the
 * night went.
 */
export const SHEET_SCHEMA_VERSION = 1

/**
 * A calculated value somebody replaced by hand.
 *
 * Kept beside the value rather than folded into it, because a number the rules
 * produced and a number a person insisted on are different claims. The reason is
 * required at the point of setting it: an unexplained override is indisputable
 * six months later, which is the opposite of what it is for.
 */
export type SheetOverride = {
  readonly fieldKey: string
  readonly value: number
  readonly reason: string
}

export type SheetResource = {
  readonly current: number | null
  readonly maximum: number | null
}

export type SheetSkill = {
  readonly definitionId: string
  readonly specializationKey: string
  readonly specializationLabel: string | null
  readonly baseValue: number
  readonly occupationPoints: number
  readonly personalInterestPoints: number
  readonly playImprovement: number
  readonly otherAdjustment: number
  readonly currentValue: number
  readonly isOccupationSkill: boolean
  readonly thresholds: SuccessThresholds
  readonly hasDevelopmentMark: boolean
}

export type SheetBackstoryEntry = {
  readonly category: BackstoryCategory
  readonly content: string
  readonly position: number
  readonly isKeyConnection: boolean
}

export type SheetWeapon = {
  readonly name: string
  readonly skillKey: string
  readonly damage: string
  readonly range: string | null
  readonly attacks: string | null
  readonly ammunition: number | null
  readonly malfunction: number | null
  readonly notes: string | null
}

export type SheetPossession = {
  readonly name: string
  readonly description: string | null
  readonly quantity: number
  readonly value: number | null
  readonly isTreasured: boolean
}

export type InvestigatorSheet = {
  readonly id: string
  readonly lineageId: string
  readonly ownerId: string
  readonly status: InvestigatorStatus
  readonly creationMethod: CreationMethod
  readonly rulesetId: string
  readonly rulesetVersion: string
  readonly era: string
  readonly firstUsedAt: Date | null
  readonly lockVersion: number

  readonly identity: {
    readonly name: string | null
    readonly age: number | null
    readonly sex: string | null
    readonly residence: string | null
    readonly birthplace: string | null
    readonly species: string
    readonly occupationId: string | null
    /** Only set for the occupations whose point formula offers a choice. */
    readonly occupationCharacteristic: CharacteristicKey | null
    /** Free text: who the job knows. Part of the occupation, hidden with it. */
    readonly occupationContact: string | null
  }

  readonly characteristics: {
    readonly STR: number | null
    readonly CON: number | null
    readonly SIZ: number | null
    readonly DEX: number | null
    readonly APP: number | null
    readonly INT: number | null
    readonly POW: number | null
    readonly EDU: number | null
  }

  readonly luck: SheetResource
  readonly hitPoints: SheetResource
  readonly sanity: SheetResource
  readonly magicPoints: SheetResource

  readonly movementRate: number | null
  readonly damageBonus: DamageBonus | null
  readonly build: number | null

  readonly conditions: {
    readonly majorWound: boolean
    readonly temporaryInsanity: boolean
    readonly indefiniteInsanity: boolean
    readonly unconscious: boolean
    readonly dying: boolean
  }

  readonly finances: {
    readonly creditRating: number | null
    readonly cash: number | null
    readonly assets: number | null
    readonly spendingLevel: number | null
  }

  readonly skills: readonly SheetSkill[]
  readonly backstory: readonly SheetBackstoryEntry[]
  readonly weapons: readonly SheetWeapon[]
  readonly possessions: readonly SheetPossession[]

  /** Calculated values a person replaced by hand, with the reason they gave. */
  readonly overrides: readonly SheetOverride[]
}

/**
 * What one reader is allowed to see, and what they are told is withheld.
 *
 * The redacted list is part of the answer rather than an afterthought: a blank
 * age and an age somebody chose not to share are different facts, and a sheet
 * that presented them identically would quietly turn privacy into absence.
 */
export type ProjectedSheet = InvestigatorSheet & {
  readonly redacted: readonly InvestigatorFieldKey[]
}

/**
 * What an archived snapshot holds.
 *
 * The sheet and the privacy settings that were in force over it, rather than one
 * stored copy per person who could see it. Any viewer's historical projection is
 * then a calculation over these two, which keeps the archive a record of what
 * was true instead of a pile of derived views that can disagree with each other.
 *
 * Disclosure snapshots remain separate and are still stored per person, because
 * they answer a different question: not "what was the character" but "what had
 * this person been shown before their access ended".
 */
export type SheetSnapshotPayload = {
  readonly schemaVersion: number
  readonly sheet: InvestigatorSheet
  readonly visibility: readonly (readonly [string, FieldVisibility])[]
}

const EMPTY_RESOURCE: SheetResource = { current: null, maximum: null }

/**
 * Removes from a sheet everything this reader may not see.
 *
 * Runs in the data layer, before the value reaches a component. Hiding fields in
 * the browser would ship the secret to the person it is being kept from, and no
 * amount of careful rendering makes that not true.
 *
 * Whole collections - skills, possessions, weapons - go empty rather than
 * partial. Half a skill list is a worse answer than none: it looks complete, and
 * a reader cannot tell which half they are missing.
 */
export function projectSheet(
  sheet: InvestigatorSheet,
  resolved: ReadonlyMap<InvestigatorFieldKey, FieldVisibility>,
  role: InvestigatorRole | null,
): ProjectedSheet {
  const redacted: InvestigatorFieldKey[] = []

  const visible = (key: InvestigatorFieldKey): boolean => {
    if (isFieldVisible(role, key, resolved)) return true
    redacted.push(key)
    return false
  }

  const keep = <T>(key: InvestigatorFieldKey, value: T, hidden: T): T =>
    visible(key) ? value : hidden

  const occupationVisible = isFieldVisible(role, 'identity.occupation', resolved)

  const identity = {
    name: keep('identity.name', sheet.identity.name, null),
    age: keep('identity.age', sheet.identity.age, null),
    sex: keep('identity.sex', sheet.identity.sex, null),
    residence: keep('identity.residence', sheet.identity.residence, null),
    birthplace: keep('identity.birthplace', sheet.identity.birthplace, null),
    species: keep(
      'identity.species',
      sheet.identity.species,
      HIDDEN_FIELD_DEFAULTS['identity.species'] ?? '',
    ),
    occupationId: keep('identity.occupation', sheet.identity.occupationId, null),
    /*
     * Asked once. The characteristic an occupation leans on is part of the
     * occupation, so it follows the same key - and a second call would record
     * the field as withheld twice.
     */
    occupationCharacteristic: occupationVisible ? sheet.identity.occupationCharacteristic : null,
    occupationContact: occupationVisible ? sheet.identity.occupationContact : null,
  }

  const characteristics = {
    STR: keep('characteristics.STR', sheet.characteristics.STR, null),
    CON: keep('characteristics.CON', sheet.characteristics.CON, null),
    SIZ: keep('characteristics.SIZ', sheet.characteristics.SIZ, null),
    DEX: keep('characteristics.DEX', sheet.characteristics.DEX, null),
    APP: keep('characteristics.APP', sheet.characteristics.APP, null),
    INT: keep('characteristics.INT', sheet.characteristics.INT, null),
    POW: keep('characteristics.POW', sheet.characteristics.POW, null),
    EDU: keep('characteristics.EDU', sheet.characteristics.EDU, null),
  }

  const conditionsVisible = visible('state.conditions')

  return {
    ...sheet,
    identity,
    characteristics,
    luck: keep('characteristics.luck', sheet.luck, EMPTY_RESOURCE),
    hitPoints: keep('derived.hitPoints', sheet.hitPoints, EMPTY_RESOURCE),
    sanity: keep('derived.sanity', sheet.sanity, EMPTY_RESOURCE),
    magicPoints: keep('derived.magicPoints', sheet.magicPoints, EMPTY_RESOURCE),
    movementRate: keep('derived.movementRate', sheet.movementRate, null),
    damageBonus: keep('derived.damageBonus', sheet.damageBonus, null),
    build: keep('derived.build', sheet.build, null),
    conditions: conditionsVisible
      ? sheet.conditions
      : {
          majorWound: false,
          temporaryInsanity: false,
          indefiniteInsanity: false,
          unconscious: false,
          dying: false,
        },
    finances: {
      creditRating: keep('finances.creditRating', sheet.finances.creditRating, null),
      cash: keep('finances.cash', sheet.finances.cash, null),
      assets: keep('finances.assets', sheet.finances.assets, null),
      spendingLevel: keep('finances.spendingLevel', sheet.finances.spendingLevel, null),
    },
    /*
     * An override travels with the field it replaced. Telling a reader that
     * somebody overrode a value they may not see would disclose it by
     * describing it - the reason is written by a person, and people explain
     * themselves in numbers.
     */
    overrides: sheet.overrides.filter(
      (override) =>
        isInvestigatorFieldKey(override.fieldKey) &&
        isFieldVisible(role, override.fieldKey, resolved),
    ),
    skills: keep<readonly SheetSkill[]>('skills', sheet.skills, []),
    backstory: sheet.backstory.filter((entry) => visibleBackstory(entry, resolved, role, redacted)),
    weapons: keep<readonly SheetWeapon[]>('weapons', sheet.weapons, []),
    possessions: keep<readonly SheetPossession[]>('possessions', sheet.possessions, []),
    redacted,
  }
}

/**
 * Backstory is filtered per section rather than as a block.
 *
 * The sections are independent on the paper sheet and independent in practice: a
 * player will happily show their traits while keeping their phobias to
 * themselves, and that is the most common privacy request this feature has.
 */
function visibleBackstory(
  entry: SheetBackstoryEntry,
  resolved: ReadonlyMap<InvestigatorFieldKey, FieldVisibility>,
  role: InvestigatorRole | null,
  redacted: InvestigatorFieldKey[],
): boolean {
  const key = `backstory.${entry.category}` as InvestigatorFieldKey
  if (isFieldVisible(role, key, resolved)) return true
  if (!redacted.includes(key)) redacted.push(key)
  return false
}
