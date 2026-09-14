import 'server-only'
import { and, asc, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, campaign, gameSession, sessionParticipant } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { requireCampaignMember } from '@/modules/campaigns/data/guards'
import { presenceIsRequired } from '../domain/rules'
import type {
  SessionDetail,
  SessionListItem,
  SessionParticipantDto,
  SessionStatus,
} from '../domain/types'
import { requireSessionMember } from './guards'

/**
 * Session queries and mutations.
 *
 * The detail DTO is assembled per viewer: a Keeper receives every participant's
 * priority, an Investigator receives none of them. That asymmetry is applied
 * here rather than in a component, so there is no version of the data in which
 * the priorities are present and merely unrendered.
 */
export async function listCampaignSessions(campaignId: string): Promise<SessionListItem[]> {
  const { user } = await requireCampaignMember(campaignId)

  /*
   * Aggregated through a join rather than correlated subqueries.
   *
   * Not a performance preference: Drizzle renders a correlated column reference
   * without its table prefix, and `session_participant` also has an `id`, so
   * `sp.game_session_id = id` silently resolved against the subquery's own row
   * and matched nothing. A join has no such ambiguity, and MySQL rejects it
   * loudly if one is ever introduced.
   */
  const rows = await db
    .select({
      id: gameSession.id,
      title: gameSession.title,
      status: gameSession.status,
      searchWindowStart: gameSession.searchWindowStart,
      searchWindowEnd: gameSession.searchWindowEnd,
      availabilityDeadline: gameSession.availabilityDeadline,
      confirmedStartUtc: gameSession.confirmedStartUtc,
      confirmedEndUtc: gameSession.confirmedEndUtc,
      timezone: gameSession.timezone,
      participantCount: sql<number>`count(${sessionParticipant.id})`,
      respondedCount: sql<number>`sum(${sessionParticipant.respondedAt} is not null)`,
      viewerIsParticipant: sql<number>`max(${sessionParticipant.userId} = ${user.id})`,
      viewerHasResponded: sql<number>`max(
        ${sessionParticipant.userId} = ${user.id} and ${sessionParticipant.respondedAt} is not null
      )`,
    })
    .from(gameSession)
    .leftJoin(sessionParticipant, eq(sessionParticipant.gameSessionId, gameSession.id))
    .where(eq(gameSession.campaignId, campaignId))
    .groupBy(
      gameSession.id,
      gameSession.title,
      gameSession.status,
      gameSession.searchWindowStart,
      gameSession.searchWindowEnd,
      gameSession.availabilityDeadline,
      gameSession.confirmedStartUtc,
      gameSession.confirmedEndUtc,
      gameSession.timezone,
      gameSession.createdAt,
    )
    .orderBy(
      // Sessions that still need something come first; history sinks.
      sql`field(${gameSession.status}, 'COLLECTING', 'PROPOSED', 'SCHEDULED', 'DRAFT', 'COMPLETED', 'CANCELLED')`,
      desc(gameSession.createdAt),
    )

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    searchWindowStart: row.searchWindowStart,
    searchWindowEnd: row.searchWindowEnd,
    availabilityDeadline: row.availabilityDeadline,
    confirmedStartUtc: row.confirmedStartUtc,
    confirmedEndUtc: row.confirmedEndUtc,
    timezone: row.timezone,
    participantCount: Number(row.participantCount ?? 0),
    respondedCount: Number(row.respondedCount ?? 0),
    viewerIsParticipant: Number(row.viewerIsParticipant ?? 0) > 0,
    viewerHasResponded: Number(row.viewerHasResponded ?? 0) > 0,
  }))
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const context = await requireSessionMember(sessionId)
  const isKeeper = context.membership.role === 'KEEPER'

  const row = await db
    .select({
      id: gameSession.id,
      campaignId: gameSession.campaignId,
      campaignName: campaign.name,
      title: gameSession.title,
      description: gameSession.description,
      status: gameSession.status,
      searchWindowStart: gameSession.searchWindowStart,
      searchWindowEnd: gameSession.searchWindowEnd,
      gridStartHour: gameSession.gridStartHour,
      gridEndHour: gameSession.gridEndHour,
      minSessionHours: gameSession.minSessionHours,
      quorum: gameSession.quorum,
      availabilityDeadline: gameSession.availabilityDeadline,
      timezone: gameSession.timezone,
      confirmedStartUtc: gameSession.confirmedStartUtc,
      confirmedEndUtc: gameSession.confirmedEndUtc,
      setManually: gameSession.setManually,
      cancelledReason: gameSession.cancelledReason,
    })
    .from(gameSession)
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .where(eq(gameSession.id, sessionId))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()

  const participantRows = await db
    .select({
      userId: sessionParticipant.userId,
      name: authUser.name,
      priority: sessionParticipant.priority,
      isKeeper: sessionParticipant.isKeeper,
      respondedAt: sessionParticipant.respondedAt,
      attendance: sessionParticipant.attendance,
    })
    .from(sessionParticipant)
    .innerJoin(authUser, eq(authUser.id, sessionParticipant.userId))
    .where(eq(sessionParticipant.gameSessionId, sessionId))
    .orderBy(desc(sessionParticipant.isKeeper), asc(authUser.name))

  const own = participantRows.find((participant) => participant.userId === context.user.id)

  // Priorities are stripped for Investigators here, not hidden in the view.
  const participants: SessionParticipantDto[] = participantRows.map((participant) => ({
    userId: participant.userId,
    name: participant.name,
    priority: isKeeper ? participant.priority : 'PREFERRED',
    isKeeper: participant.isKeeper,
    respondedAt: isKeeper ? participant.respondedAt : null,
    attendance: participant.attendance,
  }))

  return {
    ...row,
    participants,
    viewer: {
      userId: context.user.id,
      isKeeper,
      isParticipant: own !== undefined,
      ownPresenceRequired: own ? presenceIsRequired(own.priority) : false,
      ownResponse: own?.respondedAt ?? null,
    },
  }
}

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

/** Sessions whose collection deadline has elapsed; the worker closes these. */
export async function findSessionsPastDeadline(
  now: Date,
): Promise<{ id: string; campaignId: string }[]> {
  return db
    .select({ id: gameSession.id, campaignId: gameSession.campaignId })
    .from(gameSession)
    .where(
      and(
        eq(gameSession.status, 'COLLECTING'),
        isNotNull(gameSession.availabilityDeadline),
        sql`${gameSession.availabilityDeadline} <= ${now}`,
      ),
    )
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
