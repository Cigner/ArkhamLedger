import { type Result, fail, ok } from '@/lib/result'
import type { OccupationCatalog, OccupationDefinition } from './occupations'
import type { SkillCatalog } from './skills'
import { calculateSkillBaseValue } from './skills'
import type { CharacteristicKey } from './types'

/**
 * Turning an occupation into eight skills.
 *
 * The catalog describes what an occupation offers, not what a particular
 * character took: half the entries end in "and two others of your choice". This
 * module is the join between the two, and it is pure so that the same resolution
 * runs while somebody is picking and again when the server saves what they
 * picked.
 *
 * A skill is identified by one string throughout. A plain skill is its own id; a
 * specialization is the family and the choice joined by a colon, because
 * "Science" is not a skill anybody has - "Science (Biology)" is.
 */
export const SKILL_KEY_SEPARATOR = ':'

export function skillKeyOf(definitionId: string, specializationKey?: string | null): string {
  return specializationKey
    ? `${definitionId}${SKILL_KEY_SEPARATOR}${specializationKey}`
    : definitionId
}

export function parseSkillKey(key: string): {
  definitionId: string
  specializationKey: string
} {
  const index = key.indexOf(SKILL_KEY_SEPARATOR)
  if (index === -1) return { definitionId: key, specializationKey: '' }
  return {
    definitionId: key.slice(0, index),
    specializationKey: key.slice(index + SKILL_KEY_SEPARATOR.length),
  }
}

/**
 * One decision the sheet has to present.
 *
 * Fixed slots carry no choice and are listed anyway, because an occupation's
 * eight skills read as a whole: showing only the two that need deciding hides
 * what the job actually is.
 */
export type OccupationSlot =
  | { readonly kind: 'FIXED'; readonly skillKey: string }
  | {
      readonly kind: 'CHOICE'
      readonly count: number
      /** Empty means any skill in the catalog. */
      readonly options: readonly string[]
      readonly label: 'ONE_OF' | 'GROUP' | 'ANY' | 'FAMILY'
      readonly familyId?: string
    }

export function describeOccupationSlots(
  occupation: OccupationDefinition,
  catalog: OccupationCatalog,
): OccupationSlot[] {
  return occupation.skillSlots.map((slot): OccupationSlot => {
    switch (slot.kind) {
      case 'SKILL':
        return { kind: 'FIXED', skillKey: slot.skillId }
      case 'FAMILY':
        return slot.specializationId
          ? { kind: 'FIXED', skillKey: skillKeyOf(slot.familyId, slot.specializationId) }
          : { kind: 'CHOICE', count: 1, options: [], label: 'FAMILY', familyId: slot.familyId }
      case 'ONE_OF':
        return {
          kind: 'CHOICE',
          count: slot.count,
          label: 'ONE_OF',
          options: slot.options.map((option) =>
            option.kind === 'SKILL'
              ? option.skillId
              : skillKeyOf(option.familyId, option.specializationId),
          ),
        }
      case 'GROUP': {
        const group = catalog.choiceGroups.find((entry) => entry.id === slot.groupId)
        return {
          kind: 'CHOICE',
          count: slot.count,
          label: 'GROUP',
          options: (group?.options ?? []).map((option) =>
            option.kind === 'SKILL'
              ? option.skillId
              : skillKeyOf(option.familyId, option.specializationId),
          ),
        }
      }
      case 'ANY':
        return { kind: 'CHOICE', count: slot.count, label: 'ANY', options: [] }
    }
  })
}

/** The skills an occupation grants outright, before anybody chooses anything. */
export function fixedOccupationSkills(
  occupation: OccupationDefinition,
  catalog: OccupationCatalog,
): string[] {
  return describeOccupationSlots(occupation, catalog).flatMap((slot) =>
    slot.kind === 'FIXED' ? [slot.skillKey] : [],
  )
}

/** How many skills the character still has to choose. */
export function openChoiceCount(
  occupation: OccupationDefinition,
  catalog: OccupationCatalog,
): number {
  return describeOccupationSlots(occupation, catalog).reduce(
    (total, slot) => total + (slot.kind === 'CHOICE' ? slot.count : 0),
    0,
  )
}

/**
 * The eight skills this character's occupation gives them.
 *
 * Refuses rather than repairs. A selection with the wrong number of choices, a
 * duplicate, or a pick that was never on offer is a sheet that would quietly get
 * more occupation skills than the rules allow, and the person who notices is the
 * one who loses an argument at the table six months later.
 */
export function resolveOccupationSkills(input: {
  readonly occupation: OccupationDefinition
  readonly catalog: OccupationCatalog
  readonly chosen: readonly string[]
}): Result<string[]> {
  const slots = describeOccupationSlots(input.occupation, input.catalog)
  const fixed = slots.flatMap((slot) => (slot.kind === 'FIXED' ? [slot.skillKey] : []))
  const required = slots.reduce(
    (total, slot) => total + (slot.kind === 'CHOICE' ? slot.count : 0),
    0,
  )

  if (input.chosen.length !== required) {
    return fail('investigators.errors.wrongOccupationChoiceCount', {
      expected: required,
      actual: input.chosen.length,
    })
  }

  const resolved = [...fixed]
  const remaining = [...input.chosen]

  for (const slot of slots) {
    if (slot.kind !== 'CHOICE') continue

    for (let taken = 0; taken < slot.count; taken += 1) {
      const pick = remaining.shift()
      if (pick === undefined) {
        return fail('investigators.errors.wrongOccupationChoiceCount', {
          expected: required,
          actual: input.chosen.length,
        })
      }

      if (slot.options.length > 0 && !slot.options.includes(pick)) {
        return fail('investigators.errors.skillNotOnOffer', { skillKey: pick })
      }

      if (slot.label === 'FAMILY' && slot.familyId !== undefined) {
        const { definitionId } = parseSkillKey(pick)
        if (definitionId !== slot.familyId) {
          return fail('investigators.errors.skillNotOnOffer', { skillKey: pick })
        }
      }

      if (resolved.includes(pick)) {
        return fail('investigators.errors.duplicateOccupationSkill', { skillKey: pick })
      }

      resolved.push(pick)
    }
  }

  return ok(resolved)
}

/**
 * What a skill starts at for this character.
 *
 * Reads the family's formula when the skill is a specialization, because
 * "Science (Biology)" has no entry of its own - every science starts at the same
 * place and diverges from there.
 */
export function baseValueForSkillKey(input: {
  readonly skillKey: string
  readonly catalog: SkillCatalog
  readonly characteristics: Readonly<Record<CharacteristicKey, number>>
}): number | null {
  const { definitionId } = parseSkillKey(input.skillKey)

  const skill = input.catalog.skills.find((entry) => entry.id === definitionId)
  if (skill) return calculateSkillBaseValue(skill.baseValue, input.characteristics)

  const family = input.catalog.families.find((entry) => entry.id === definitionId)
  if (family) return calculateSkillBaseValue(family.baseValue, input.characteristics)

  return null
}
