import { z } from 'zod'
import { type Result, fail, ok } from '@/lib/result'
import type { SkillCatalog } from './skills'
import type { CharacteristicKey } from './types'

const characteristicKeySchema = z.enum(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'])

const eraSchema = z.enum(['CLASSIC_1920S', 'MODERN'])
const catalogIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const occupationPointFormulaSchema = z.discriminatedUnion('id', [
  z.object({ id: z.literal('EDU_X4') }),
  z.object({
    id: z.literal('EDU_X2_PLUS_SELECTED_X2'),
    allowedCharacteristics: z
      .array(characteristicKeySchema)
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Allowed characteristics must be unique.',
      }),
  }),
  z.object({ id: z.literal('EDU_X2_PLUS_DEX_X2_PLUS_STR_X2') }),
])

export type OccupationPointFormula = z.infer<typeof occupationPointFormulaSchema>

const skillReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SKILL'), skillId: catalogIdSchema }),
  z.object({
    kind: z.literal('FAMILY'),
    familyId: catalogIdSchema,
    specializationId: catalogIdSchema.optional(),
    specializationNameKey: z.string().min(1).optional(),
  }),
])

type SkillReference = z.infer<typeof skillReferenceSchema>

const skillSlotSchema = z.discriminatedUnion('kind', [
  ...skillReferenceSchema.options,
  z.object({
    kind: z.literal('ONE_OF'),
    count: z.number().int().positive(),
    options: z.array(skillReferenceSchema).min(2),
  }),
  z.object({
    kind: z.literal('GROUP'),
    groupId: catalogIdSchema,
    count: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('ANY'), count: z.number().int().positive() }),
])

function resolvedSlotCount(slot: z.infer<typeof skillSlotSchema>): number {
  return slot.kind === 'SKILL' || slot.kind === 'FAMILY' ? 1 : slot.count
}

export const occupationDefinitionSchema = z
  .object({
    id: catalogIdSchema,
    nameKey: z.string().min(1),
    availability: z.array(eraSchema).min(1),
    tags: z.array(z.enum(['LOVECRAFTIAN'])),
    pointFormula: occupationPointFormulaSchema,
    creditRating: z.object({
      minimum: z.number().int().min(0).max(99),
      maximum: z.number().int().min(0).max(99),
    }),
    skillSlots: z.array(skillSlotSchema).min(1),
  })
  .superRefine((occupation, context) => {
    if (new Set(occupation.availability).size !== occupation.availability.length) {
      context.addIssue({
        code: 'custom',
        message: 'Occupation availability values must be unique.',
        path: ['availability'],
      })
    }

    if (occupation.creditRating.minimum > occupation.creditRating.maximum) {
      context.addIssue({
        code: 'custom',
        message: 'Credit Rating minimum cannot exceed its maximum.',
        path: ['creditRating'],
      })
    }

    const skillCount = occupation.skillSlots.reduce(
      (total, slot) => total + resolvedSlotCount(slot),
      0,
    )
    if (skillCount !== 8) {
      context.addIssue({
        code: 'custom',
        message: 'An occupation must resolve to exactly eight skill slots.',
        path: ['skillSlots'],
      })
    }
  })

export type OccupationDefinition = z.infer<typeof occupationDefinitionSchema>

const choiceGroupSchema = z.object({
  id: catalogIdSchema,
  options: z.array(skillReferenceSchema).min(1),
})

export const occupationCatalogSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    choiceGroups: z.array(choiceGroupSchema),
    occupations: z.array(occupationDefinitionSchema),
  })
  .superRefine((catalog, context) => {
    const groups = new Map<string, z.infer<typeof choiceGroupSchema>>()
    for (const [index, group] of catalog.choiceGroups.entries()) {
      if (groups.has(group.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Occupation choice group ids must be unique.',
          path: ['choiceGroups', index, 'id'],
        })
      }
      groups.set(group.id, group)
    }

    const occupationIds = new Set<string>()
    for (const [occupationIndex, occupation] of catalog.occupations.entries()) {
      if (occupationIds.has(occupation.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Occupation ids must be unique.',
          path: ['occupations', occupationIndex, 'id'],
        })
      }
      occupationIds.add(occupation.id)

      for (const [slotIndex, slot] of occupation.skillSlots.entries()) {
        if (slot.kind !== 'GROUP') continue
        const group = groups.get(slot.groupId)
        if (!group) {
          context.addIssue({
            code: 'custom',
            message: 'An occupation may reference only a group from the same catalog.',
            path: ['occupations', occupationIndex, 'skillSlots', slotIndex, 'groupId'],
          })
        } else if (slot.count > group.options.length) {
          context.addIssue({
            code: 'custom',
            message: 'A group choice cannot select more options than the group contains.',
            path: ['occupations', occupationIndex, 'skillSlots', slotIndex, 'count'],
          })
        }
      }
    }
  })

export type OccupationCatalog = z.infer<typeof occupationCatalogSchema>

function collectReferences(catalog: OccupationCatalog): SkillReference[] {
  const references: SkillReference[] = catalog.choiceGroups.flatMap((group) => group.options)
  for (const occupation of catalog.occupations) {
    for (const slot of occupation.skillSlots) {
      if (slot.kind === 'SKILL' || slot.kind === 'FAMILY') references.push(slot)
      if (slot.kind === 'ONE_OF') references.push(...slot.options)
    }
  }
  return references
}

export function validateOccupationCatalogReferences(
  catalog: OccupationCatalog,
  skills: SkillCatalog,
): Result<void> {
  const skillIds = new Set(skills.skills.map(({ id }) => id))
  const familyIds = new Set(skills.families.map(({ id }) => id))
  const invalid = new Set(
    collectReferences(catalog)
      .filter((reference) =>
        reference.kind === 'SKILL'
          ? !skillIds.has(reference.skillId)
          : !familyIds.has(reference.familyId),
      )
      .map((reference) =>
        reference.kind === 'SKILL' ? `skill:${reference.skillId}` : `family:${reference.familyId}`,
      ),
  )

  if (invalid.size > 0) {
    return fail('investigators.errors.invalidOccupationCatalogReferences', {
      references: [...invalid].sort().join(','),
    })
  }
  return ok()
}

export function calculateOccupationSkillPoints(
  formula: OccupationPointFormula,
  characteristics: Readonly<Record<CharacteristicKey, number>>,
  selectedCharacteristic?: CharacteristicKey,
): Result<number> {
  switch (formula.id) {
    case 'EDU_X4':
      return ok(characteristics.EDU * 4)
    case 'EDU_X2_PLUS_DEX_X2_PLUS_STR_X2':
      return ok((characteristics.EDU + characteristics.DEX + characteristics.STR) * 2)
    case 'EDU_X2_PLUS_SELECTED_X2':
      if (!selectedCharacteristic) {
        return fail('investigators.errors.occupationCharacteristicRequired')
      }
      if (!formula.allowedCharacteristics.includes(selectedCharacteristic)) {
        return fail('investigators.errors.occupationCharacteristicNotAllowed', {
          characteristic: selectedCharacteristic,
        })
      }
      return ok((characteristics.EDU + characteristics[selectedCharacteristic]) * 2)
  }
}

export function calculatePersonalInterestPoints(intelligence: number): number {
  return intelligence * 2
}
