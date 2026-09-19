import type { InvestigatorSheet } from './sheet'

/**
 * What an evening did to a character.
 *
 * Built from the two snapshots a session takes, which is the only honest source:
 * the sheet has carried on changing since, and asking it now would describe
 * tonight rather than that night.
 *
 * Pure, and deliberately about differences rather than values. A comparison that
 * listed everything would bury the two numbers somebody actually wants, which
 * are usually how much Sanity went and which skill finally improved.
 */
export type ResourceChange = {
  readonly resource: 'HP' | 'SAN' | 'MP' | 'LUCK'
  readonly before: number | null
  readonly after: number | null
  readonly delta: number
}

export type SkillChange = {
  readonly definitionId: string
  readonly specializationKey: string
  readonly before: number
  readonly after: number
  readonly delta: number
  /** A skill that appeared during the session rather than changing. */
  readonly isNew: boolean
}

export type ConditionChange = {
  readonly condition: keyof InvestigatorSheet['conditions']
  readonly gained: boolean
}

export type SheetComparison = {
  readonly resources: readonly ResourceChange[]
  readonly skills: readonly SkillChange[]
  readonly conditions: readonly ConditionChange[]
  readonly unchanged: boolean
}

const RESOURCES = ['HP', 'SAN', 'MP', 'LUCK'] as const

function currentOf(sheet: InvestigatorSheet, resource: (typeof RESOURCES)[number]): number | null {
  switch (resource) {
    case 'HP':
      return sheet.hitPoints.current
    case 'SAN':
      return sheet.sanity.current
    case 'MP':
      return sheet.magicPoints.current
    case 'LUCK':
      return sheet.luck.current
  }
}

function keyOf(skill: { definitionId: string; specializationKey: string }): string {
  return `${skill.definitionId}:${skill.specializationKey}`
}

export function compareSheets(
  before: InvestigatorSheet,
  after: InvestigatorSheet,
): SheetComparison {
  const resources = RESOURCES.flatMap((resource): ResourceChange[] => {
    const was = currentOf(before, resource)
    const now = currentOf(after, resource)
    if (was === null || now === null || was === now) return []
    return [{ resource, before: was, after: now, delta: now - was }]
  })

  const previous = new Map(before.skills.map((skill) => [keyOf(skill), skill.currentValue]))

  const skills = after.skills.flatMap((skill): SkillChange[] => {
    const was = previous.get(keyOf(skill))

    if (was === undefined) {
      return [
        {
          definitionId: skill.definitionId,
          specializationKey: skill.specializationKey,
          before: 0,
          after: skill.currentValue,
          delta: skill.currentValue,
          isNew: true,
        },
      ]
    }

    if (was === skill.currentValue) return []

    return [
      {
        definitionId: skill.definitionId,
        specializationKey: skill.specializationKey,
        before: was,
        after: skill.currentValue,
        delta: skill.currentValue - was,
        isNew: false,
      },
    ]
  })

  /*
   * Only conditions that were gained. A wound that healed during the evening is
   * good news nobody is looking for in a session summary, and listing both
   * directions doubles the noise for the one direction that matters.
   */
  const conditionKeys = Object.keys(before.conditions) as (keyof InvestigatorSheet['conditions'])[]
  const conditions = conditionKeys.flatMap((condition): ConditionChange[] =>
    !before.conditions[condition] && after.conditions[condition]
      ? [{ condition, gained: true }]
      : [],
  )

  return {
    resources,
    skills,
    conditions,
    unchanged: resources.length === 0 && skills.length === 0 && conditions.length === 0,
  }
}
