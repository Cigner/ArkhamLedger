'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError, ForbiddenError, NotFoundError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeOptionalText } from '@/lib/text/sanitize'
import { announceToUser } from '@/modules/notifications/data/announce'
import { requireCampaignMember } from '@/modules/campaigns/data/guards'
import { canDecideTransfer, canRequestTransfer, transferExpiryFrom } from '../domain/transfer'
import {
  cancelTransferSchema,
  decideTransferSchema,
  requestTransferSchema,
} from '../domain/schemas'
import { branchInvestigator } from '../data/branching'
import { findActiveBinding, listCampaignPlayers } from '../data/campaign-bindings'
import { findInvestigatorState } from '../data/investigator-store'
import { captureSnapshot } from '../data/snapshots'
import {
  attachContinuation,
  createTransferRequest,
  findTransfer,
  hasPendingTransfer,
  redirectToBranch,
  settleTransfer,
} from '../data/transfers'

/**
 * Handing a character to somebody else.
 *
 * A Keeper asks and the owner answers. That order is the point: a character
 * belongs to its player, and a campaign that could reassign one at will would
 * be a campaign where nothing is really yours.
 *
 * Accepting is one transaction that leaves the previous owner holding exactly
 * what they had. They keep the branch they played; the new owner gets a
 * continuation of it. Nobody's history is rewritten.
 */
