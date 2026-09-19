import { z } from 'zod'
import type { CharacteristicKey } from './types'

/**
 * Investigator skill definitions and base-value formulas.
 *
 * Current values live on the Investigator. This catalog defines only stable
 * ruleset facts shared by every character created from the package.
 */
const characteristicKeySchema = z.enum(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'])

const eraSchema = z.enum(['CLASSIC_1920S', 'MODERN'])
const allEras = ['CLASSIC_1920S', 'MODERN'] as const

export const skillBaseValueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FIXED'),
    value: z.number().int().min(0).max(99),
  }),
  z.object({
    kind: z.literal('CHARACTERISTIC'),
    characteristic: characteristicKeySchema,
  }),
  z.object({
    kind: z.literal('CHARACTERISTIC_FRACTION'),
    characteristic: characteristicKeySchema,
    divisor: z.number().int().positive(),
  }),
])

export type SkillBaseValue = z.infer<typeof skillBaseValueSchema>

const catalogIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const availabilitySchema = z
  .array(eraSchema)
  .min(1)
  .default([...allEras])
  .refine((values) => new Set(values).size === values.length, {
    message: 'Availability values must be unique.',
  })

const skillFamilySchema = z.object({
  id: catalogIdSchema,
  nameKey: z.string().min(1),
  availability: availabilitySchema,
  baseValue: skillBaseValueSchema,
})

const skillDefinitionSchema = z.object({
  id: catalogIdSchema,
  nameKey: z.string().min(1),
  familyId: catalogIdSchema.optional(),
  availability: availabilitySchema,
  baseValue: skillBaseValueSchema,
  creationRule: z.enum(['STANDARD', 'KEEPER_OVERRIDE']).default('STANDARD'),
  developmentRule: z.enum(['STANDARD', 'MYTHOS_ONLY']).default('STANDARD'),
})

export const skillCatalogSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    families: z.array(skillFamilySchema),
    skills: z.array(skillDefinitionSchema),
  })
  .superRefine((catalog, context) => {
    const familyIds = new Set<string>()
    for (const [index, family] of catalog.families.entries()) {
      if (familyIds.has(family.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Skill family ids must be unique.',
          path: ['families', index, 'id'],
        })
      }
      familyIds.add(family.id)
    }

    const skillIds = new Set<string>()
    for (const [index, skill] of catalog.skills.entries()) {
      if (skillIds.has(skill.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Skill ids must be unique.',
          path: ['skills', index, 'id'],
        })
      }
      skillIds.add(skill.id)

      if (skill.familyId && !familyIds.has(skill.familyId)) {
        context.addIssue({
          code: 'custom',
          message: 'A skill may reference only a family from the same catalog.',
          path: ['skills', index, 'familyId'],
        })
      }
    }
  })

export type SkillCatalog = z.infer<typeof skillCatalogSchema>

export function calculateSkillBaseValue(
  formula: SkillBaseValue,
  characteristics: Readonly<Record<CharacteristicKey, number>>,
): number {
  switch (formula.kind) {
    case 'FIXED':
      return formula.value
    case 'CHARACTERISTIC':
      return characteristics[formula.characteristic]
    case 'CHARACTERISTIC_FRACTION':
      return Math.floor(characteristics[formula.characteristic] / formula.divisor)
  }
}
