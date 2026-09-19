import { z } from 'zod'
import { OVERRIDABLE_DERIVED_KEYS } from './derived-values'
import { creationMethodSchema } from './ruleset'

/**
 * Input shapes for the Investigator actions.
 *
 * Names are bounded here and cleaned in the action, in that order: a limit the
 * form can show is a better experience than silent truncation, and the cleaning
 * still runs because the form is not the only caller.
 */
export const investigatorIdSchema = z.string().length(26)

export const investigatorNameSchema = z.string().trim().min(1).max(160)

export const createInvestigatorSchema = z.object({
  name: investigatorNameSchema,
  creationMethod: creationMethodSchema.default('STANDARD_ROLLS'),
  rulesetId: z.string().min(1),
  rulesetVersion: z.string().min(1),
  /** Optional: create it already linked to a campaign the owner plays in. */
  campaignId: investigatorIdSchema.optional(),
})

export const createForPlayerSchema = z.object({
  campaignId: investigatorIdSchema,
  playerId: investigatorIdSchema,
  name: investigatorNameSchema,
  creationMethod: creationMethodSchema.default('STANDARD_ROLLS'),
  rulesetId: z.string().min(1),
  rulesetVersion: z.string().min(1),
})

export const campaignBindingSchema = z.object({
  investigatorId: investigatorIdSchema,
  campaignId: investigatorIdSchema,
})

export const unlinkInvestigatorSchema = campaignBindingSchema.extend({
  reason: z.string().trim().max(500).optional(),
})

/**
 * Sheet sections save independently.
 *
 * One long sheet does not mean one enormous submission: a section that saves on
 * its own keeps a slow connection from costing somebody the whole page, and the
 * expected version makes each save refuse rather than clobber if the sheet moved
 * underneath it.
 */
const optionalText = (max: number) => z.string().trim().max(max).nullish()

export const saveIdentitySchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  name: investigatorNameSchema,
  age: z.number().int().min(1).max(120).nullable(),
  sex: optionalText(80),
  residence: optionalText(200),
  birthplace: optionalText(200),
  species: z.string().trim().min(1).max(80).default('Human'),
})

const characteristicValue = z.number().int().min(1).max(99).nullable()

export const saveCharacteristicsSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  STR: characteristicValue,
  CON: characteristicValue,
  SIZ: characteristicValue,
  DEX: characteristicValue,
  APP: characteristicValue,
  INT: characteristicValue,
  POW: characteristicValue,
  EDU: characteristicValue,
  startingLuck: characteristicValue,
  /** Where the numbers came from, for a sheet that can answer it later. */
  source: z.enum(['ROLLED', 'ASSIGNED', 'MANUAL']).default('MANUAL'),
})

export const activateInvestigatorSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
})

export const characteristicKeySchema = z.enum([
  'STR',
  'CON',
  'SIZ',
  'DEX',
  'APP',
  'INT',
  'POW',
  'EDU',
])

/**
 * Replacing a calculated value by hand.
 *
 * A null value withdraws the override rather than setting one to nothing, and
 * the reason is required in both directions: section 8 asks for it, and "why is
 * this character's Sanity 60" is exactly the question somebody asks six months
 * later.
 */
export const setDerivedOverrideSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  fieldKey: z.enum(OVERRIDABLE_DERIVED_KEYS),
  value: z.number().int().min(0).max(999).nullable(),
  reason: z.string().trim().min(3).max(500),
})

export const saveOccupationSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  occupationId: z.string().min(1).max(100),
  /** Only for the occupations whose point formula offers a choice. */
  characteristic: characteristicKeySchema.nullish(),
  /** One entry per open slot, in the order the sheet presented them. */
  choices: z.array(z.string().min(1).max(100)).max(16),
  /** Free text: who the job knows, in the player's own words. */
  contact: z.string().max(300).nullish(),
})

export const saveSkillsSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  allocations: z
    .array(
      z.object({
        skillKey: z.string().min(1).max(120),
        occupationPoints: z.number().int().min(0).max(99),
        personalInterestPoints: z.number().int().min(0).max(99),
      }),
    )
    .max(200),
})

export const removeSkillSchema = z.object({
  investigatorId: investigatorIdSchema,
  skillKey: z.string().min(1).max(120),
})

export const saveFinancesSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  cash: z.number().min(0).max(9_999_999_999).nullable(),
  assets: z.number().min(0).max(999_999_999_999).nullable(),
  notes: z.string().trim().max(2000).nullish(),
})

export const saveBackstorySchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  entries: z
    .array(
      z.object({
        category: z.string().min(1).max(80),
        content: z.string().trim().max(4000),
        isKeyConnection: z.boolean().default(false),
      }),
    )
    .max(40),
})

export const saveVisibilitySchema = z.object({
  investigatorId: investigatorIdSchema,
  hidden: z.array(z.string().min(1).max(120)).max(200),
})

export const savePossessionsSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  entries: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).nullish(),
        quantity: z.number().int().min(1).max(9999).default(1),
        value: z.number().min(0).max(9_999_999_999).nullable(),
        isTreasured: z.boolean().default(false),
      }),
    )
    .max(100),
})

export const saveWeaponsSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  entries: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        skillKey: z.string().trim().min(1).max(160),
        damage: z.string().trim().min(1).max(80),
        range: z.string().trim().max(80).nullish(),
        attacks: z.string().trim().max(80).nullish(),
        ammunition: z.number().int().min(0).max(9999).nullable(),
        malfunction: z.number().int().min(0).max(100).nullable(),
        notes: z.string().trim().max(1000).nullish(),
      }),
    )
    .max(50),
})

