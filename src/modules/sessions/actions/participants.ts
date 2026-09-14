'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { canEditParticipants } from '../domain/lifecycle'
import { countPlayers, normalizeParticipants, validateQuorum } from '../domain/rules'
import { setParticipantsSchema } from '../domain/schemas'
import { requireSessionKeeper } from '../data/guards'
import { findSessionState, setSessionQuorum } from '../data/sessions'
import { listEligibleParticipants, replaceParticipants } from '../data/participants'

/**
 * Sets who is invited and how much their presence matters.
 *
 * The submitted roster is intersected with current campaign membership rather
 * than trusted: the form was rendered at some earlier moment, and somebody may
 * have left the campaign since. Inviting a former member would produce a
 * participant nobody can see or notify.
 */
export const setSessionParticipants = authActionClient
  .metadata({ name: 'session.setParticipants' })
  .inputSchema(setParticipantsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const editable = canEditParticipants(session.status)
    if (!editable.ok) throw new DomainRuleError(editable.error.key)

    const eligible = await listEligibleParticipants(context.campaignId)
    const eligibleById = new Map(eligible.map((member) => [member.userId, member]))

    const selected = parsedInput.participants.flatMap((participant) => {
      const member = eligibleById.get(participant.userId)
      if (!member) return []
      return [
        { userId: participant.userId, priority: participant.priority, isKeeper: member.isKeeper },
      ]
    })

    if (selected.length === 0) throw new DomainRuleError('sessions.errors.noParticipants')

    const normalized = normalizeParticipants(selected)

    if (!normalized.some((participant) => participant.isKeeper)) {
      throw new DomainRuleError('sessions.errors.noKeeperAmongParticipants')
    }

    const quorum = validateQuorum(parsedInput.quorum, countPlayers(normalized))
    if (!quorum.ok) throw new DomainRuleError(quorum.error.key, quorum.error.params)

    const now = new Date()

    await db.transaction(async (tx) => {
      await replaceParticipants({
        sessionId: parsedInput.sessionId,
        participants: normalized,
        now,
        executor: tx,
      })

      await setSessionQuorum(parsedInput.sessionId, parsedInput.quorum, now, tx)

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.participantsChanged',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { count: normalized.length, quorum: parsedInput.quorum },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)

    return { ok: true }
  })
