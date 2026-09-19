'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { localHourToInstant } from '@/lib/datetime/slots'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { requireKeeper } from '@/modules/campaigns/data/guards'
import { findCampaignState } from '@/modules/campaigns/data/campaigns'
import { canModifyContent } from '@/modules/campaigns/domain/rules'
import { deleteAllAvailability } from '@/modules/availability/data/availability'
import { announceToSession, announceToUser } from '@/modules/notifications/data/announce'
import {
  listAssignedInvestigators,
  listSessionAssignments,
  recordAssignmentSnapshot,
} from '@/modules/investigators/data/assignments'
import { findLiveSessionFor } from '@/modules/investigators/data/campaign-bindings'
import { canPlayConcurrently } from '@/modules/investigators/domain/binding'
import { closeEditGrants } from '@/modules/investigators/data/grants'
import { markFirstUse } from '@/modules/investigators/data/investigator-store'
import { captureSnapshot } from '@/modules/investigators/data/snapshots'
import { defaultQuorum } from '../domain/constants'
import {
  canEditDefinition,
  canRecordAttendance,
  canSetDate,
  canStartSession,
  canTransition,
  editInvalidatesAnswers,
} from '../domain/lifecycle'
import {
  canPublish,
  countPlayers,
  normalizeParticipants,
  validateDeadline,
  validateGridBounds,
  validateInvestigatorAssignments,
  validateQuorum,
  validateSearchWindow,
} from '../domain/rules'
import {
  cancelSessionSchema,
  completeSessionSchema,
  createSessionSchema,
  reopenCollectionSchema,
  sessionIdSchema,
  setSessionDateSchema,
  updateSessionSchema,
} from '../domain/schemas'
import { requireSessionKeeper } from '../data/guards'
import {
  findSessionState,
  insertSession,
  transitionSession,
  updateSessionDefinition,
} from '../data/session-store'
import {
  clearResponses,
  listEligibleParticipants,
  listParticipantRecords,
  listPlayingParticipants,
  recordAttendance,
  replaceParticipants,
} from '../data/participants'

/**
 * Session lifecycle actions.
 *
 * Every transition goes through transitionSession, whose WHERE clause names the
 * status it is moving from. Two Keepers acting at once therefore cannot both
 * apply a transition from the same starting point - the second finds no row and
 * is told the session moved on, rather than silently overwriting the first.
 */
/**
 * The instant a deadline day ends.
 *
 * Hour 24 is midnight opening the next day, which is what "answers close on the
 * fourth" means to the person who typed the fourth. Storing an instant rather
 * than a date keeps the comparison the worker makes unambiguous across the two
 * nights a year when a local day is not 24 hours long.
 */
function deadlineFrom(value: string | undefined, timezone: string): Date | null {
  if (!value) return null
  return localHourToInstant(value, 24, timezone)
}

