import { z } from 'zod'
import { type OccupationCatalog, occupationCatalogSchema } from './occupations'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const eraSchema = z.enum(['CLASSIC_1920S', 'MODERN'])
const allEras = ['CLASSIC_1920S', 'MODERN'] as const

const skillReferenceSchema = z
  .string()
  .regex(/^@?[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/)

const sourceSlotSchema = z.union([
  skillReferenceSchema,
  z.object({ group: idSchema, count: z.number().int().positive() }),
  z.object({
    oneOf: z.array(skillReferenceSchema).min(2),
    count: z.number().int().positive().default(1),
  }),
  z.object({ any: z.number().int().positive() }),
])

const sourcePointFormulaSchema = z.union([
  z.literal('EDU_X4'),
  z.literal('EDU_X2_PLUS_DEX_X2_PLUS_STR_X2'),
  z.object({
    selected: z.array(z.enum(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'])).min(1),
  }),
])

export const occupationSourceCatalogSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  choiceGroups: z.record(idSchema, z.array(skillReferenceSchema).min(1)),
  occupations: z.array(
    z.object({
      id: idSchema,
      eras: z
        .array(eraSchema)
        .min(1)
        .default([...allEras]),
      tags: z.array(z.enum(['LOVECRAFTIAN'])).default([]),
      points: sourcePointFormulaSchema,
      credit: z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]),
      skills: z.array(sourceSlotSchema).min(1),
    }),
  ),
})

export type OccupationSourceCatalog = z.input<typeof occupationSourceCatalogSchema>

function toCamelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase())
}

function normalizeReference(reference: string) {
  if (!reference.startsWith('@')) {
    return { kind: 'SKILL' as const, skillId: reference }
  }

  const [familyId, specializationId] = reference.slice(1).split(':')
  return specializationId
    ? {
        kind: 'FAMILY' as const,
        familyId,
        specializationId,
        specializationNameKey: `investigators.specializations.${toCamelCase(specializationId)}`,
      }
    : { kind: 'FAMILY' as const, familyId }
}

function normalizeSlot(slot: z.output<typeof sourceSlotSchema>) {
  if (typeof slot === 'string') return normalizeReference(slot)
  if ('group' in slot) {
    return { kind: 'GROUP' as const, groupId: slot.group, count: slot.count }
  }
  if ('oneOf' in slot) {
    return {
      kind: 'ONE_OF' as const,
      count: slot.count,
      options: slot.oneOf.map(normalizeReference),
    }
  }
  return { kind: 'ANY' as const, count: slot.any }
}

function normalizePointFormula(formula: z.output<typeof sourcePointFormulaSchema>) {
  if (formula === 'EDU_X4' || formula === 'EDU_X2_PLUS_DEX_X2_PLUS_STR_X2') {
    return { id: formula }
  }
  return {
    id: 'EDU_X2_PLUS_SELECTED_X2' as const,
    allowedCharacteristics: formula.selected,
  }
}

/**
 * Converts the compact administrator-owned JSON format into the strict domain
 * catalog. The second parse keeps storage conveniences outside domain rules.
 */
export function normalizeOccupationCatalog(source: unknown): OccupationCatalog {
  const parsed = occupationSourceCatalogSchema.parse(source)
  return occupationCatalogSchema.parse({
    version: parsed.version,
    choiceGroups: Object.entries(parsed.choiceGroups).map(([id, options]) => ({
      id,
      options: options.map(normalizeReference),
    })),
    occupations: parsed.occupations.map((occupation) => ({
      id: occupation.id,
      nameKey: `investigators.occupations.${toCamelCase(occupation.id)}`,
      availability: occupation.eras,
      tags: occupation.tags,
      pointFormula: normalizePointFormula(occupation.points),
      creditRating: {
        minimum: occupation.credit[0],
        maximum: occupation.credit[1],
      },
      skillSlots: occupation.skills.map(normalizeSlot),
    })),
  })
}
