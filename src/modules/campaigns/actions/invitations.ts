'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { announceToKeepers, announceToUser } from '@/modules/notifications/data/announce'
import { env } from '@/lib/env'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { authActionClient } from '@/lib/safe-action'
import { touchCampaign } from '../data/campaigns'
import { requireKeeper } from '../data/guards'
import { addOrReviveMember, findMembership } from '../data/members'
import {
  claimInvitation,
  createInvitation as insertInvitation,
  previewInvitation,
  revokeInvitation as revokeInvitationRow,
} from '../data/invitations'
import { canModifyContent } from '../domain/rules'
import { createInvitationSchema, idSchema, invitationTokenSchema } from '../domain/schemas'
import { z } from 'zod'

/**
 * Invitation issuing and acceptance.
 *
 * Invitations reach existing accounts only: there is no public sign-up, so a
 * link handed to somebody without an account cannot create one. The accept
 * screen says so rather than failing obscurely.
 */
function invitationUrl(token: string): string {
  return `${env.BETTER_AUTH_URL}/invite/${token}`
}

export const createInvitation = authActionClient
  .metadata({ name: 'campaign.createInvitation' })
  .inputSchema(createInvitationSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireKeeper(parsedInput.campaignId)

    const modifiable = canModifyContent(context.status)
    if (!modifiable.ok) throw new DomainRuleError(modifiable.error.key)

    if (parsedInput.targetUserId) {
      const existing = await findMembership(parsedInput.campaignId, parsedInput.targetUserId)
      if (existing?.status === 'ACTIVE') {
        throw new ConflictError('campaigns.errors.alreadyAMember')
      }
    }

    const now = new Date()

    const { token, expiresAt } = await db.transaction(async (tx) => {
      const issued = await insertInvitation({
        campaignId: parsedInput.campaignId,
        targetUserId: parsedInput.targetUserId ?? null,
        roleOnJoin: parsedInput.roleOnJoin,
        maxUses: parsedInput.maxUses,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      /*
       * Only a personal invitation is announced. A shared link has no recipient
       * to tell, and the Keeper hands it over themselves.
       */
      if (parsedInput.targetUserId) {
        await announceToUser({
          userId: parsedInput.targetUserId,
          type: 'CAMPAIGN_INVITED',
          campaignId: parsedInput.campaignId,
          payload: { actorName: ctx.user.name },
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.invitationCreated',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
          metadata: {
            personal: parsedInput.targetUserId !== undefined,
            roleOnJoin: parsedInput.roleOnJoin,
            maxUses: parsedInput.maxUses,
          },
        },
        tx,
      )

      return issued
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/members`)

    // Shown once; the plaintext is not persisted anywhere.
    return { invitationUrl: invitationUrl(token), expiresAt }
  })

export const revokeInvitation = authActionClient
  .metadata({ name: 'campaign.revokeInvitation' })
  .inputSchema(z.object({ campaignId: idSchema, invitationId: idSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await requireKeeper(parsedInput.campaignId)

    await revokeInvitationRow(parsedInput.invitationId, parsedInput.campaignId, new Date())

    await recordAudit({
      actorId: ctx.user.id,
      action: 'campaign.invitationRevoked',
      entityType: 'campaign',
      entityId: parsedInput.campaignId,
      metadata: { invitationId: parsedInput.invitationId },
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/members`)

    return { ok: true }
  })

/**
 * Accepts an invitation.
 *
 * The claim and the membership write share one transaction, and the claim is a
 * conditional UPDATE, so two people following the last use of a shared link
 * resolve to exactly one join.
 *
 * Someone who is already a member is told so and sent to the campaign rather
 * than shown an error; arriving at a link for a campaign you are in is a
 * navigation event, not a failure.
 */
export const acceptInvitation = authActionClient
  .metadata({ name: 'campaign.acceptInvitation' })
  .inputSchema(invitationTokenSchema)
  .action(async ({ parsedInput, ctx }) => {
    const now = new Date()

    const preview = await previewInvitation(parsedInput.token, ctx.user.id, now)
    if (!preview.ok) throw new DomainRuleError(`campaigns.errors.invitation${preview.reason}`)

    if (preview.alreadyMember) {
      return { campaignId: preview.campaignId, alreadyMember: true }
    }

    const joined = await db.transaction(async (tx) => {
      const claimed = await claimInvitation(parsedInput.token, ctx.user.id, now, tx)
      if (!claimed) return null

      await addOrReviveMember({
        campaignId: claimed.campaignId,
        userId: ctx.user.id,
        role: claimed.roleOnJoin,
        now,
        executor: tx,
      })

      await touchCampaign(claimed.campaignId, now, tx)

      await announceToKeepers({
        campaignId: claimed.campaignId,
        type: 'CAMPAIGN_MEMBER_JOINED',
        payload: { actorName: ctx.user.name },
        now,
        executor: tx,
        // The joiner already knows; a Keeper joining their own campaign does not
        // need to be told about it.
        exceptUserId: ctx.user.id,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.memberJoined',
          entityType: 'campaign',
          entityId: claimed.campaignId,
          metadata: { invitationId: claimed.invitationId, role: claimed.roleOnJoin },
        },
        tx,
      )

      return claimed
    })

    if (!joined) {
      securityLogger.warn({ userId: ctx.user.id }, 'invitation claim lost the race or expired')
      throw new DomainRuleError('campaigns.errors.invitationEXHAUSTED')
    }

    revalidatePath('/campaigns')

    return { campaignId: joined.campaignId, alreadyMember: false }
  })
