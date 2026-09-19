import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorProfile,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'

/**
 * Session assignments, without a viewer.
 *
 * Which Investigator each participant is playing is a fact about the session
 * rather than about the character sheet, so it carries no privacy of its own and
 * nothing here redacts. Reads that expose sheet contents live beside the
 * authorization they need; this one only answers "is anybody missing".
 *
 * Unguarded on purpose: the callers are session actions that have already proved
 * the caller is the Keeper, and the same read will serve the worker.
 */
export async function listSessionAssignments(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<Map<string, string>> {
  const rows = await executor
    .select({
      userId: sessionParticipant.userId,
      investigatorId: sessionInvestigatorAssignment.investigatorId,
    })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  return new Map(rows.map((row) => [row.userId, row.investigatorId]))
}

/**
 * Every character a session is about to be played with.
 *
 * Carries the owner and the campaign binding, because starting a session has to
 * check both: a character may only be played by the person it belongs to, and
 * only in a campaign it is still linked to.
 */
export async function listAssignedInvestigators(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<{ investigatorId: string; ownerId: string; playerId: string; campaignId: string }[]> {
  return executor
    .select({
      investigatorId: sessionInvestigatorAssignment.investigatorId,
      ownerId: investigator.ownerId,
      playerId: sessionParticipant.userId,
      campaignId: campaignInvestigator.campaignId,
    })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .innerJoin(investigator, eq(investigator.id, sessionInvestigatorAssignment.investigatorId))
    .innerJoin(
      campaignInvestigator,
      eq(campaignInvestigator.id, sessionInvestigatorAssignment.campaignInvestigatorId),
    )
    .where(eq(sessionParticipant.gameSessionId, sessionId))
}

/**
 * Points an assignment at the version of the sheet that was played.
 *
 * Written after the snapshot exists, in the same transaction. Without it the
 * link between "who played this character" and "what the character was that
 * evening" would be a query over kind and session, which is a convention rather
 * than a guarantee - and a second snapshot of the same kind would quietly make
 * it ambiguous.
 */
export async function recordAssignmentSnapshot(input: {
  sessionId: string
  investigatorId: string
  snapshotId: string
  moment: 'START' | 'END'
  now: Date
  executor: DbOrTx
}): Promise<void> {
  const participants = await input.executor
    .select({ id: sessionInvestigatorAssignment.id })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .where(
      and(
        eq(sessionParticipant.gameSessionId, input.sessionId),
        eq(sessionInvestigatorAssignment.investigatorId, input.investigatorId),
      ),
    )

  if (participants.length === 0) return

  const patch =
    input.moment === 'START'
      ? { startSnapshotId: input.snapshotId, updatedAt: input.now }
      : { endSnapshotId: input.snapshotId, updatedAt: input.now }

  await input.executor
    .update(sessionInvestigatorAssignment)
    .set(patch)
    .where(
      inArray(
        sessionInvestigatorAssignment.id,
        participants.map((row) => row.id),
      ),
    )
}

/**
 * Who is playing what, as the assignment screen needs it.
 *
 * One row per participant who brings a character, whether or not they have been
 * given one: the Keeper's question is "who is still missing", and a list of
 * only the answered ones cannot show it.
 */
export type AssignmentRow = {
  readonly participantId: string
  readonly userId: string
  readonly name: string
  readonly isKeeper: boolean
  readonly investigatorId: string | null
  readonly investigatorName: string | null
}

export async function listAssignmentRows(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<AssignmentRow[]> {
  const rows = await executor
    .select({
      participantId: sessionParticipant.id,
      userId: sessionParticipant.userId,
      name: authUser.name,
      isKeeper: sessionParticipant.isKeeper,
      playsInvestigator: sessionParticipant.playsInvestigator,
      investigatorId: sessionInvestigatorAssignment.investigatorId,
      investigatorName: investigatorProfile.name,
    })
    .from(sessionParticipant)
    .innerJoin(authUser, eq(authUser.id, sessionParticipant.userId))
    .leftJoin(
      sessionInvestigatorAssignment,
      eq(sessionInvestigatorAssignment.sessionParticipantId, sessionParticipant.id),
    )
    .leftJoin(
      investigatorProfile,
      eq(investigatorProfile.investigatorId, sessionInvestigatorAssignment.investigatorId),
    )
    .where(eq(sessionParticipant.gameSessionId, sessionId))
    .orderBy(asc(authUser.name))

  return rows
    .filter((row) => row.playsInvestigator)
    .map((row) => ({
      participantId: row.participantId,
      userId: row.userId,
      name: row.name,
      isKeeper: row.isKeeper,
      investigatorId: row.investigatorId,
      investigatorName: row.investigatorName,
    }))
}

/**
 * Sets the character one participant is playing.
 *
 * One assignment per participant, enforced by a unique index, so this replaces
 * rather than accumulates. Passing no character clears it, which is how somebody
 * who changed their mind gets back to undecided.
 */
export async function assignInvestigator(input: {
  sessionParticipantId: string
  investigatorId: string | null
  campaignInvestigatorId: string | null
  assignedBy: string
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .delete(sessionInvestigatorAssignment)
    .where(eq(sessionInvestigatorAssignment.sessionParticipantId, input.sessionParticipantId))

  if (input.investigatorId === null || input.campaignInvestigatorId === null) return

  await input.executor.insert(sessionInvestigatorAssignment).values({
    id: newId(),
    sessionParticipantId: input.sessionParticipantId,
    investigatorId: input.investigatorId,
    campaignInvestigatorId: input.campaignInvestigatorId,
    assignedBy: input.assignedBy,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

/**
 * The characters played in this campaign's most recently started session.
 *
 * "Most recently started" rather than "most recent": a session that was
 * scheduled and never played says nothing about who was at the table, and
 * copying from it would carry forward a plan instead of a fact.
 */
export async function findPreviousAssignments(input: {
  campaignId: string
  exceptSessionId: string
  executor?: DbOrTx
}): Promise<{ sessionId: string; title: string; byUserId: Map<string, string> } | null> {
  const executor = input.executor ?? db

  const previous = await executor
    .select({ id: gameSession.id, title: gameSession.title, startedAt: gameSession.startedAt })
    .from(gameSession)
    .where(
      and(
        eq(gameSession.campaignId, input.campaignId),
        isNotNull(gameSession.startedAt),
        ne(gameSession.id, input.exceptSessionId),
      ),
    )
    .orderBy(desc(gameSession.startedAt))
    .limit(1)
    .then((rows) => rows[0])

  if (!previous) return null

  const assignments = await listSessionAssignments(previous.id, executor)

  return { sessionId: previous.id, title: previous.title, byUserId: assignments }
}
