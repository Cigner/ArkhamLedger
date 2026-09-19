import { z } from 'zod'
import { type Result, fail, ok } from '@/lib/result'
import { BACKSTORY_CATEGORIES } from './constants'
import { creationMethodSchema } from './ruleset'

/**
 * Reading a character out of a file.
 *
 * The question an import has to answer before it exists is what it trusts, and
 * the answer here is: the words, not the numbers it claims to have derived from
 * them. Anything a file asserts that the rules can compute is recomputed, and
 * anything the rules constrain is validated - so a sheet with 90 in every skill
 * and a note saying it came from somewhere else is refused rather than admired.
 *
 * Specifically not trusted, and not read at all:
 *
 *   - identity, ownership and lineage, which belong to the person importing;
 *   - development marks and play improvement, which are earned at a table;
 *   - status, so nothing arrives already ACTIVE and playable;
 *   - history of any kind - snapshots, disclosures, notes, resource events.
 *
 * What is trusted is what somebody typed: a name, an age, eight characteristics,
 * skill values, the backstory, the kit. Those are claims a Keeper can read and
 * argue with, which is the right place for that argument.
 */
const characteristic = z.number().int().min(1).max(99)

const importedSkill = z.object({
  definitionId: z.string().min(1).max(100),
  specializationKey: z.string().max(100).default(''),
  currentValue: z.number().int().min(0).max(99),
})

export const investigatorImportSchema = z.object({
  format: z.literal('arkham-ledger/investigator'),
  schemaVersion: z.number().int().min(1),
  ruleset: z.object({
    id: z.string().min(1).max(80),
    version: z.string().min(1).max(20),
  }),
  sheet: z.object({
    identity: z.object({
      name: z.string().trim().min(1).max(160),
      age: z.number().int().min(15).max(90).nullable(),
      sex: z.string().trim().max(80).nullish(),
      residence: z.string().trim().max(200).nullish(),
      birthplace: z.string().trim().max(200).nullish(),
      species: z.string().trim().max(80).default('Human'),
      occupationId: z.string().max(100).nullable(),
      occupationContact: z.string().trim().max(300).nullish(),
    }),
    characteristics: z.object({
      STR: characteristic.nullable(),
      CON: characteristic.nullable(),
      SIZ: characteristic.nullable(),
      DEX: characteristic.nullable(),
      APP: characteristic.nullable(),
      INT: characteristic.nullable(),
      POW: characteristic.nullable(),
      EDU: characteristic.nullable(),
    }),
    luck: z.object({ current: z.number().int().min(0).max(99).nullable() }),
    skills: z.array(importedSkill).max(200).default([]),
    backstory: z
      .array(
        z.object({
          category: z.enum(BACKSTORY_CATEGORIES),
          content: z.string().trim().max(4000),
          isKeyConnection: z.boolean().default(false),
        }),
      )
      .max(40)
      .default([]),
    possessions: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          description: z.string().trim().max(1000).nullish(),
          quantity: z.number().int().min(1).max(9999).default(1),
          value: z.number().min(0).nullable().default(null),
          isTreasured: z.boolean().default(false),
        }),
      )
      .max(100)
      .default([]),
    weapons: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(160),
          skillKey: z.string().trim().min(1).max(160),
          damage: z.string().trim().min(1).max(80),
          range: z.string().trim().max(80).nullish(),
          attacks: z.string().trim().max(80).nullish(),
          ammunition: z.number().int().min(0).max(9999).nullable().default(null),
          malfunction: z.number().int().min(0).max(100).nullable().default(null),
        }),
      )
      .max(50)
      .default([]),
  }),
  /** Ignored if present. Named so the reason for ignoring it is documented. */
  creationMethod: creationMethodSchema.optional(),
})

export type InvestigatorImport = z.infer<typeof investigatorImportSchema>

export type ImportWarning = { readonly key: string; readonly detail?: string }

/**
 * Checks a parsed file against the ruleset it claims.
 *
 * Returns warnings rather than refusing wherever the file is merely odd: a
 * skill this package has never heard of is dropped with a note, because the
 * alternative is refusing an entire character over one line somebody typed by
 * hand. Refusal is reserved for a file that is not a character.
 */
export function reviewImport(input: {
  readonly parsed: InvestigatorImport
  readonly knownSkillIds: ReadonlySet<string>
  readonly knownFamilyIds: ReadonlySet<string>
  readonly knownOccupationIds: ReadonlySet<string>
  readonly rulesetId: string
  readonly rulesetVersion: string
}): Result<{ warnings: ImportWarning[]; skills: InvestigatorImport['sheet']['skills'] }> {
  const warnings: ImportWarning[] = []

  if (input.parsed.ruleset.id !== input.rulesetId) {
    return fail('investigators.errors.importWrongRuleset', {
      expected: input.rulesetId,
      actual: input.parsed.ruleset.id,
    })
  }

  /*
   * A different version of the same package is allowed with a warning. Refusing
   * would make every content update orphan every file exported before it, and
   * the values are validated against this build's catalog anyway.
   */
  if (input.parsed.ruleset.version !== input.rulesetVersion) {
    warnings.push({
      key: 'investigators.import.differentVersion',
      detail: input.parsed.ruleset.version,
    })
  }

  const occupationId = input.parsed.sheet.identity.occupationId
  if (occupationId !== null && !input.knownOccupationIds.has(occupationId)) {
    warnings.push({ key: 'investigators.import.unknownOccupation', detail: occupationId })
  }

  const skills = input.parsed.sheet.skills.filter((skill) => {
    const known =
      input.knownSkillIds.has(skill.definitionId) ||
      (skill.specializationKey !== '' && input.knownFamilyIds.has(skill.definitionId))

    if (!known) {
      warnings.push({ key: 'investigators.import.unknownSkill', detail: skill.definitionId })
    }
    return known
  })

  const duplicates = new Set<string>()
  const seen = new Set<string>()
  for (const skill of skills) {
    const key = `${skill.definitionId}:${skill.specializationKey}`
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  if (duplicates.size > 0) {
    return fail('investigators.errors.importDuplicateSkills', {
      skills: [...duplicates].join(', '),
    })
  }

  return ok({ warnings, skills })
}
