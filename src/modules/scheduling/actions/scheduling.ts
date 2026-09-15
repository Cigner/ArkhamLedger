'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError, RateLimitError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { consumeAttempt } from '@/lib/throttle'
import { announceToSession } from '@/modules/notifications/data/announce'
import { requireSessionKeeper } from '@/modules/sessions/data/guards'
import { findSessionState, transitionSession } from '@/modules/sessions/data/session-store'
import { canSetDate } from '@/modules/sessions/domain/lifecycle'
import { rankCandidates } from '../domain/algorithm'
import { acceptProposalSchema, runSchedulingSchema } from '../domain/schemas'
import { findAcceptableProposal, insertRun, loadSchedulingInput } from '../data/runs'

/**
 * Searching for a date, and confirming one.
 *
 * Searching deliberately does not change the session's status. A Keeper looking
 * at the state of play halfway through the week would otherwise close
 * collection by looking at it, and everybody who had not answered yet would find
 * the grid locked with no explanation.
 *
 * Confirming is the moment that matters, so it is the moment that transitions -
 * and it does so from whichever status the session is in, because a Keeper who
 * has seen enough should not have to close collection first as a ceremony.
 */
export const runScheduling = authActionClient
  .metadata({ name: 'scheduling.run' })
  .inputSchema(runSchedulingSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    if (session.status !== 'COLLECTING' && session.status !== 'PROPOSED') {
      throw new DomainRuleError('scheduling.errors.notSearchable')
    }

    /*
     * Keyed by session rather than by user: the cost is reading one session's
     * answers, so two Keepers taking turns on the button is the same load as one
     * doing it twice.
     */
    const decision = await consumeAttempt('schedule', parsedInput.sessionId)
    if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds)

    const { input, params } = await loadSchedulingInput(parsedInput.sessionId)
    const output = rankCandidates(input)
    const now = new Date()

    const { runId } = await db.transaction(async (tx) => {
      const created = await insertRun({
        sessionId: parsedInput.sessionId,
        output,
        params,
        triggeredBy: ctx.user.id,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'scheduling.ran',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: {
            runId: created.runId,
            proposals: output.ranked.length,
            algorithmVersion: output.algorithmVersion,
          },
        },
        tx,
      )

      return created
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}/scheduling`)

    return {
      runId,
      proposalCount: output.ranked.length,
      campaignId: context.campaignId,
    }
  })

/**
 * Confirms one of the proposed windows.
 *
 * Only a proposal from the most recent search may be accepted. Answers change,
 * and a Keeper clicking a card from a list generated an hour ago would otherwise
 * confirm a date the current answers no longer support - without anything on
 * screen having said so.
 */
export const acceptProposal = authActionClient
  .metadata({ name: 'scheduling.acceptProposal' })
  .inputSchema(acceptProposalSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const allowed = canSetDate(session.status)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      const proposal = await findAcceptableProposal({
        sessionId: parsedInput.sessionId,
        proposalId: parsedInput.proposalId,
        executor: tx,
      })
      if (!proposal) throw new DomainRuleError('scheduling.errors.proposalStale')

      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: session.status,
        to: 'SCHEDULED',
        patch: {
          confirmedStartUtc: proposal.startUtc,
          confirmedEndUtc: proposal.endUtc,
          acceptedProposalId: parsedInput.proposalId,
          setManually: false,
          cancelledReason: null,
        },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await announceToSession({
        sessionId: parsedInput.sessionId,
        type: session.status === 'SCHEDULED' ? 'SESSION_RESCHEDULED' : 'SESSION_SCHEDULED',
        payload: {
          startUtc: proposal.startUtc.toISOString(),
          endUtc: proposal.endUtc.toISOString(),
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'scheduling.proposalAccepted',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { proposalId: parsedInput.proposalId, rank: proposal.rank },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })
