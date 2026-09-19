'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeOptionalText } from '@/lib/text/sanitize'
import {
  canArchive,
  canPermanentlyDeleteInvestigator,
  canRestore,
  transitionInvestigator,
} from '../domain/lifecycle'
import {
  archiveInvestigatorSchema,
  changeStatusSchema,
  deleteInvestigatorSchema,
} from '../domain/schemas'
import { requireInvestigatorAccess } from '../data/guards'
import {
  countDeletionBlockers,
  deleteInvestigator,
  findInvestigatorState,
  setArchived,
  setInvestigatorStatus,
} from '../data/investigator-store'

/**
 * What becomes of a character.
 *
 * Retiring, dying and being put away are the endings this game actually
 * produces, and until now a character could only ever be created. A sheet that
 * cannot record a death is a sheet that quietly pretends the campaign is going
 * well.
 *
 * None of these destroy anything. Deletion exists only for a draft nobody has
 * seen - once a character has been in a campaign, played, snapshotted or shown
 * to somebody, what is left is archival, because everything else would be taking
 * a record from somebody who was there.
 */
export const changeInvestigatorStatus = authActionClient
  .metadata({ name: 'investigator.changeStatus' })
  .inputSchema(changeStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)

    const transition = transitionInvestigator(state.status, parsedInput.status)
    if (!transition.ok) throw new DomainRuleError(transition.error.key, transition.error.params)

    const now = new Date()
    const reason = sanitizeOptionalText(parsedInput.reason, { maxLength: 500 })

    await db.transaction(async (tx) => {
      const moved = await setInvestigatorStatus({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        status: parsedInput.status,
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('investigators.errors.sheetMovedOn')

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.statusChanged',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { from: state.status, to: parsedInput.status, ...(reason ? { reason } : {}) },
        },
        tx,
      )
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)
    revalidatePath('/investigators')

    return { ok: true, status: parsedInput.status }
  })

/**
 * Puts a character away, or brings it back.
 *
 * No version claim: archiving is not a change to the sheet, and two people
 * archiving the same character are agreeing rather than competing. The dead stay
 * archived, which is the one restriction on coming back out.
 */
export const archiveInvestigator = authActionClient
  .metadata({ name: 'investigator.archive' })
  .inputSchema(archiveInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)

    const allowed = parsedInput.archived
      ? canArchive({ archivedAt: state.archivedAt })
      : canRestore({ archivedAt: state.archivedAt, status: state.status })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      await setArchived({
        investigatorId: parsedInput.investigatorId,
        archivedAt: parsedInput.archived ? now : null,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: parsedInput.archived ? 'investigator.archived' : 'investigator.restored',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { status: state.status },
        },
        tx,
      )
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)
    revalidatePath('/investigators')

    return { ok: true, archived: parsedInput.archived }
  })

/**
 * Deletes a draft nobody has seen.
 *
 * Paranoid on purpose: the blockers are counted rather than assumed, and each
 * of them is somebody else's record. A character that has been in a campaign is
 * archived instead, and the refusal says which of the four reasons applied so
 * nobody has to guess.
 */
export const deleteDraftInvestigator = authActionClient
  .metadata({ name: 'investigator.delete' })
  .inputSchema(deleteInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    if (context.role !== 'OWNER') throw new DomainRuleError('investigators.errors.notYours')

    const state = await findInvestigatorState(parsedInput.investigatorId)
    const blockers = await countDeletionBlockers(parsedInput.investigatorId)

    const deletable = canPermanentlyDeleteInvestigator({
      status: state.status,
      hasBeenShared: blockers.campaigns > 0 || blockers.disclosures > 0,
      hasBeenUsed: blockers.assignments > 0 || blockers.snapshots > 0,
    })

    if (!deletable) {
      throw new DomainRuleError('investigators.errors.deleteBlocked', {
        campaigns: blockers.campaigns,
        sessions: blockers.assignments,
      })
    }

    await db.transaction(async (tx) => {
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.deleted',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { status: state.status },
        },
        tx,
      )

      await deleteInvestigator({ investigatorId: parsedInput.investigatorId, executor: tx })
    })

    revalidatePath('/investigators')

    return { ok: true }
  })
