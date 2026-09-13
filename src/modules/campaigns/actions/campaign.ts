'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { env } from '@/lib/env'
import { DomainRuleError } from '@/lib/errors'
import { isValidTimeZone } from '@/lib/datetime/temporal'
import { authActionClient } from '@/lib/safe-action'
import {
  archiveCampaign,
  createCampaign as insertCampaign,
  findCampaignState,
  setCampaignOwner,
  updateCampaign as persistCampaign,
  getCampaignSettings,
  upsertCampaignScenario,
} from '../data/campaigns'
import { requireKeeper, requireOwner } from '../data/guards'
import { findMembership, setMemberRole } from '../data/members'
import {
  canArchiveCampaign,
  canModifyContent,
  canTransferOwnership,
} from '../domain/rules'
import {
  campaignIdSchema,
  createCampaignSchema,
  transferOwnershipSchema,
  updateCampaignSchema,
  upsertScenarioSchema,
} from '../domain/schemas'

/**
 * Campaign lifecycle.
 *
 * Every action re-authorizes through the data-layer guards rather than trusting
 * the route it was reached from; a Server Action is a public POST endpoint.
 */
export const createCampaign = authActionClient
  .metadata({ name: 'campaign.create' })
  .inputSchema(createCampaignSchema)
  .action(async ({ parsedInput, ctx }) => {
    const now = new Date()

    const { campaignId } = await insertCampaign({
      name: parsedInput.name,
      description: parsedInput.description,
      scenarioName: parsedInput.scenarioName,
      ownerId: ctx.user.id,
      timezone: env.DEFAULT_TIMEZONE,
      now,
    })

    await recordAudit({
      actorId: ctx.user.id,
      action: 'campaign.created',
      entityType: 'campaign',
      entityId: campaignId,
      metadata: { name: parsedInput.name },
    })

    revalidatePath('/campaigns')

    return { campaignId }
  })

export const updateCampaign = authActionClient
  .metadata({ name: 'campaign.update' })
  .inputSchema(updateCampaignSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireKeeper(parsedInput.campaignId)

    const modifiable = canModifyContent(context.status)
    if (!modifiable.ok) throw new DomainRuleError(modifiable.error.key)

    if (!isValidTimeZone(parsedInput.timezone)) {
      throw new DomainRuleError('campaigns.errors.invalidTimezone')
    }

    await persistCampaign(
      parsedInput.campaignId,
      {
        name: parsedInput.name,
        description: parsedInput.description ?? null,
        status: parsedInput.status,
        timezone: parsedInput.timezone,
      },
      new Date(),
    )

    await recordAudit({
      actorId: ctx.user.id,
      action: 'campaign.updated',
      entityType: 'campaign',
      entityId: parsedInput.campaignId,
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}`)
    revalidatePath('/campaigns')

    return { ok: true }
  })

export const archiveCampaignAction = authActionClient
  .metadata({ name: 'campaign.archive' })
  .inputSchema(campaignIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireOwner(parsedInput.campaignId)

    const allowed = canArchiveCampaign(context.membership)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      await archiveCampaign(parsedInput.campaignId, now, tx)
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.archived',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
        },
        tx,
      )
    })

    revalidatePath('/campaigns')

    return { ok: true }
  })

/**
 * Hands the campaign to another active member.
 *
 * The new owner is promoted to Keeper in the same transaction: an owner who
 * cannot manage their own campaign is a state worth making unreachable rather
 * than validating against later.
 */
export const transferOwnership = authActionClient
  .metadata({ name: 'campaign.transferOwnership' })
  .inputSchema(transferOwnershipSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireOwner(parsedInput.campaignId)
    const target = await findMembership(parsedInput.campaignId, parsedInput.newOwnerId)

    const allowed = canTransferOwnership(context.membership, target)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      await setCampaignOwner(parsedInput.campaignId, parsedInput.newOwnerId, now, tx)
      await setMemberRole({
        campaignId: parsedInput.campaignId,
        userId: parsedInput.newOwnerId,
        role: 'KEEPER',
        now,
        executor: tx,
      })
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.ownershipTransferred',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
          metadata: { newOwnerId: parsedInput.newOwnerId },
        },
        tx,
      )
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}`)

    return { ok: true }
  })

export const saveScenario = authActionClient
  .metadata({ name: 'campaign.saveScenario' })
  .inputSchema(upsertScenarioSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireKeeper(parsedInput.campaignId)

    const modifiable = canModifyContent(context.status)
    if (!modifiable.ok) throw new DomainRuleError(modifiable.error.key)

    const settings = await getCampaignSettings(parsedInput.campaignId)
    await findCampaignState(parsedInput.campaignId)

    await upsertCampaignScenario({
      campaignId: parsedInput.campaignId,
      scenarioId: settings.scenarioId,
      name: parsedInput.name,
      description: parsedInput.description ?? null,
      createdBy: ctx.user.id,
      now: new Date(),
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}`)

    return { ok: true }
  })
