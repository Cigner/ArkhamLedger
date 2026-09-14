import 'server-only'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { authUser, campaign, gameSession, sessionParticipant } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { requireCampaignMember } from '@/modules/campaigns/data/guards'
import { presenceIsRequired } from '../domain/rules'
import type {
  CampaignDiary,
  SessionDetail,
  SessionListItem,
  SessionParticipantDto,
} from '../domain/types'
import { requireSessionMember } from './guards'

/**
 * Session reads for a viewer.
 *
 * The detail DTO is assembled per viewer: a Keeper receives every participant's
 * priority, an Investigator receives none of them. That asymmetry is applied
 * here rather than in a component, so there is no version of the data in which
 * the priorities are present and merely unrendered.
 *
 * Everything in this file authorizes first and therefore depends on the
 * authentication stack. Writes that the background worker also performs live in
 * session-store.ts, which does not — a process with no session cannot be asked
 * to prove it has one.
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

/**
 * What a campaign has coming, and what it just did.
 *
 * Behind the dashboard's one real job: answering "when are we next playing"
 * without making anybody read a list. The answer has three shapes — a date is
 * set, a date is being worked out, or nothing is happening at all — and the last
 * one is the one worth acting on, because that is how campaigns end.
 */
export async function getCampaignDiary(campaignId: string): Promise<CampaignDiary> {
  await requireCampaignMember(campaignId)

  const rows = await db
    .select({
      id: gameSession.id,
      title: gameSession.title,
      status: gameSession.status,
      confirmedStartUtc: gameSession.confirmedStartUtc,
      confirmedEndUtc: gameSession.confirmedEndUtc,
      availabilityDeadline: gameSession.availabilityDeadline,
      searchWindowStart: gameSession.searchWindowStart,
      searchWindowEnd: gameSession.searchWindowEnd,
      timezone: gameSession.timezone,
    })
    .from(gameSession)
    .where(eq(gameSession.campaignId, campaignId))
    .orderBy(desc(gameSession.createdAt))

  const now = new Date()

  const scheduled = rows
    .filter(
      (row) =>
        row.status === 'SCHEDULED' &&
        row.confirmedStartUtc !== null &&
        row.confirmedStartUtc.getTime() >= now.getTime(),
    )
    .sort((a, b) => (a.confirmedStartUtc?.getTime() ?? 0) - (b.confirmedStartUtc?.getTime() ?? 0))

  const arranging = rows.filter(
    (row) => row.status === 'COLLECTING' || row.status === 'PROPOSED' || row.status === 'DRAFT',
  )

  const past = rows
    .filter((row) => row.status === 'COMPLETED')
    .sort((a, b) => (b.confirmedStartUtc?.getTime() ?? 0) - (a.confirmedStartUtc?.getTime() ?? 0))
    .slice(0, 3)

  return {
    next: scheduled[0] ?? null,
    arranging: arranging.slice(0, 3),
    recent: past,
  }
}
