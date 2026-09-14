import 'server-only'
import { and, desc, eq, isNull, notExists, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  authUser,
  campaign,
  gameSession,
  notification,
  notificationDelivery,
  workerHeartbeat,
} from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import type { OperationsSnapshot } from '../domain/types'

/**
 * One read of how the deployment is doing.
 *
 * Administrator only, and it deliberately reports no content: counts of
 * campaigns and sessions, never their names. An administrator who is not a
 * member of a campaign has no business reading it from an operations screen,
 * and a metric that names things quietly becomes a way around that.
 */
const WORKER_STALE_AFTER_MS = 5 * 60_000
const RECENT_FAILURES = 10

export async function getOperationsSnapshot(now: Date): Promise<OperationsSnapshot> {
  await requireAdmin()

  const [accounts] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(${authUser.status} = 'ACTIVE')`,
      pendingActivation: sql<number>`sum(${authUser.status} = 'PENDING_ACTIVATION')`,
      disabled: sql<number>`sum(${authUser.status} = 'DISABLED')`,
    })
    .from(authUser)
    .where(isNull(authUser.deletedAt))

  const [campaigns] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(${campaign.status} = 'ACTIVE')`,
    })
    .from(campaign)
    .where(isNull(campaign.deletedAt))

  const idle = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(
      and(
        eq(campaign.status, 'ACTIVE'),
        isNull(campaign.deletedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(gameSession)
            .where(
              and(
                eq(gameSession.campaignId, campaign.id),
                sql`(
                  (${gameSession.status} = 'SCHEDULED' AND ${gameSession.confirmedStartUtc} > ${now})
                  OR ${gameSession.status} IN ('DRAFT','COLLECTING','PROPOSED')
                )`,
              ),
            ),
        ),
      ),
    )

  const [sessions] = await db
    .select({
      collecting: sql<number>`sum(${gameSession.status} = 'COLLECTING')`,
      proposed: sql<number>`sum(${gameSession.status} = 'PROPOSED')`,
      scheduledAhead: sql<number>`sum(${gameSession.status} = 'SCHEDULED' and ${gameSession.confirmedStartUtc} > ${now})`,
      /*
       * A deadline that has passed while the session is still collecting means
       * the worker has not run. One is a timing artefact; a growing number is an
       * outage nobody has noticed.
       */
      overdueDeadlines: sql<number>`sum(${gameSession.status} = 'COLLECTING' and ${gameSession.availabilityDeadline} <= ${now})`,
    })
    .from(gameSession)

  const [deliveries] = await db
    .select({
      pending: sql<number>`sum(${notificationDelivery.status} in ('PENDING','SENDING'))`,
      failed: sql<number>`sum(${notificationDelivery.status} = 'FAILED')`,
    })
    .from(notificationDelivery)

  const recentFailures = await db
    .select({
      channel: notificationDelivery.channel,
      error: notificationDelivery.lastError,
      attempts: notificationDelivery.attempts,
      at: notificationDelivery.updatedAt,
      type: notification.type,
    })
    .from(notificationDelivery)
    .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
    .where(eq(notificationDelivery.status, 'FAILED'))
    .orderBy(desc(notificationDelivery.updatedAt))
    .limit(RECENT_FAILURES)

  const [beat] = await db
    .select({ beatAt: workerHeartbeat.beatAt })
    .from(workerHeartbeat)
    .limit(1)

  return {
    accounts: {
      total: Number(accounts?.total ?? 0),
      active: Number(accounts?.active ?? 0),
      pendingActivation: Number(accounts?.pendingActivation ?? 0),
      disabled: Number(accounts?.disabled ?? 0),
    },
    campaigns: {
      total: Number(campaigns?.total ?? 0),
      active: Number(campaigns?.active ?? 0),
      idle: idle.length,
    },
    sessions: {
      collecting: Number(sessions?.collecting ?? 0),
      proposed: Number(sessions?.proposed ?? 0),
      scheduledAhead: Number(sessions?.scheduledAhead ?? 0),
      overdueDeadlines: Number(sessions?.overdueDeadlines ?? 0),
    },
    deliveries: {
      pending: Number(deliveries?.pending ?? 0),
      failed: Number(deliveries?.failed ?? 0),
      recentFailures: recentFailures.map((row) => ({
        channel: `${row.channel} · ${row.type}`,
        error: row.error ?? 'unknown',
        attempts: row.attempts,
        at: row.at,
      })),
    },
    worker: {
      lastBeatAt: beat?.beatAt ?? null,
      stale: !beat || now.getTime() - beat.beatAt.getTime() > WORKER_STALE_AFTER_MS,
    },
    takenAt: now,
  }
}
