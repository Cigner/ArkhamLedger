import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, campaignMember, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { Attendance, ParticipantPriority } from '../domain/types'

/**
 * Session participation.
 *
 * The roster is replaced wholesale when a Keeper saves it, because the form
 * expresses a complete intent rather than a series of edits. Rows for people who
 * remain keep their identity, so an answer already given is not discarded by an
 * unrelated change to somebody else's priority.
 */
export type ParticipantRecord = {
  readonly userId: string
  readonly priority: ParticipantPriority
  readonly isKeeper: boolean
  readonly respondedAt: Date | null
}

export async function listParticipantRecords(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<ParticipantRecord[]> {
  return executor
    .select({
      userId: sessionParticipant.userId,
      priority: sessionParticipant.priority,
      isKeeper: sessionParticipant.isKeeper,
      respondedAt: sessionParticipant.respondedAt,
    })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.gameSessionId, sessionId))
}

/** Campaign members eligible to be invited, with their campaign role. */
export async function listEligibleParticipants(
  campaignId: string,
  executor: DbOrTx = db,
): Promise<{ userId: string; name: string; isKeeper: boolean }[]> {
  const rows = await executor
    .select({
      userId: campaignMember.userId,
      name: authUser.name,
      role: campaignMember.role,
    })
    .from(campaignMember)
    .innerJoin(authUser, eq(authUser.id, campaignMember.userId))
    .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.status, 'ACTIVE')))

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    isKeeper: row.role === 'KEEPER',
  }))
}

/**
 * Applies a complete roster.
 *
 * Removals delete their rows, which takes the person's availability with them by
 * cascade - correct, because availability for a session you are not in has no
 * meaning and would otherwise skew the aggregate counts.
 */
export async function replaceParticipants(input: {
  sessionId: string
  participants: readonly { userId: string; priority: ParticipantPriority; isKeeper: boolean }[]
  now: Date
  executor: DbOrTx
}): Promise<void> {
  const existing = await listParticipantRecords(input.sessionId, input.executor)
  const desired = new Map(
    input.participants.map((participant) => [participant.userId, participant]),
  )

  const removed = existing.filter((record) => !desired.has(record.userId))
  if (removed.length > 0) {
    await input.executor.delete(sessionParticipant).where(
      and(
        eq(sessionParticipant.gameSessionId, input.sessionId),
        inArray(
          sessionParticipant.userId,
          removed.map((record) => record.userId),
        ),
      ),
    )
  }

  for (const participant of input.participants) {
    await input.executor
      .insert(sessionParticipant)
      .values({
        id: newId(),
        gameSessionId: input.sessionId,
        userId: participant.userId,
        priority: participant.priority,
        isKeeper: participant.isKeeper,
        respondedAt: null,
        attendance: 'UNKNOWN',
        createdAt: input.now,
        updatedAt: input.now,
      })
      // Keeps respondedAt untouched: changing somebody's priority must not
      // silently discard the availability they already submitted.
      .onDuplicateKeyUpdate({
        set: {
          priority: participant.priority,
          isKeeper: participant.isKeeper,
          updatedAt: input.now,
        },
      })
  }
}

export async function recordAttendance(input: {
  sessionId: string
  attendance: readonly { userId: string; attendance: Attendance }[]
  now: Date
  executor: DbOrTx
}): Promise<void> {
  for (const entry of input.attendance) {
    await input.executor
      .update(sessionParticipant)
      .set({ attendance: entry.attendance, updatedAt: input.now })
      .where(
        and(
          eq(sessionParticipant.gameSessionId, input.sessionId),
          eq(sessionParticipant.userId, entry.userId),
        ),
      )
  }
}

/**
 * Clears every response for a session.
 *
 * Used when collection is reopened over a different search window: answers given
 * for dates that are no longer on offer are worse than no answers, because they
 * look like participation.
 */
export async function clearResponses(
  sessionId: string,
  now: Date,
  executor: DbOrTx,
): Promise<void> {
  await executor
    .update(sessionParticipant)
    .set({ respondedAt: null, updatedAt: now })
    .where(eq(sessionParticipant.gameSessionId, sessionId))
}
