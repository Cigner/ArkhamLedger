import { z } from 'zod'
import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_NAME_MIN_LENGTH,
  INVITATION_MAX_USES,
  SCENARIO_DESCRIPTION_MAX_LENGTH,
  SCENARIO_NAME_MAX_LENGTH,
} from './constants'

/**
 * Input schemas for campaign operations.
 *
 * Identifiers are validated for shape before any query runs, so a malformed or
 * probing id never reaches the database.
 */
export const idSchema = z.string().length(26)

export const campaignRoleSchema = z.enum(['KEEPER', 'INVESTIGATOR'])
export const campaignStatusSchema = z.enum([
  'PLANNING',
  'ACTIVE',
  'ON_HIATUS',
  'COMPLETED',
  'ARCHIVED',
])

const nameSchema = z
  .string()
  .trim()
  .min(CAMPAIGN_NAME_MIN_LENGTH)
  .max(CAMPAIGN_NAME_MAX_LENGTH)

const descriptionSchema = z
  .string()
  .trim()
  .max(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  .optional()
  .transform((value) => (value === '' ? undefined : value))

export const createCampaignSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  scenarioName: z.string().trim().max(SCENARIO_NAME_MAX_LENGTH).optional(),
})

export const updateCampaignSchema = z.object({
  campaignId: idSchema,
  name: nameSchema,
  description: descriptionSchema,
  status: campaignStatusSchema,
  timezone: z.string().min(1).max(64),
})

export const campaignIdSchema = z.object({ campaignId: idSchema })

export const transferOwnershipSchema = z.object({
  campaignId: idSchema,
  newOwnerId: idSchema,
})

export const memberSchema = z.object({
  campaignId: idSchema,
  userId: idSchema,
})

export const changeMemberRoleSchema = z.object({
  campaignId: idSchema,
  userId: idSchema,
  role: campaignRoleSchema,
})

/**
 * Invitation creation.
 *
 * A personal invitation names its recipient and is single-use; a shared link
 * leaves the recipient open and carries a use count. The refinement enforces
 * that pairing rather than trusting the form to.
 */
export const createInvitationSchema = z
  .object({
    campaignId: idSchema,
    targetUserId: idSchema.optional(),
    roleOnJoin: campaignRoleSchema.default('INVESTIGATOR'),
    maxUses: z.coerce.number().int().min(1).max(INVITATION_MAX_USES).default(1),
  })
  .refine((value) => value.targetUserId === undefined || value.maxUses === 1, {
    error: 'campaigns.errors.personalInvitationMustBeSingleUse',
    path: ['maxUses'],
  })

export const invitationTokenSchema = z.object({
  token: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'campaigns.errors.tokenMalformed' }),
})

export const upsertScenarioSchema = z.object({
  campaignId: idSchema,
  name: z.string().trim().min(1).max(SCENARIO_NAME_MAX_LENGTH),
  description: z.string().trim().max(SCENARIO_DESCRIPTION_MAX_LENGTH).optional(),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
