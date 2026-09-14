import 'server-only'
import { and, eq, gt, gte, inArray, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaign,
  campaignMember,
  gameSession,
  notification,
  sessionParticipant,
} from '@/db/schema'

/**
 * The questions the worker asks about what still needs saying.
 *
 * Each one carries its own guard against repeating itself, and the guard is the
 * notification table rather than a flag on the thing being nudged about. That
 * matters: a flag would have to be reset by hand after a deadline moves, whereas
 * "has this person already been reminded about this session" is a question the
 * record already answers, and answering it wrongly is how a tool teaches people
 * to ignore it.
 */
export type PendingReminder = {
  readonly sessionId: string
  readonly campaignId: string
  readonly campaignName: string
  readonly sessionTitle: string
  readonly userId: string
  readonly deadline: Date
  readonly timezone: string
}

/**
 * Who has not answered a session whose deadline is close.
 *
 * Exactly one reminder per person per session, ever. A second one is nagging,
 * and the first is already the strongest signal the application has: if it did
 * not work, another copy of it will not either.
 */
export async function findPendingReminders(input: {
  readonly now: Date
  readonly horizonMs: number
}): Promise<PendingReminder[]> {
  const horizon = new Date(input.now.getTime() + input.horizonMs)

  const rows = await db
    .select({
      sessionId: gameSession.id,
      campaignId: gameSession.campaignId,
      campaignName: campaign.name,
      sessionTitle: gameSession.title,
      userId: sessionParticipant.userId,
      deadline: gameSession.availabilityDeadline,
      timezone: gameSession.timezone,
    })
    .from(gameSession)
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .innerJoin(sessionParticipant, eq(sessionParticipant.gameSessionId, gameSession.id))
    .where(
      and(
        eq(gameSession.status, 'COLLECTING'),
        isNull(sessionParticipant.respondedAt),
        gt(gameSession.availabilityDeadline, input.now),
        lte(gameSession.availabilityDeadline, horizon),
        isNull(campaign.deletedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notification)
            .where(
              and(
                eq(notification.userId, sessionParticipant.userId),
                eq(notification.gameSessionId, gameSession.id),
                eq(notification.type, 'AVAILABILITY_REMINDER'),
              ),
            ),
        ),
      ),
    )

  return rows.flatMap((row) =>
    row.deadline ? [{ ...row, deadline: row.deadline }] : [],
  )
}

export type IdleCampaign = {
  readonly campaignId: string
  readonly campaignName: string
  readonly keeperIds: readonly string[]
}

/**
 * Active campaigns with nothing in the diary.
 *
 * The failure this exists to catch is the quiet one: a campaign does not usually
 * end in an argument, it ends because the evening after the last one was never
 * arranged. Only Keepers are told, because only they can do anything about it,
 * and only once in the quiet period rather than every morning.
 */
export async function findIdleCampaigns(input: {
  readonly now: Date
  readonly repeatAfterMs: number
}): Promise<IdleCampaign[]> {
  const since = new Date(input.now.getTime() - input.repeatAfterMs)

  const idle = await db
    .select({ campaignId: campaign.id, campaignName: campaign.name })
    .from(campaign)
    .where(
      and(
        eq(campaign.status, 'ACTIVE'),
        isNull(campaign.deletedAt),
        // Nothing scheduled ahead, and nothing still looking for a date.
        notExists(
          db
            .select({ one: sql`1` })
            .from(gameSession)
            .where(
              and(
                eq(gameSession.campaignId, campaign.id),
                sql`(
                  (${gameSession.status} = 'SCHEDULED' AND ${gameSession.confirmedStartUtc} > ${input.now})
                  OR ${gameSession.status} IN ('DRAFT','COLLECTING','PROPOSED')
                )`,
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notification)
            .where(
              and(
                eq(notification.campaignId, campaign.id),
                eq(notification.type, 'NO_NEXT_SESSION'),
                gte(notification.createdAt, since),
              ),
            ),
        ),
      ),
    )

  if (idle.length === 0) return []

  const keepers = await db
    .select({ campaignId: campaignMember.campaignId, userId: campaignMember.userId })
    .from(campaignMember)
    .where(
      and(
        inArray(
          campaignMember.campaignId,
          idle.map((row) => row.campaignId),
        ),
        eq(campaignMember.role, 'KEEPER'),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )

  const byCampaign = new Map<string, string[]>()
  for (const keeper of keepers) {
    const bucket = byCampaign.get(keeper.campaignId) ?? []
    bucket.push(keeper.userId)
    byCampaign.set(keeper.campaignId, bucket)
  }

  return idle
    .map((row) => ({ ...row, keeperIds: byCampaign.get(row.campaignId) ?? [] }))
    .filter((row) => row.keeperIds.length > 0)
}

/**
 * Sessions whose answering period has run out.
 *
 * The worker closes these and ranks what came in, which is the promise the
 * deadline makes: a Keeper who sets one should not have to remember it.
 */
export type ExpiredCollection = {
  readonly sessionId: string
  readonly campaignId: string
  readonly campaignName: string
  readonly title: string
  readonly timezone: string
}

export async function findExpiredCollections(now: Date): Promise<ExpiredCollection[]> {
  return db
    .select({
      sessionId: gameSession.id,
      campaignId: gameSession.campaignId,
      campaignName: campaign.name,
      title: gameSession.title,
      timezone: gameSession.timezone,
    })
    .from(gameSession)
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .where(
      and(
        eq(gameSession.status, 'COLLECTING'),
        isNull(campaign.deletedAt),
        // A session with no deadline is never closed automatically: the Keeper
        // said they would decide when to stop asking.
        isNotNull(gameSession.availabilityDeadline),
        lte(gameSession.availabilityDeadline, now),
      ),
    )
}

/** Everybody invited to a session, for telling them something about it. */
export async function listParticipantIds(sessionId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: sessionParticipant.userId })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  return rows.map((row) => row.userId)
}

/** The Keepers of a session's campaign, for telling them something only they act on. */
export async function listKeeperIds(campaignId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: campaignMember.userId })
    .from(campaignMember)
    .where(
      and(
        eq(campaignMember.campaignId, campaignId),
        eq(campaignMember.role, 'KEEPER'),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )

  return rows.map((row) => row.userId)
}
