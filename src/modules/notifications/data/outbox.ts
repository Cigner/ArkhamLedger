import 'server-only'
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  campaign,
  campaignIntegration,
  notification,
  notificationDelivery,
} from '@/db/schema'
import { decryptSecret } from '@/lib/crypto'
import { env } from '@/lib/env'
import { appLogger } from '@/lib/logger'
import { nextAttemptAfter } from '../domain/backoff'
import { renderNotification } from '../domain/messages'
import type { DeliveryOutcome, DispatchContext } from '../domain/dispatcher'
import type { DeliveryChannel, NotificationPayload } from '../domain/types'

/**
 * The delivery queue.
 *
 * A table rather than a broker, because the scale does not justify a second
 * stateful service and MySQL has the one primitive that matters: `FOR UPDATE
 * SKIP LOCKED` lets a second worker take different rows instead of blocking on
 * the first one's. Claiming flips a row to SENDING inside that same
 * transaction, so a row is never handed out twice even if the two workers are
 * mid-restart.
 *
 * Redelivery after a crash is safe by construction: the unique index on
 * (notification, channel) means a duplicate row cannot exist, and a row left in
 * SENDING by a killed process is reclaimed by age rather than duplicated.
 */

/**
 * How long a claimed row may stay SENDING before it is considered abandoned.
 *
 * Longer than any plausible send — SMTP timeouts included — and short enough
 * that a worker killed mid-flush does not strand its notifications for the rest
 * of the evening.
 */
const STALE_CLAIM_MS = 10 * 60_000

export type ClaimedDelivery = {
  readonly deliveryId: string
  readonly channel: DeliveryChannel
  readonly attempts: number
  readonly context: DispatchContext
}

/**
 * Takes up to `limit` deliveries that are due, marking them in flight.
 *
 * The claim and the status change are one transaction; the work happens after
 * it. Holding the transaction open across a network call would keep row locks
 * for the length of an SMTP conversation, which is how a queue turns into a
 * deadlock under the smallest amount of concurrency.
 */
export async function claimDueDeliveries(input: {
  readonly limit: number
  readonly now: Date
  readonly executor?: DbOrTx
}): Promise<string[]> {
  const executor = input.executor ?? db
  const staleBefore = new Date(input.now.getTime() - STALE_CLAIM_MS)

  return executor.transaction(async (tx) => {
    const due = await tx
      .select({ id: notificationDelivery.id })
      .from(notificationDelivery)
      .where(
        and(
          lte(notificationDelivery.nextAttemptAt, input.now),
          sql`(
            ${notificationDelivery.status} = 'PENDING'
            OR (${notificationDelivery.status} = 'SENDING' AND ${notificationDelivery.updatedAt} < ${staleBefore})
          )`,
        ),
      )
      .orderBy(asc(notificationDelivery.nextAttemptAt))
      .limit(input.limit)
      .for('update', { skipLocked: true })

    const ids = due.map((row) => row.id)
    if (ids.length === 0) return []

    await tx
      .update(notificationDelivery)
      .set({
        status: 'SENDING',
        attempts: sql`${notificationDelivery.attempts} + 1`,
        updatedAt: input.now,
      })
      .where(inArray(notificationDelivery.id, ids))

    return ids
  })
}

/**
 * Everything the dispatchers need for the claimed rows, in as few queries as
 * possible.
 *
 * Resolved here rather than inside each dispatcher so that ten deliveries of one
 * event cost one lookup of the recipient and one of the campaign, and so a
 * dispatcher stays a thin wrapper around a single network call.
 */
