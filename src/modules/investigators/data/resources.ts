import 'server-only'
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, investigatorResourceEvent, investigatorState } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { Conditions, ResourceKind } from '../domain/resources'

/**
 * Hit points, Sanity, magic points and Luck.
 *
 * Every change is an event with what it was, what it became, who did it and
 * why. That is not an audit trail for its own sake: it is what makes a mistyped
 * number reversible at the table, what lets a session say what it cost, and what
 * the pre-session and post-session comparison is built from.
 *
 * The event and the new value are written together. A state that moved without
 * an event is a number nobody can explain afterwards, which is exactly the
 * situation the journal exists to prevent.
 */
export type ResourceEvent = {
  readonly id: string
  readonly resource: ResourceKind
  readonly previousValue: number
  readonly currentValue: number
  readonly delta: number
  readonly actorName: string | null
  readonly reason: string | null
  readonly gameSessionId: string | null
  readonly reversesEventId: string | null
  readonly createdAt: Date
}

const COLUMN_OF: Readonly<Record<ResourceKind, 'hitPoints' | 'sanity' | 'magicPoints' | 'luck'>> = {
  HP: 'hitPoints',
  SAN: 'sanity',
  MP: 'magicPoints',
  LUCK: 'luck',
}

export async function applyResourceChange(input: {
  investigatorId: string
  resource: ResourceKind
  previousValue: number
  currentValue: number
  conditions?: Conditions
  actorId: string
  reason: string | null
  gameSessionId?: string | null
  reversesEventId?: string | null
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const id = newId()

  await input.executor.insert(investigatorResourceEvent).values({
    id,
    investigatorId: input.investigatorId,
    resource: input.resource,
    previousValue: input.previousValue,
    currentValue: input.currentValue,
    delta: input.currentValue - input.previousValue,
    actorId: input.actorId,
    gameSessionId: input.gameSessionId ?? null,
    reason: input.reason,
    reversesEventId: input.reversesEventId ?? null,
    createdAt: input.now,
  })

  await input.executor
    .update(investigatorState)
    .set({
      [COLUMN_OF[input.resource]]: input.currentValue,
      ...(input.conditions ?? {}),
      updatedAt: input.now,
    })
    .where(eq(investigatorState.investigatorId, input.investigatorId))

  return id
}

/** The journal, newest first. */
export async function listResourceEvents(
  investigatorId: string,
  limit = 50,
  executor: DbOrTx = db,
): Promise<ResourceEvent[]> {
  const rows = await executor
    .select({
      id: investigatorResourceEvent.id,
      resource: investigatorResourceEvent.resource,
      previousValue: investigatorResourceEvent.previousValue,
      currentValue: investigatorResourceEvent.currentValue,
      delta: investigatorResourceEvent.delta,
      actorName: authUser.name,
      reason: investigatorResourceEvent.reason,
      gameSessionId: investigatorResourceEvent.gameSessionId,
      reversesEventId: investigatorResourceEvent.reversesEventId,
      createdAt: investigatorResourceEvent.createdAt,
    })
    .from(investigatorResourceEvent)
    .leftJoin(authUser, eq(authUser.id, investigatorResourceEvent.actorId))
    .where(eq(investigatorResourceEvent.investigatorId, investigatorId))
    /*
     * The identifier breaks the tie. Two events written in the same transaction
     * share a timestamp, and ordering on that alone would pick between them
     * arbitrarily - which for the undo below means undoing the wrong one. Ids
     * are ULIDs, so they sort by creation time.
     */
    .orderBy(desc(investigatorResourceEvent.createdAt), desc(investigatorResourceEvent.id))
    .limit(limit)

  return rows
}

/**
 * The most recent change that has not already been undone.
 *
 * Reversal is deliberately limited to the latest one. Undoing something from the
 * middle of an evening would mean recomputing everything after it, and the
 * mistake people actually make is the one they just made.
 */
export async function findReversibleEvent(input: {
  investigatorId: string
  executor?: DbOrTx
}): Promise<{
  id: string
  resource: ResourceKind
  previousValue: number
  currentValue: number
} | null> {
  const executor = input.executor ?? db

  const row = await executor
    .select({
      id: investigatorResourceEvent.id,
      resource: investigatorResourceEvent.resource,
      previousValue: investigatorResourceEvent.previousValue,
      currentValue: investigatorResourceEvent.currentValue,
    })
    .from(investigatorResourceEvent)
    .where(
      and(
        eq(investigatorResourceEvent.investigatorId, input.investigatorId),
        isNull(investigatorResourceEvent.reversesEventId),
      ),
    )
    .orderBy(desc(investigatorResourceEvent.createdAt), desc(investigatorResourceEvent.id))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) return null

  const alreadyReversed = await executor
    .select({ id: investigatorResourceEvent.id })
    .from(investigatorResourceEvent)
    .where(eq(investigatorResourceEvent.reversesEventId, row.id))
    .limit(1)
    .then((rows) => rows[0])

  return alreadyReversed ? null : row
}

/**
 * How much Sanity has gone today, for the one-fifth rule.
 *
 * Reversed changes are left out on both sides: an event somebody undid and the
 * event that undid it. A mistyped loss corrected a moment later did not happen,
 * and counting it would push a character into indefinite insanity over a number
 * nobody at the table ever heard.
 *
 * Recoveries are not subtracted. The rule counts Sanity lost in a day, not the
 * day's net movement, and a character who is treated after a bad hour has still
 * had the bad hour.
 */
export async function sanityLostSince(input: {
  investigatorId: string
  since: Date
  executor?: DbOrTx
}): Promise<{ lost: number; sanityAtStart: number | null }> {
  const executor = input.executor ?? db

  const rows = await executor
    .select({
      id: investigatorResourceEvent.id,
      previousValue: investigatorResourceEvent.previousValue,
      delta: investigatorResourceEvent.delta,
      reversesEventId: investigatorResourceEvent.reversesEventId,
    })
    .from(investigatorResourceEvent)
    .where(
      and(
        eq(investigatorResourceEvent.investigatorId, input.investigatorId),
        eq(investigatorResourceEvent.resource, 'SAN'),
        gte(investigatorResourceEvent.createdAt, input.since),
      ),
    )
    .orderBy(asc(investigatorResourceEvent.createdAt), asc(investigatorResourceEvent.id))

  /*
   * A reversal always follows what it reverses, so both are inside any window
   * that contains the original.
   */
  const reversed = new Set(
    rows.flatMap((row) => (row.reversesEventId === null ? [] : [row.reversesEventId])),
  )

  const counted = rows.filter((row) => row.reversesEventId === null && !reversed.has(row.id))
  const lost = counted.reduce((total, row) => total + Math.max(0, -row.delta), 0)

  return {
    lost,
    sanityAtStart: rows[0]?.previousValue ?? null,
  }
}

/** Sets the health and insanity flags without moving any number. */
export async function setConditions(input: {
  investigatorId: string
  conditions: Conditions
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(investigatorState)
    .set({ ...input.conditions, updatedAt: input.now })
    .where(eq(investigatorState.investigatorId, input.investigatorId))
}
