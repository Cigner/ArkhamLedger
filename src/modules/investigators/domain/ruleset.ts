import { z } from 'zod'

/**
 * Versioned Investigator ruleset manifest.
 *
 * Content packages contain declarative identifiers only. Every formula named by
 * a package must be implemented by the domain engine, so publishing content can
 * never introduce executable code.
 */
export const creationRollFormulaSchema = z.enum([
  'THREE_D6_TIMES_FIVE',
  'TWO_D6_PLUS_SIX_TIMES_FIVE',
])

export type CreationRollFormula = z.infer<typeof creationRollFormulaSchema>

export const creationMethodSchema = z.enum(['STANDARD_ROLLS', 'ASSIGNED_ROLLS', 'MANUAL_ENTRY'])

export type CreationMethod = z.infer<typeof creationMethodSchema>

const characteristicKeySchema = z.enum(['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'])

const REQUIRED_CHARACTERISTICS = characteristicKeySchema.options

const characteristicDefinitionsSchema = z
  .array(
    z.object({
      key: characteristicKeySchema,
      rollFormula: creationRollFormulaSchema,
    }),
  )
  .length(REQUIRED_CHARACTERISTICS.length)
  .superRefine((definitions, context) => {
    const keys = new Set(definitions.map(({ key }) => key))
    for (const key of REQUIRED_CHARACTERISTICS) {
      if (!keys.has(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Every characteristic must be defined exactly once.',
          path: [key],
        })
      }
    }
  })

const contentFileSchema = z.string().regex(/^[a-z0-9-]+\.json$/)

export const investigatorRulesetManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    era: z.string().min(1),
    nameKey: z.string().min(1),
    minimumAge: z.number().int().nonnegative(),
    maximumAge: z.number().int().positive(),
    creationMethods: z.array(creationMethodSchema).min(1),
    characteristics: characteristicDefinitionsSchema,
    luckRollFormula: creationRollFormulaSchema,
    skillFiles: z.array(contentFileSchema).min(1),
    occupationFiles: z.array(contentFileSchema).min(1),
  })
  .superRefine((manifest, context) => {
    if (manifest.minimumAge > manifest.maximumAge) {
      context.addIssue({
        code: 'custom',
        message: 'The minimum age must not exceed the maximum age.',
        path: ['minimumAge'],
      })
    }
  })

export type InvestigatorRulesetManifest = z.infer<typeof investigatorRulesetManifestSchema>