export const createSession = authActionClient
  .metadata({ name: 'session.create' })
  .inputSchema(createSessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireKeeper(parsedInput.campaignId)

    const modifiable = canModifyContent(context.status)
    if (!modifiable.ok) throw new DomainRuleError(modifiable.error.key)

    // The session inherits the campaign's zone rather than the Keeper's: every
    // member must read the same grid, whichever clock they happen to be near.
    const campaignState = await findCampaignState(parsedInput.campaignId)

    const window = validateSearchWindow(parsedInput.searchWindowStart, parsedInput.searchWindowEnd)
    if (!window.ok) throw new DomainRuleError(window.error.key, window.error.params)

    const grid = validateGridBounds(
      parsedInput.gridStartHour,
      parsedInput.gridEndHour,
      parsedInput.minSessionHours,
    )
    if (!grid.ok) throw new DomainRuleError(grid.error.key, grid.error.params)

    const eligible = await listEligibleParticipants(parsedInput.campaignId)
    const investigators = eligible.filter((member) => !member.isKeeper).length
    const now = new Date()

    // A new session invites the whole campaign by default; the Keeper narrows it
    // afterwards. Starting from nobody would make the common case the long one.
    const { sessionId } = await db.transaction(async (tx) => {
      const created = await insertSession({
        campaignId: parsedInput.campaignId,
        title: parsedInput.title,
        description: parsedInput.description ?? null,
        searchWindowStart: parsedInput.searchWindowStart,
        searchWindowEnd: parsedInput.searchWindowEnd,
        gridStartHour: parsedInput.gridStartHour,
        gridEndHour: parsedInput.gridEndHour,
        minSessionHours: parsedInput.minSessionHours,
        quorum: defaultQuorum(investigators),
        availabilityDeadline: null,
        timezone: campaignState.timezone,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      await replaceParticipants({
        sessionId: created.sessionId,
        participants: normalizeParticipants(
          eligible.map((member) => ({
            userId: member.userId,
            priority: member.isKeeper ? 'REQUIRED' : 'PREFERRED',
            isKeeper: member.isKeeper,
          })),
        ),
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.created',
          entityType: 'session',
          entityId: created.sessionId,
          metadata: { campaignId: parsedInput.campaignId, title: parsedInput.title },
        },
        tx,
      )

      return created
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/sessions`)

    return { sessionId }
  })

export const updateSession = authActionClient
  .metadata({ name: 'session.update' })
  .inputSchema(updateSessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)

    const editable = canEditDefinition(context.sessionStatus)
    if (!editable.ok) throw new DomainRuleError(editable.error.key)

    const window = validateSearchWindow(parsedInput.searchWindowStart, parsedInput.searchWindowEnd)
    if (!window.ok) throw new DomainRuleError(window.error.key, window.error.params)

    const grid = validateGridBounds(
      parsedInput.gridStartHour,
      parsedInput.gridEndHour,
      parsedInput.minSessionHours,
    )
    if (!grid.ok) throw new DomainRuleError(grid.error.key, grid.error.params)

    const participants = await listParticipantRecords(parsedInput.sessionId)
    const quorum = validateQuorum(parsedInput.quorum, countPlayers(participants))
    if (!quorum.ok) throw new DomainRuleError(quorum.error.key, quorum.error.params)

    const before = await findSessionState(parsedInput.sessionId)
    const now = new Date()
    const deadline = deadlineFrom(parsedInput.availabilityDeadline, context.timezone)

    const deadlineCheck = validateDeadline(deadline, parsedInput.searchWindowStart, now)
    if (!deadlineCheck.ok) throw new DomainRuleError(deadlineCheck.error.key)

    await db.transaction(async (tx) => {
      await updateSessionDefinition({
        sessionId: parsedInput.sessionId,
        title: parsedInput.title,
        description: parsedInput.description ?? null,
        searchWindowStart: parsedInput.searchWindowStart,
        searchWindowEnd: parsedInput.searchWindowEnd,
        gridStartHour: parsedInput.gridStartHour,
        gridEndHour: parsedInput.gridEndHour,
        minSessionHours: parsedInput.minSessionHours,
        quorum: parsedInput.quorum,
        availabilityDeadline: deadline,
        now,
        executor: tx,
      })

      /*
       * Answers describe the question they were asked. Move the dates or the
       * hours and they describe a question nobody asked, so they go - and the
       * form warns before it gets here, because this is not recoverable.
       */
      if (context.sessionStatus === 'COLLECTING' && editInvalidatesAnswers(before, parsedInput)) {
        await clearResponses(parsedInput.sessionId, now, tx)
        await deleteAllAvailability(parsedInput.sessionId, tx)
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.updated',
          entityType: 'session',
          entityId: parsedInput.sessionId,
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)

    return { ok: true }
  })

/**
 * Opens a session for availability.
 *
 * The point of no return for the definition: once people are asked, changing the
 * window or the grid would invalidate what they answered.
 */
export const publishSession = authActionClient
  .metadata({ name: 'session.publish' })
  .inputSchema(sessionIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)
    const participants = await listParticipantRecords(parsedInput.sessionId)

    const now = new Date()

    const allowed = canPublish({
      status: session.status,
      participants,
      quorum: session.quorum,
      windowStart: session.searchWindowStart,
      windowEnd: session.searchWindowEnd,
      deadline: session.availabilityDeadline,
      now,
    })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key, allowed.error.params)

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: 'DRAFT',
        to: 'COLLECTING',
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await announceToSession({
        sessionId: parsedInput.sessionId,
        type: 'AVAILABILITY_REQUESTED',
        payload: session.availabilityDeadline
          ? { deadlineUtc: session.availabilityDeadline.toISOString() }
          : {},
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.published',
          entityType: 'session',
          entityId: parsedInput.sessionId,
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })

/**
 * Sets a date by hand, from any status that allows it.
 *
 * The warning path matters more than the happy one: a Keeper who picks a date
 * somebody said no to is told who, and has to acknowledge it. Refusing outright
 * would be wrong - they may know something the grid does not.
 */
export const setSessionDate = authActionClient
  .metadata({ name: 'session.setDate' })
  .inputSchema(setSessionDateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const allowed = canSetDate(session.status)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    if (parsedInput.endHour <= parsedInput.startHour) {
      throw new DomainRuleError('sessions.errors.endBeforeStart')
    }

    const now = new Date()
    const startUtc = localHourToInstant(parsedInput.date, parsedInput.startHour, context.timezone)
    const endUtc = localHourToInstant(parsedInput.date, parsedInput.endHour, context.timezone)

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: session.status,
        to: 'SCHEDULED',
        patch: {
          confirmedStartUtc: startUtc,
          confirmedEndUtc: endUtc,
          // The date is the Keeper's own now, not one the search proposed.
          acceptedProposalId: null,
          setManually: true,
          cancelledReason: null,
        },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await announceToSession({
        sessionId: parsedInput.sessionId,
        // A session that already had a date has moved; one that did not is new.
        type: session.status === 'SCHEDULED' ? 'SESSION_RESCHEDULED' : 'SESSION_SCHEDULED',
        payload: {
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.scheduledManually',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { date: parsedInput.date, startHour: parsedInput.startHour },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })

/**
 * Returns a session to collection.
 *
 * Responses are cleared: answers given for a window that has changed look like
 * participation while meaning nothing, which is worse than no answers at all.
 */
export const reopenCollection = authActionClient
  .metadata({ name: 'session.reopenCollection' })
  .inputSchema(reopenCollectionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const transition = canTransition(session.status, 'COLLECTING')
    if (!transition.ok) throw new DomainRuleError(transition.error.key)

    const now = new Date()
    const deadline = deadlineFrom(parsedInput.availabilityDeadline, context.timezone)

    const deadlineCheck = validateDeadline(deadline, session.searchWindowStart, now)
    if (!deadlineCheck.ok) throw new DomainRuleError(deadlineCheck.error.key)

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: session.status,
        to: 'COLLECTING',
        patch: {
          availabilityDeadline: deadline,
          confirmedStartUtc: null,
          confirmedEndUtc: null,
          acceptedProposalId: null,
          setManually: false,
        },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await clearResponses(parsedInput.sessionId, now, tx)
      await deleteAllAvailability(parsedInput.sessionId, tx)

      await announceToSession({
        sessionId: parsedInput.sessionId,
        type: 'AVAILABILITY_REQUESTED',
        payload: deadline ? { deadlineUtc: deadline.toISOString() } : {},
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.collectionReopened',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { from: session.status },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)

    return { ok: true }
  })

/**
 * Stops asking for availability without choosing a date yet.
 *
 * The half-step between collecting and scheduled: answers are closed, the
 * Keeper is deciding. Separate from running a search, because looking at the
 * state of play should never be what locks everybody else out of answering.
 */
export const closeCollection = authActionClient
  .metadata({ name: 'session.closeCollection' })
  .inputSchema(sessionIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const transition = canTransition(session.status, 'PROPOSED')
    if (!transition.ok) throw new DomainRuleError(transition.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: session.status,
        to: 'PROPOSED',
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.collectionClosed',
          entityType: 'session',
          entityId: parsedInput.sessionId,
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })

export const cancelSession = authActionClient
  .metadata({ name: 'session.cancel' })
  .inputSchema(cancelSessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const transition = canTransition(session.status, 'CANCELLED')
    if (!transition.ok) throw new DomainRuleError(transition.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: session.status,
        to: 'CANCELLED',
        patch: { cancelledReason: parsedInput.reason },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await announceToSession({
        sessionId: parsedInput.sessionId,
        type: 'SESSION_CANCELLED',
        payload: { reason: parsedInput.reason },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.cancelled',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { from: session.status },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })

/**
 * Starts a session.
 *
 * The evening begins here rather than at the confirmed hour, because what makes
 * a session live is the Keeper saying so - people arrive late, and a clock that
 * starts on its own would freeze sheets nobody has opened yet.
 *
 * One transaction does five things that must not come apart: it refuses to start
 * while somebody playing a character has not been given one, archives each sheet
 * as it stands, records that those characters have now been played, closes the
 * creating Keeper's right to edit them, and moves the session. A snapshot
 * written outside this would describe a session that never started; a grant left
 * open would let a Keeper keep editing a sheet that has been played.
 */
export const startSession = authActionClient
  .metadata({ name: 'session.start' })
  .inputSchema(sessionIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const allowed = canStartSession(session.status)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      const roster = await listPlayingParticipants(parsedInput.sessionId, tx)
      const assignments = await listSessionAssignments(parsedInput.sessionId, tx)

      const ready = validateInvestigatorAssignments(
        roster.map((participant) => ({
          userId: participant.userId,
          name: participant.name,
          playsInvestigator: participant.playsInvestigator,
          investigatorId: assignments.get(participant.userId) ?? null,
        })),
      )
      if (!ready.ok) throw new DomainRuleError(ready.error.key, ready.error.params)

      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: 'SCHEDULED',
        to: 'IN_PROGRESS',
        patch: { startedAt: now },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      const played = await listAssignedInvestigators(parsedInput.sessionId, tx)

      for (const character of played) {
        if (character.campaignId !== context.campaignId) {
          throw new DomainRuleError('sessions.errors.investigatorNotInCampaign')
        }
        if (character.ownerId !== character.playerId) {
          throw new DomainRuleError('sessions.errors.investigatorNotOwnedByPlayer')
        }

        /*
         * One sheet cannot be at two tables at once. Checked at the moment play
         * begins rather than when the date is set, because two scheduled games
         * with the same character are a plan and plans change.
         */
        const live = await findLiveSessionFor({
          investigatorId: character.investigatorId,
          exceptSessionId: parsedInput.sessionId,
          executor: tx,
        })
        const free = canPlayConcurrently({ liveSessionTitle: live?.title ?? null })
        if (!free.ok) throw new DomainRuleError(free.error.key, free.error.params)

        const snapshotId = await captureSnapshot({
          investigatorId: character.investigatorId,
          kind: 'SESSION_START',
          campaignId: context.campaignId,
          gameSessionId: parsedInput.sessionId,
          createdBy: ctx.user.id,
          now,
          executor: tx,
        })

        await recordAssignmentSnapshot({
          sessionId: parsedInput.sessionId,
          investigatorId: character.investigatorId,
          snapshotId,
          moment: 'START',
          now,
          executor: tx,
        })

        const first = await markFirstUse({
          investigatorId: character.investigatorId,
          now,
          executor: tx,
        })

        if (first) {
          const closed = await closeEditGrants({
            investigatorId: character.investigatorId,
            reason: 'FIRST_USE',
            now,
            executor: tx,
          })

          /*
           * Recorded per character rather than counted in the session's own
           * entry. Section 22 asks for permission changes to be audited, and
           * "one grant closed somewhere tonight" does not say whose right to
           * edit which sheet has just ended.
           */
          for (const keeperId of closed.keeperIds) {
            await recordAudit(
              {
                actorId: ctx.user.id,
                action: 'investigator.editGrantClosed',
                entityType: 'investigator',
                entityId: character.investigatorId,
                metadata: { keeperId, reason: 'FIRST_USE', sessionId: parsedInput.sessionId },
              },
              tx,
            )
          }

          /*
           * Section 21 asks for this one by name, and it goes to the owner: the
           * sheet becoming theirs alone is the change, and the Keeper asked for
           * the grant to end by starting the session. Once per character rather
           * than once per grant - two Keepers finishing their editing is still
           * one thing that happened to one sheet.
           */
          if (closed.keeperIds.length > 0) {
            await announceToUser({
              userId: character.ownerId,
              type: 'INVESTIGATOR_EDIT_GRANT_CLOSED',
              campaignId: context.campaignId,
              gameSessionId: parsedInput.sessionId,
              payload: { investigatorId: character.investigatorId },
              now,
              executor: tx,
            })
          }
        }
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.started',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: { investigators: assignments.size },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })

/**
 * Closes a session and records who was there.
 *
 * Attendance is the input, not a side effect: completing a session is the moment
 * the Keeper knows it, and asking later never happens.
 */
export const completeSession = authActionClient
  .metadata({ name: 'session.complete' })
  .inputSchema(completeSessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionKeeper(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const allowed = canRecordAttendance(session.status)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    await db.transaction(async (tx) => {
      const moved = await transitionSession({
        sessionId: parsedInput.sessionId,
        from: 'IN_PROGRESS',
        to: 'COMPLETED',
        patch: { endedAt: now },
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('sessions.errors.sessionMovedOn')

      await recordAttendance({
        sessionId: parsedInput.sessionId,
        attendance: parsedInput.attendance,
        now,
        executor: tx,
      })

      /*
       * The closing half of the pair. Comparing an evening's start and end is
       * what makes "what happened to us tonight" answerable, and it has to be
       * captured here because the sheets carry on changing afterwards.
       */
      for (const character of await listAssignedInvestigators(parsedInput.sessionId, tx)) {
        const snapshotId = await captureSnapshot({
          investigatorId: character.investigatorId,
          kind: 'SESSION_END',
          campaignId: context.campaignId,
          gameSessionId: parsedInput.sessionId,
          createdBy: ctx.user.id,
          now,
          executor: tx,
        })

        await recordAssignmentSnapshot({
          sessionId: parsedInput.sessionId,
          investigatorId: character.investigatorId,
          snapshotId,
          moment: 'END',
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'session.completed',
          entityType: 'session',
          entityId: parsedInput.sessionId,
          metadata: {
            attended: parsedInput.attendance.filter((a) => a.attendance === 'ATTENDED').length,
          },
        },
        tx,
      )
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { ok: true }
  })
