import 'server-only'
import type { OccupationSlot } from '../domain/occupation-choices'
import {
  baseValueForSkillKey,
  describeOccupationSlots,
  skillKeyOf,
} from '../domain/occupation-choices'
import {
  calculateOccupationSkillPoints,
  calculatePersonalInterestPoints,
} from '../domain/occupations'
import { requireRuleset } from '../domain/rulesets'
import type { CharacteristicKey } from '../domain/types'

/**
 * What the sheet needs to offer choices.
 *
 * Assembled on the server from the ruleset the character is pinned to, so a
 * component never imports a catalog and a character created against an older
 * package is offered the occupations that package had.
 *
 * Names are keys rather than words: the client translates them, which is what
 * keeps 114 job titles out of every page's payload as duplicated strings.
 */
export type SkillOption = {
  readonly skillKey: string
  readonly nameKey: string
  readonly familyId: string | null
  readonly baseValue: number | null
}

export type OccupationOption = {
  readonly id: string
  readonly nameKey: string
  readonly creditRating: { readonly minimum: number; readonly maximum: number }
  readonly pointFormula: string
  readonly allowedCharacteristics: readonly CharacteristicKey[]
  readonly slots: readonly OccupationSlot[]
}

export type SheetOptions = {
  readonly rulesetId: string
  readonly rulesetVersion: string
  readonly occupations: readonly OccupationOption[]
  readonly skills: readonly SkillOption[]
  readonly budgets: {
    readonly occupationPoints: number | null
    readonly personalInterestPoints: number | null
  }
}

export function buildSheetOptions(input: {
  rulesetId: string
  rulesetVersion: string
  characteristics: Partial<Record<CharacteristicKey, number | null>>
  occupationId: string | null
  occupationCharacteristic: CharacteristicKey | null
}): SheetOptions {
  const ruleset = requireRuleset(input.rulesetId, input.rulesetVersion)
  /*
   * The manifest's era is a free string so a future package can name one this
   * build has never heard of. Availability lists are typed, so it is narrowed
   * once here rather than cast at each of the three places that filter on it.
   */
  const era = ruleset.manifest.era as 'CLASSIC_1920S' | 'MODERN'

  const complete = completeCharacteristics(input.characteristics)

  const occupations = ruleset.occupations.occupations
    .filter((occupation) => occupation.availability.includes(era))
    .map((occupation): OccupationOption => ({
      id: occupation.id,
      nameKey: occupation.nameKey,
      creditRating: occupation.creditRating,
      pointFormula: occupation.pointFormula.id,
      allowedCharacteristics:
        occupation.pointFormula.id === 'EDU_X2_PLUS_SELECTED_X2'
          ? occupation.pointFormula.allowedCharacteristics
          : [],
      slots: describeOccupationSlots(occupation, ruleset.occupations),
    }))

  const skills = ruleset.skills.skills
    .filter((skill) => skill.availability.includes(era))
    .map((skill): SkillOption => ({
      skillKey: skill.id,
      nameKey: skill.nameKey,
      familyId: skill.familyId ?? null,
      baseValue: complete
        ? baseValueForSkillKey({
            skillKey: skill.id,
            catalog: ruleset.skills,
            characteristics: complete,
          })
        : null,
    }))

  const families = ruleset.skills.families
    .filter((family) => family.availability.includes(era))
    .map((family): SkillOption => ({
      skillKey: skillKeyOf(family.id, 'CHOOSE'),
      nameKey: family.nameKey,
      familyId: family.id,
      baseValue: complete
        ? baseValueForSkillKey({
            skillKey: family.id,
            catalog: ruleset.skills,
            characteristics: complete,
          })
        : null,
    }))

  const chosen = occupations.find((occupation) => occupation.id === input.occupationId)
  const definition = ruleset.occupations.occupations.find(
    (occupation) => occupation.id === input.occupationId,
  )

  const occupationPoints =
    complete && definition
      ? calculateOccupationSkillPoints(
          definition.pointFormula,
          complete,
          input.occupationCharacteristic ?? undefined,
        )
      : null

  return {
    rulesetId: ruleset.manifest.id,
    rulesetVersion: ruleset.manifest.version,
    occupations,
    skills: [...skills, ...families],
    budgets: {
      occupationPoints: occupationPoints?.ok ? occupationPoints.value : null,
      personalInterestPoints:
        complete && chosen !== undefined ? calculatePersonalInterestPoints(complete.INT) : null,
    },
  }
}

const CHARACTERISTIC_ORDER: readonly CharacteristicKey[] = [
  'STR',
  'CON',
  'SIZ',
  'DEX',
  'APP',
  'INT',
  'POW',
  'EDU',
]

function completeCharacteristics(
  values: Partial<Record<CharacteristicKey, number | null>>,
): Record<CharacteristicKey, number> | null {
  const result: Partial<Record<CharacteristicKey, number>> = {}

  for (const key of CHARACTERISTIC_ORDER) {
    const value = values[key]
    if (value === null || value === undefined) return null
    result[key] = value
  }

  return result as Record<CharacteristicKey, number>
}
