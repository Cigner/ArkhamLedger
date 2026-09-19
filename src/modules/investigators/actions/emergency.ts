'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { adminActionClient } from '@/lib/safe-action'
import { sanitizeUserText } from '@/lib/text/sanitize'
import { announceToUser } from '@/modules/notifications/data/announce'
import { emergencyTransferSchema } from '../domain/schemas'
import { branchInvestigator } from '../data/branching'
import { findActiveBinding, listCampaignPlayers } from '../data/campaign-bindings'
import { findInvestigatorState } from '../data/investigator-store'
import { captureSnapshot } from '../data/snapshots'
import {
  attachContinuation,
  createTransferRequest,
  findPendingTransfer,
  redirectToBranch,
  settleTransfer,
} from '../data/transfers'

/**
 * Moving a character without asking.
 *
 * The one place in this module where something is taken rather than given, and
 * it is deliberately awkward: administrators only, a written reason of at least
 * a sentence, a security log line, an audit entry, a transfer row recording that
 * consent was never sought, and both people told.
 *
 * It exists because accounts are abandoned and people fall out, and a campaign
 * that cannot continue without somebody who has stopped answering is a campaign
 * that quietly ends. It does not exist to be convenient, which is why it is not
 * on the Keeper's screen.
 *
 * The previous owner still loses nothing: the branch they played stays theirs,
 * exactly as with a consented transfer. What is overridden is the asking, not
 * the promise.
 */
export const emergencyTransfer = adminActionClient
  .metadata({ name: 'investigator.emergencyTransfer' })
  .inputSchema(emergencyTransferSchema)
  .action(async ({ parsedInput, ctx }) => {
    const investigator = await findInvestigatorState(parsedInput.investigatorId)

    if (investigator.ownerId === parsedInput.toOwnerId) {
      throw new DomainRuleError('investigators.errors.alreadyTheirs')
    }

    const binding = await findActiveBinding({
      investigatorId: parsedInput.investigatorId,
      campaignId: parsedInput.campaignId,
    })
    if (!binding) throw new DomainRuleError('investigators.errors.notInCampaign')

    const players = await listCampaignPlayers(parsedInput.campaignId)
    if (!players.some((player) => player.userId === parsedInput.toOwnerId)) {
      throw new DomainRuleError('investigators.errors.newOwnerNotInCampaign')
    }

    const reason = sanitizeUserText(parsedInput.reason, { maxLength: 500 })
    if (reason.length < 10) throw new DomainRuleError('investigators.errors.reasonRequired')

    const now = new Date()

    securityLogger.warn(
      {
        adminId: ctx.user.id,
        investigatorId: parsedInput.investigatorId,
        fromOwnerId: investigator.ownerId,
        toOwnerId: parsedInput.toOwnerId,
        campaignId: parsedInput.campaignId,
      },
      'investigator transferred without consent',
    )

    const branchId = await db.transaction(async (tx) => {
      /*
       * Any request already waiting on the owner is withdrawn first. Leaving it
       * open would let them later accept a hand-over of a character that has
       * since moved, branching a second time from a source nobody holds.
       */
      const pending = await findPendingTransfer({
        investigatorId: parsedInput.investigatorId,
        executor: tx,
      })
      if (pending) {
        await settleTransfer({
          transferId: pending.id,
          status: 'CANCELLED',
          now,
          executor: tx,
        })
      }

      /*
       * Recorded as a transfer that was never asked, rather than as no transfer
       * at all. The history of a character has to be able to say that its owner
       * changed and that nobody consulted them.
       */
      const transferId = await createTransferRequest({
        campaignId: parsedInput.campaignId,
        investigatorId: parsedInput.investigatorId,
        fromOwnerId: investigator.ownerId,
        toOwnerId: parsedInput.toOwnerId,
        requestedBy: ctx.user.id,
        reason,
        expiresAt: now,
        now,
        executor: tx,
      })

      await settleTransfer({
        transferId,
        status: 'ACCEPTED',
        now,
        executor: tx,
      })

      await captureSnapshot({
        investigatorId: parsedInput.investigatorId,
        kind: 'TRANSFER',
        campaignId: parsedInput.campaignId,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      const branch = await branchInvestigator({
        sourceInvestigatorId: parsedInput.investigatorId,
        newOwnerId: parsedInput.toOwnerId,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      await redirectToBranch({
        campaignId: parsedInput.campaignId,
        sourceInvestigatorId: parsedInput.investigatorId,
        branchInvestigatorId: branch,
        newOwnerId: parsedInput.toOwnerId,
        now,
        executor: tx,
      })

      /*
       * The row points at what the character became, exactly as a consented
       * transfer's does. A hand-over whose continuation is unrecorded is one
       * the history cannot follow.
       */
      await attachContinuation({
        transferId,
        continuationInvestigatorId: branch,
        now,
        executor: tx,
      })

      // Both of them, including the person it was taken from.
      for (const userId of [investigator.ownerId, parsedInput.toOwnerId]) {
        await announceToUser({
          userId,
          type: 'INVESTIGATOR_TRANSFER_ACCEPTED',
          campaignId: parsedInput.campaignId,
          payload: { investigatorId: branch, reason },
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.emergencyTransfer',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: {
            campaignId: parsedInput.campaignId,
            fromOwnerId: investigator.ownerId,
            toOwnerId: parsedInput.toOwnerId,
            branchId: branch,
            reason,
            consent: 'OVERRIDDEN',
          },
        },
        tx,
      )

      return branch
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/investigators`)
    revalidatePath('/investigators')

    return { ok: true, investigatorId: branchId }
  })