export const addSkillSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  definitionId: z.string().trim().min(1).max(100),
  /** A family skill needs the specialization the player wrote in. */
  specialization: z.string().trim().max(100).nullish(),
})

export const resourceKindSchema = z.enum(['HP', 'SAN', 'MP', 'LUCK'])

/**
 * Changing a resource in play.
 *
 * Damage and Sanity loss are expressed as an amount rather than a target value,
 * because the rules read the size of the blow: eight points taken at once is a
 * different event from eight points taken four at a time, and a form that asked
 * for the new total could not tell them apart.
 */
export const adjustResourceSchema = z.object({
  investigatorId: investigatorIdSchema,
  resource: resourceKindSchema,
  amount: z.number().int().min(-999).max(999),
  reason: z.string().trim().max(500).nullish(),
  gameSessionId: investigatorIdSchema.nullish(),
})

export const setConditionsSchema = z.object({
  investigatorId: investigatorIdSchema,
  majorWound: z.boolean(),
  temporaryInsanity: z.boolean(),
  indefiniteInsanity: z.boolean(),
  unconscious: z.boolean(),
  dying: z.boolean(),
})

export const reverseResourceChangeSchema = z.object({
  investigatorId: investigatorIdSchema,
})

export const markSkillSchema = z.object({
  investigatorId: investigatorIdSchema,
  skillKey: z.string().min(1).max(120),
  marked: z.boolean(),
  gameSessionId: investigatorIdSchema.nullish(),
})

export const assignInvestigatorSchema = z.object({
  sessionId: investigatorIdSchema,
  participantId: investigatorIdSchema,
  /** Null clears the assignment, which is how somebody becomes undecided again. */
  investigatorId: investigatorIdSchema.nullable(),
})

export const useSameInvestigatorsSchema = z.object({
  sessionId: investigatorIdSchema,
})

export const requestTransferSchema = z.object({
  campaignId: investigatorIdSchema,
  investigatorId: investigatorIdSchema,
  toOwnerId: investigatorIdSchema,
  reason: z.string().trim().max(500).nullish(),
})

export const decideTransferSchema = z.object({
  transferId: investigatorIdSchema,
  accept: z.boolean(),
})

export const cancelTransferSchema = z.object({
  transferId: investigatorIdSchema,
})

export const markSkillForDevelopmentSchema = z.object({
  investigatorId: investigatorIdSchema,
  skillKey: z.string().min(1).max(120),
  marked: z.boolean(),
  gameSessionId: investigatorIdSchema.nullish(),
})

/**
 * Resolving one ticked skill.
 *
 * Both dice come from the table. The improvement roll is optional because it is
 * only thrown when the percentile earned it, and asking for it up front would
 * invite somebody to invent one.
 */
export const resolveDevelopmentSchema = z.object({
  investigatorId: investigatorIdSchema,
  skillKey: z.string().min(1).max(120),
  percentileRoll: z.number().int().min(1).max(100),
  improvementRoll: z.number().int().min(1).max(10).nullish(),
})

export const noteKindSchema = z.enum(['OWNER_PRIVATE', 'KEEPER', 'PLAYER_OBSERVATION'])

export const noteVisibilitySchema = z.enum([
  'AUTHOR_ONLY',
  'KEEPERS',
  'KEEPERS_AND_OWNER',
  'CAMPAIGN',
])

export const writeNoteSchema = z.object({
  investigatorId: investigatorIdSchema,
  campaignId: investigatorIdSchema.nullish(),
  kind: noteKindSchema,
  content: z.string().trim().min(1).max(4000),
  visibility: noteVisibilitySchema.default('AUTHOR_ONLY'),
})

export const reviseNoteSchema = z.object({
  noteId: investigatorIdSchema,
  content: z.string().trim().min(1).max(4000),
  visibility: noteVisibilitySchema,
})

export const duplicateInvestigatorSchema = z.object({
  investigatorId: investigatorIdSchema,
  name: investigatorNameSchema.optional(),
})

/**
 * The administrator's override.
 *
 * A reason is required rather than optional, and it is long enough to be a
 * sentence rather than a word. An unexplained override is indistinguishable
 * from an abuse six months later, which is the whole reason this action is
 * separate from the one the owner consents to.
 */
export const emergencyTransferSchema = z.object({
  campaignId: investigatorIdSchema,
  investigatorId: investigatorIdSchema,
  toOwnerId: investigatorIdSchema,
  reason: z.string().trim().min(10).max(500),
})

export const importInvestigatorSchema = z.object({
  /** The file's text. Parsed and validated in the action, never trusted here. */
  document: z.string().min(2).max(500_000),
  campaignId: investigatorIdSchema.optional(),
})

export const investigatorStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'RETIRED', 'DECEASED'])

export const changeStatusSchema = z.object({
  investigatorId: investigatorIdSchema,
  expectedVersion: z.number().int().min(0),
  status: investigatorStatusSchema,
  /** Required when a character dies, because that is a thing worth recording. */
  reason: z.string().trim().max(500).nullish(),
})

export const archiveInvestigatorSchema = z.object({
  investigatorId: investigatorIdSchema,
  archived: z.boolean(),
})

export const deleteInvestigatorSchema = z.object({
  investigatorId: investigatorIdSchema,
})
