'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { listMemberRoles } from '../data/campaigns'
import { requireCampaignMember, requireOwner } from '../data/guards'
import { findMembership, setMemberRole, setMembershipStatus } from '../data/members'
import {
  canChangeMemberRole,
  canLeaveCampaign,
  canRemoveMember,
  wouldLeaveNoKeeper,
} from '../domain/rules'
import { campaignIdSchema, changeMemberRoleSchema, memberSchema } from '../domain/schemas'

/**
 * Membership changes.
 *
 * Removing somebody and changing their role are owner-only; leaving is
 * self-service. All three keep the membership row and move its status, so a
 * returning player rejoins the record that already holds their history.
 */
export const leaveCampaign = authActionClient
  .metadata({ name: 'campaign.leave' })
  .inputSchema(campaignIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireCampaignMember(parsedInput.campaignId)

    const allowed = canLeaveCampaign(context.membership)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const members = await listMemberRoles(parsedInput.campaignId)
    if (wouldLeaveNoKeeper(members, ctx.user.id, null)) {
      throw new DomainRuleError('campaigns.errors.wouldLeaveNoKeeper')
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      await setMembershipStatus({
        campaignId: parsedInput.campaignId,
        userId: ctx.user.id,
        status: 'LEFT',
        now,
        executor: tx,
      })
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.memberLeft',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
        },
        tx,
      )
    })

    revalidatePath('/campaigns')

    return { ok: true }
  })

export const removeMember = authActionClient
  .metadata({ name: 'campaign.removeMember' })
  .inputSchema(memberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireOwner(parsedInput.campaignId)

    const allowed = canRemoveMember(context.membership, parsedInput.userId)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const target = await findMembership(parsedInput.campaignId, parsedInput.userId)
    if (!target || target.status !== 'ACTIVE') {
      throw new DomainRuleError('campaigns.errors.notAMember')
    }

    const members = await listMemberRoles(parsedInput.campaignId)
    if (wouldLeaveNoKeeper(members, parsedInput.userId, null)) {
      throw new DomainRuleError('campaigns.errors.wouldLeaveNoKeeper')
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      await setMembershipStatus({
        campaignId: parsedInput.campaignId,
        userId: parsedInput.userId,
        status: 'REMOVED',
        now,
        executor: tx,
      })
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.memberRemoved',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
          metadata: { userId: parsedInput.userId },
        },
        tx,
      )
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/members`)

    return { ok: true }
  })

export const changeMemberRole = authActionClient
  .metadata({ name: 'campaign.changeMemberRole' })
  .inputSchema(changeMemberRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireOwner(parsedInput.campaignId)

    const allowed = canChangeMemberRole(context.membership, parsedInput.userId)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const members = await listMemberRoles(parsedInput.campaignId)
    if (wouldLeaveNoKeeper(members, parsedInput.userId, parsedInput.role)) {
      throw new DomainRuleError('campaigns.errors.wouldLeaveNoKeeper')
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      await setMemberRole({
        campaignId: parsedInput.campaignId,
        userId: parsedInput.userId,
        role: parsedInput.role,
        now,
        executor: tx,
      })
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'campaign.memberRoleChanged',
          entityType: 'campaign',
          entityId: parsedInput.campaignId,
          metadata: { userId: parsedInput.userId, role: parsedInput.role },
        },
        tx,
      )
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/members`)

    return { ok: true }
  })