export const requestInvestigatorTransfer = authActionClient
  .metadata({ name: 'investigator.requestTransfer' })
  .inputSchema(requestTransferSchema)
  .action(async ({ parsedInput, ctx }) => {
    const membership = await requireCampaignMember(parsedInput.campaignId)
    if (membership.membership.role !== 'KEEPER') throw new ForbiddenError()

    const investigator = await findInvestigatorState(parsedInput.investigatorId)
    const binding = await findActiveBinding({
      investigatorId: parsedInput.investigatorId,
      campaignId: parsedInput.campaignId,
    })
    const players = await listCampaignPlayers(parsedInput.campaignId)

    const allowed = canRequestTransfer({
      investigatorStatus: investigator.status,
      archivedAt: investigator.archivedAt,
      currentOwnerId: investigator.ownerId,
      newOwnerId: parsedInput.toOwnerId,
      newOwnerIsCampaignMember: players.some((player) => player.userId === parsedInput.toOwnerId),
      linkedToCampaign: binding !== null,
      hasPendingTransfer: await hasPendingTransfer({
        investigatorId: parsedInput.investigatorId,
      }),
    })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key, allowed.error.params)

    const now = new Date()
    const reason = sanitizeOptionalText(parsedInput.reason, { maxLength: 500 })

    const transferId = await db.transaction(async (tx) => {
      const id = await createTransferRequest({
        campaignId: parsedInput.campaignId,
        investigatorId: parsedInput.investigatorId,
        fromOwnerId: investigator.ownerId,
        toOwnerId: parsedInput.toOwnerId,
        requestedBy: ctx.user.id,
        reason,
        expiresAt: transferExpiryFrom(now),
        now,
        executor: tx,
      })

      await announceToUser({
        userId: investigator.ownerId,
        type: 'INVESTIGATOR_TRANSFER_REQUESTED',
        campaignId: parsedInput.campaignId,
        payload: {
          actorName: ctx.user.name,
          investigatorId: parsedInput.investigatorId,
          ...(reason === null ? {} : { reason }),
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.transferRequested',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { campaignId: parsedInput.campaignId, toOwnerId: parsedInput.toOwnerId },
        },
        tx,
      )

      return id
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/investigators`)

    return { ok: true, transferId }
  })

export const decideInvestigatorTransfer = authActionClient
  .metadata({ name: 'investigator.decideTransfer' })
  .inputSchema(decideTransferSchema)
  .action(async ({ parsedInput, ctx }) => {
    const transfer = await findTransfer(parsedInput.transferId)

    /*
     * Not forbidden: not found. Answering somebody else's transfer is refused
     * on the same terms as one that does not exist, so a stranger cannot learn
     * that a particular request is real by being told they may not touch it.
     */
    if (transfer.fromOwnerId !== ctx.user.id) throw new NotFoundError()

    const now = new Date()
    const decidable = canDecideTransfer({
      status: transfer.status,
      expiresAt: transfer.expiresAt,
      now,
    })
    if (!decidable.ok) throw new DomainRuleError(decidable.error.key)

    if (!parsedInput.accept) {
      await db.transaction(async (tx) => {
        const settled = await settleTransfer({
          transferId: transfer.id,
          status: 'REJECTED',
          now,
          executor: tx,
        })
        if (!settled) throw new ConflictError('investigators.errors.transferAlreadyDecided')

        await announceToUser({
          userId: transfer.toOwnerId,
          type: 'INVESTIGATOR_TRANSFER_REJECTED',
          campaignId: transfer.campaignId,
          payload: { investigatorId: transfer.sourceInvestigatorId },
          now,
          executor: tx,
        })

        /*
         * A refusal is a decision about ownership, so it is recorded like one.
         * "She was asked and said no" is exactly the fact somebody needs when
         * the question is asked again.
         */
        await recordAudit(
          {
            actorId: ctx.user.id,
            action: 'investigator.transferRejected',
            entityType: 'investigator',
            entityId: transfer.sourceInvestigatorId,
            metadata: { campaignId: transfer.campaignId, toOwnerId: transfer.toOwnerId },
          },
          tx,
        )
      })

      revalidatePath(`/campaigns/${transfer.campaignId}/investigators`)
      return { ok: true, accepted: false }
    }

    const branchId = await db.transaction(async (tx) => {
      const settled = await settleTransfer({
        transferId: transfer.id,
        status: 'ACCEPTED',
        now,
        executor: tx,
      })
      if (!settled) throw new ConflictError('investigators.errors.transferAlreadyDecided')

      /*
       * The complete state, before anything moves. This is the copy the
       * previous owner is left with, and taking it first means a failure later
       * in the transaction cannot lose it.
       */
      await captureSnapshot({
        investigatorId: transfer.sourceInvestigatorId,
        kind: 'TRANSFER',
        campaignId: transfer.campaignId,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      const branch = await branchInvestigator({
        sourceInvestigatorId: transfer.sourceInvestigatorId,
        newOwnerId: transfer.toOwnerId,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      await redirectToBranch({
        campaignId: transfer.campaignId,
        sourceInvestigatorId: transfer.sourceInvestigatorId,
        branchInvestigatorId: branch,
        newOwnerId: transfer.toOwnerId,
        now,
        executor: tx,
      })

      await attachContinuation({
        transferId: transfer.id,
        continuationInvestigatorId: branch,
        now,
        executor: tx,
      })

      /*
       * No disclosures are captured here, and that is not an oversight. The
       * campaign's binding moves from the source to the branch, which is an
       * exact copy of it at this instant - so nobody who could see the sheet a
       * moment ago can see less of it now. The previous owner loses nothing
       * either: the source stays theirs. Section 15 asks for a capture when
       * access is reduced, and nothing here reduces it.
       */

      await announceToUser({
        userId: transfer.toOwnerId,
        type: 'INVESTIGATOR_TRANSFER_ACCEPTED',
        campaignId: transfer.campaignId,
        payload: {
          investigatorId: branch,
          ...(transfer.investigatorName === null
            ? {}
            : { investigatorName: transfer.investigatorName }),
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.transferAccepted',
          entityType: 'investigator',
          entityId: transfer.sourceInvestigatorId,
          metadata: { campaignId: transfer.campaignId, branchId: branch },
        },
        tx,
      )

      return branch
    })

    revalidatePath(`/campaigns/${transfer.campaignId}/investigators`)
    revalidatePath('/investigators')

    return { ok: true, accepted: true, investigatorId: branchId }
  })

/** Withdraws a request that has not been answered. */
export const cancelInvestigatorTransfer = authActionClient
  .metadata({ name: 'investigator.cancelTransfer' })
  .inputSchema(cancelTransferSchema)
  .action(async ({ parsedInput, ctx }) => {
    const transfer = await findTransfer(parsedInput.transferId)
    const membership = await requireCampaignMember(transfer.campaignId)
    if (membership.membership.role !== 'KEEPER') throw new ForbiddenError()

    const now = new Date()

    await db.transaction(async (tx) => {
      const settled = await settleTransfer({
        transferId: transfer.id,
        status: 'CANCELLED',
        now,
        executor: tx,
      })
      if (!settled) throw new ConflictError('investigators.errors.transferAlreadyDecided')

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.transferCancelled',
          entityType: 'investigator',
          entityId: transfer.sourceInvestigatorId,
          metadata: { campaignId: transfer.campaignId },
        },
        tx,
      )
    })

    revalidatePath(`/campaigns/${transfer.campaignId}/investigators`)

    return { ok: true }
  })
