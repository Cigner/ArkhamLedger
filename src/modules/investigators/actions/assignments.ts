'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { announceToUser } from '@/modules/notifications/data/announce'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { findSessionState } from '@/modules/sessions/data/session-store'
import { canAssignInvestigators } from '@/modules/sessions/domain/lifecycle'
import { canAssignToSession } from '../domain/binding'
import { assignInvestigatorSchema, useSameInvestigatorsSchema } from '../domain/schemas'
import {
  assignInvestigator,
  findPreviousAssignments,
  listAssignmentRows,
} from '../data/assignments'
import { findActiveBinding } from '../data/campaign-bindings'
import { findInvestigatorState } from '../data/investigator-store'

/**
 * Deciding who plays what on the night.
 *
 * The Keeper's job, not the owner's: a character belongs to its player, but
 * which of their characters is at this table is a question about the game being
 * run. The owner is told, because being handed a character for Saturday is
 * something you want to know before Saturday.
 *
 * Every assignment is checked against the character as it stands now rather than
 * as it stood when the page was rendered. A draft that was finished, a character
 * that was unlinked, or one that died in the meantime all change the answer.
 */
export const assignSessionInvestigator = authActionClient
  .metadata({ name: 'session.assignInvestigator' })
  .inputSchema(assignInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const open = canAssignInvestigators(session.status)
    if (!open.ok) throw new DomainRuleError(open.error.key)

    const rows = await listAssignmentRows(parsedInput.sessionId)
    const participant = rows.find((row) => row.participantId === parsedInput.participantId)
    if (!participant) throw new DomainRuleError('investigators.errors.participantNotPlaying')

    const now = new Date()

    if (parsedInput.investigatorId === null) {
      await db.transaction((tx) =>
        assignInvestigator({
          sessionParticipantId: parsedInput.participantId,
          investigatorId: null,
          campaignInvestigatorId: null,
          assignedBy: ctx.user.id,
          now,
          executor: tx,
        }),
      )

      revalidatePath(`/sessions/${parsedInput.sessionId}`)
      return { ok: true, assigned: false }
    }

    const investigator = await findInvestigatorState(parsedInput.investigatorId)
    if (investigator.ownerId !== participant.userId) {
      throw new DomainRuleError('investigators.errors.notTheirCharacter')
    }

    const binding = await findActiveBinding({
      investigatorId: parsedInput.investigatorId,
      campaignId: session.campaignId,
    })

    const allowed = canAssignToSession({
      status: investigator.status,
      archivedAt: investigator.archivedAt,
      linkedToCampaign: binding !== null,
    })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key, allowed.error.params)
    if (!binding) throw new DomainRuleError('investigators.errors.notInCampaign')

    const investigatorId = parsedInput.investigatorId

    await db.transaction(async (tx) => {
      await assignInvestigator({
        sessionParticipantId: parsedInput.participantId,
        investigatorId,
        campaignInvestigatorId: binding.id,
        assignedBy: ctx.user.id,
        now,
        executor: tx,
      })

      if (participant.userId !== ctx.user.id) {
        await announceToUser({
          userId: participant.userId,
          type: 'SESSION_ASSIGNMENT_CHANGED',
          campaignId: session.campaignId,
          gameSessionId: parsedInput.sessionId,
          payload: { investigatorId },
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.investigatorAssigned',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { participantId: parsedInput.participantId },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true, assigned: true }
  })

/**
 * Carries last time's characters forward.
 *
 * The overwhelmingly common case: the same people playing the same characters
 * next week. Copying is deliberately partial and reports what it skipped -
 * somebody new at the table, a character that has since left the campaign, or
 * one that died - because a silent partial copy is how a Keeper discovers on the
 * night that two people have no sheet.
 */
export const useSameInvestigators = authActionClient
  .metadata({ name: 'session.useSameInvestigators' })
  .inputSchema(useSameInvestigatorsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const open = canAssignInvestigators(session.status)
    if (!open.ok) throw new DomainRuleError(open.error.key)

    const previous = await findPreviousAssignments({
      campaignId: session.campaignId,
      exceptSessionId: parsedInput.sessionId,
    })
    if (!previous) throw new DomainRuleError('investigators.errors.noPreviousSession')

    const rows = await listAssignmentRows(parsedInput.sessionId)
    const now = new Date()

    const copied: string[] = []
    const skipped: { name: string; reason: string }[] = []

    await db.transaction(async (tx) => {
      for (const participant of rows) {
        const investigatorId = previous.byUserId.get(participant.userId)
        if (!investigatorId) {
          skipped.push({ name: participant.name, reason: 'notInPreviousSession' })
          continue
        }

        const investigator = await findInvestigatorState(investigatorId, tx)
        const binding = await findActiveBinding({
          investigatorId,
          campaignId: session.campaignId,
          executor: tx,
        })

        const allowed = canAssignToSession({
          status: investigator.status,
          archivedAt: investigator.archivedAt,
          linkedToCampaign: binding !== null,
        })
        if (!allowed.ok || !binding) {
          skipped.push({
            name: participant.name,
            reason: allowed.ok ? 'notInCampaign' : 'unavailable',
          })
          continue
        }

        await assignInvestigator({
          sessionParticipantId: participant.participantId,
          investigatorId,
          campaignInvestigatorId: binding.id,
          assignedBy: ctx.user.id,
          now,
          executor: tx,
        })

        copied.push(participant.name)
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.investigatorsCopied',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { from: previous.sessionId, copied: copied.length, skipped: skipped.length },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true, from: previous.title, copied, skipped }
  })
