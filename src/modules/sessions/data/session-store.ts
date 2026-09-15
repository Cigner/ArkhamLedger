import 'server-only'
import { and, count, eq, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { gameSession } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type { SessionStatus } from '../domain/types'

/**
 * Session persistence, without a viewer.
 *
 * The same writes serve a Keeper pressing a button and the worker closing a
 * deadline at three in the morning, so nothing here asks who is calling -
 * callers authorize before they arrive. Keeping that separate from the read
 * side is what lets the worker be built without the authentication library in
 * it at all.
 */
/** Internal read for rules that need the raw session without a viewer. */
export async function findSessionState(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<{
  id: string
  campaignId: string
  status: SessionStatus
  quorum: number
  searchWindowStart: string
  searchWindowEnd: string
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  availabilityDeadline: Date | null
  timezone: string
}> {
  const row = await executor.query.gameSession.findFirst({
    where: eq(gameSession.id, sessionId),
    columns: {
      id: true,
      campaignId: true,
      status: true,
      quorum: true,
      searchWindowStart: true,
      searchWindowEnd: true,
      gridStartHour: true,
      gridEndHour: true,
      minSessionHours: true,
      availabilityDeadline: true,
      timezone: true,
    },
  })

  if (!row) throw new NotFoundError()
  return row
}

export async function insertSession(input: {
  campaignId: string
  title: string
  description: string | null
  searchWindowStart: string
  searchWindowEnd: string
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  quorum: number
  availabilityDeadline: Date | null
  timezone: string
  createdBy: string
  now: Date
  executor: DbOrTx
}): Promise<{ sessionId: string }> {
  const sessionId = newId()

  await input.executor.insert(gameSession).values({
    id: sessionId,
    campaignId: input.campaignId,
    title: input.title,
    description: input.description,
    scenarioId: null,
    status: 'DRAFT',
    searchWindowStart: input.searchWindowStart,
    searchWindowEnd: input.searchWindowEnd,
    gridStartHour: input.gridStartHour,
    gridEndHour: input.gridEndHour,
    minSessionHours: input.minSessionHours,
    quorum: input.quorum,
    availabilityDeadline: input.availabilityDeadline,
    timezone: input.timezone,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  })

  return { sessionId }
}

export async function updateSessionDefinition(input: {
  sessionId: string
  title: string
  description: string | null
  searchWindowStart: string
  searchWindowEnd: string
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  quorum: number
  availabilityDeadline: Date | null
  now: Date
  executor: DbOrTx
}): Promise<void> {
  const { sessionId, executor, now, ...patch } = input

  await executor
    .update(gameSession)
    .set({ ...patch, updatedAt: now })
    .where(eq(gameSession.id, sessionId))
}

/** Quorum moves with the roster, so it has its own narrow update. */
export async function setSessionQuorum(
  sessionId: string,
  quorum: number,
  now: Date,
  executor: DbOrTx,
): Promise<void> {
  await executor
    .update(gameSession)
    .set({ quorum, updatedAt: now })
    .where(eq(gameSession.id, sessionId))
}

/**
 * Moves a session to a new status.
 *
 * The current status is part of the WHERE clause, so two Keepers acting at once
 * cannot both apply a transition from the same starting point. The caller checks
 * the affected row count.
 */
export async function transitionSession(input: {
  sessionId: string
  from: SessionStatus
  to: SessionStatus
  patch?: Partial<{
    availabilityDeadline: Date | null
    confirmedStartUtc: Date | null
    confirmedEndUtc: Date | null
    acceptedProposalId: string | null
    setManually: boolean
    cancelledReason: string | null
  }>
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const [result] = await input.executor
    .update(gameSession)
    .set({ status: input.to, ...input.patch, updatedAt: input.now })
    .where(and(eq(gameSession.id, input.sessionId), eq(gameSession.status, input.from)))

  return result.affectedRows === 1
}

/** Campaigns with no session ahead of them; the dashboard nudge reads this. */
export async function countUpcomingSessions(campaignId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(gameSession)
    .where(
      and(
        eq(gameSession.campaignId, campaignId),
        sql`${gameSession.status} in ('DRAFT','COLLECTING','PROPOSED','SCHEDULED')`,
        sql`(${gameSession.confirmedStartUtc} is null or ${gameSession.confirmedStartUtc} >= ${now})`,
      ),
    )

  return Number(row?.total ?? 0)
}
