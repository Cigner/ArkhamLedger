'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { localDateTimeToInstant, localHourToInstant } from '@/lib/datetime/slots'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { requireKeeper } from '@/modules/campaigns/data/guards'
import { findCampaignState } from '@/modules/campaigns/data/campaigns'
import { canModifyContent } from '@/modules/campaigns/domain/rules'
import { announceToSession } from '@/modules/notifications/data/announce'
import { defaultQuorum } from '../domain/constants'
import {
  canEditDefinition,
  canRecordAttendance,
  canSetDate,
  canTransition,
} from '../domain/lifecycle'
import {
  canPublish,
  countPlayers,
  normalizeParticipants,
  validateDeadline,
  validateGridBounds,
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
  recordAttendance,
  replaceParticipants,
} from '../data/participants'

/**
 * Session lifecycle actions.
 *
 * Every transition goes through transitionSession, whose WHERE clause names the
 * status it is moving from. Two Keepers acting at once therefore cannot both
 * apply a transition from the same starting point — the second finds no row and
 * is told the session moved on, rather than silently overwriting the first.
 */
function deadlineFrom(value: string | undefined, timezone: string): Date | null {
  if (!value) return null
  return localDateTimeToInstant(value, timezone)
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
 * would be wrong — they may know something the grid does not.
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
        from: 'SCHEDULED',
        to: 'COMPLETED',
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