export async function loadDispatchContexts(
  deliveryIds: readonly string[],
): Promise<ClaimedDelivery[]> {
  if (deliveryIds.length === 0) return []

  const rows = await db
    .select({
      deliveryId: notificationDelivery.id,
      channel: notificationDelivery.channel,
      attempts: notificationDelivery.attempts,
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
      campaignId: notification.campaignId,
      gameSessionId: notification.gameSessionId,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      recipientName: authUser.name,
      recipientEmail: authUser.email,
      recipientTimezone: authUser.timezone,
    })
    .from(notificationDelivery)
    .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
    .innerJoin(authUser, eq(authUser.id, notification.userId))
    .where(inArray(notificationDelivery.id, [...deliveryIds]))

  const campaignIds = [
    ...new Set(rows.map((row) => row.campaignId).filter((id): id is string => id !== null)),
  ]
  const outbound = await loadCampaignOutbound(campaignIds)

  return rows.map((row) => {
    const payload = row.payload as NotificationPayload

    return {
      deliveryId: row.deliveryId,
      channel: row.channel,
      attempts: row.attempts,
      context: {
        notification: {
          id: row.notificationId,
          userId: row.userId,
          type: row.type,
          campaignId: row.campaignId,
          gameSessionId: row.gameSessionId,
          payload,
          readAt: row.readAt,
          createdAt: row.createdAt,
        },
        recipient: {
          userId: row.userId,
          name: row.recipientName,
          email: row.recipientEmail,
          timezone: row.recipientTimezone,
        },
        message: renderNotification({
          type: row.type,
          payload,
          recipientName: row.recipientName,
          baseUrl: env.BETTER_AUTH_URL,
          campaignId: row.campaignId,
          gameSessionId: row.gameSessionId,
        }),
        campaign: row.campaignId ? (outbound.get(row.campaignId) ?? null) : null,
      },
    }
  })
}

/**
 * Campaign names and webhooks, with the webhook decrypted.
 *
 * A webhook that fails to decrypt is treated as absent rather than fatal: the
 * remaining channels still deliver, and the error is logged where an
 * administrator will see it. A key rotation should not stop the group being told
 * their session is confirmed.
 */
async function loadCampaignOutbound(
  campaignIds: readonly string[],
): Promise<Map<string, DispatchContext['campaign'] & object>> {
  if (campaignIds.length === 0) return new Map()

  const rows = await db
    .select({
      campaignId: campaign.id,
      name: campaign.name,
      config: campaignIntegration.config,
      enabled: campaignIntegration.enabled,
    })
    .from(campaign)
    .leftJoin(
      campaignIntegration,
      and(
        eq(campaignIntegration.campaignId, campaign.id),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
    .where(inArray(campaign.id, [...campaignIds]))

  const outbound = new Map<string, { campaignId: string; name: string; discordWebhookUrl: string | null }>()

  for (const row of rows) {
    let url: string | null = null

    if (row.enabled && row.config) {
      try {
        const config = row.config as { url?: string }
        url = config.url ? decryptSecret(config.url, env.ENCRYPTION_KEY) : null
      } catch (error) {
        appLogger.error(
          { campaignId: row.campaignId, err: error },
          'discord webhook could not be decrypted',
        )
      }
    }

    outbound.set(row.campaignId, {
      campaignId: row.campaignId,
      name: row.name,
      discordWebhookUrl: url,
    })
  }

  return outbound
}

/**
 * Records what happened to a delivery.
 *
 * A retryable failure goes back into the queue with its backoff; a permanent one
 * or an exhausted attempt count stops. Nothing is deleted — a failed delivery is
 * the only evidence that somebody was not told, and the admin view reads it.
 */
export async function completeDelivery(input: {
  readonly deliveryId: string
  readonly attempts: number
  readonly outcome: DeliveryOutcome
  readonly now: Date
}): Promise<void> {
  if (input.outcome.kind === 'SENT') {
    await db
      .update(notificationDelivery)
      .set({ status: 'SENT', sentAt: input.now, lastError: null, updatedAt: input.now })
      .where(eq(notificationDelivery.id, input.deliveryId))
    return
  }

  const retryAt =
    input.outcome.kind === 'RETRYABLE' ? nextAttemptAfter(input.attempts, input.now) : null

  await db
    .update(notificationDelivery)
    .set({
      status: retryAt ? 'PENDING' : 'FAILED',
      nextAttemptAt: retryAt ?? input.now,
      lastError: input.outcome.error.slice(0, 500),
      updatedAt: input.now,
    })
    .where(eq(notificationDelivery.id, input.deliveryId))
}

/** Counts for the administration view: how much is stuck, and how much gave up. */
export async function outboxHealth(): Promise<{ pending: number; failed: number }> {
  const [row] = await db
    .select({
      pending: sql<number>`sum(${notificationDelivery.status} in ('PENDING','SENDING'))`,
      failed: sql<number>`sum(${notificationDelivery.status} = 'FAILED')`,
    })
    .from(notificationDelivery)

  return { pending: Number(row?.pending ?? 0), failed: Number(row?.failed ?? 0) }
}
