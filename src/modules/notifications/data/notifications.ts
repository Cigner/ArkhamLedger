import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  campaignIntegration,
  notification,
  notificationDelivery,
  notificationPreference,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { channelsFor } from '../domain/preferences'
import type { DeliveryChannel, NotificationDraft } from '../domain/types'

/**
 * Writing notifications.
 *
 * Raising a notification is part of the transaction that caused it: the event
 * and the intention to deliver it are written together, so a crash between the
 * two is not a thing that can happen. Delivery itself is the worker's problem.
 *
 * Deliberately free of anything request-shaped. The worker raises notifications
 * too — for a deadline that passed, for a campaign with nothing in the diary —
 * and it runs in a process with no session, no request headers and no reason to
 * carry an authentication library. Reads that belong to a person live in
 * inbox.ts, which does.
 */
export async function enqueueNotifications(input: {
  readonly drafts: readonly NotificationDraft[]
  readonly now: Date
  readonly executor: DbOrTx
}): Promise<{ notificationIds: string[] }> {
  if (input.drafts.length === 0) return { notificationIds: [] }

  const recipientIds = [...new Set(input.drafts.map((draft) => draft.userId))]
  const disabled = await disabledChannelsFor(recipientIds, input.executor)
  const webhooks = await campaignsWithWebhook(
    [...new Set(input.drafts.map((draft) => draft.campaignId).filter(isPresent))],
    input.executor,
  )

  /*
   * One recipient carries the campaign's broadcast, chosen by the lowest id so
   * the choice is deterministic and does not depend on the order the callers
   * happened to assemble their list in.
   */
  const carriers = new Map<string, string>()
  for (const draft of input.drafts) {
    if (!draft.campaignId) continue
    const key = `${draft.campaignId}:${draft.type}:${draft.gameSessionId ?? ''}`
    const current = carriers.get(key)
    if (!current || draft.userId < current) carriers.set(key, draft.userId)
  }

  const notificationIds: string[] = []
  const deliveries: (typeof notificationDelivery.$inferInsert)[] = []

  for (const draft of input.drafts) {
    const notificationId = newId()
    notificationIds.push(notificationId)

    const key = `${draft.campaignId ?? ''}:${draft.type}:${draft.gameSessionId ?? ''}`

    const channels = channelsFor({
      type: draft.type,
      disabledChannels: disabled.get(draft.userId) ?? new Set<DeliveryChannel>(),
      campaignHasWebhook: draft.campaignId ? webhooks.has(draft.campaignId) : false,
      carriesBroadcast: carriers.get(key) === draft.userId,
    })

    await input.executor.insert(notification).values({
      id: notificationId,
      userId: draft.userId,
      type: draft.type,
      campaignId: draft.campaignId ?? null,
      gameSessionId: draft.gameSessionId ?? null,
      payload: draft.payload,
      readAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })

    for (const channel of channels) {
      deliveries.push({
        id: newId(),
        notificationId,
        channel,
        // In-app needs no sending: the row the reader opens is the delivery.
        status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        attempts: 0,
        nextAttemptAt: input.now,
        sentAt: channel === 'IN_APP' ? input.now : null,
        createdAt: input.now,
        updatedAt: input.now,
      })
    }
  }

  if (deliveries.length > 0) {
    await input.executor.insert(notificationDelivery).values(deliveries)
  }

  return { notificationIds }
}

/** Only the exceptions are stored, so an absent row means the channel is on. */
async function disabledChannelsFor(
  userIds: readonly string[],
  executor: DbOrTx,
): Promise<Map<string, Set<DeliveryChannel>>> {
  if (userIds.length === 0) return new Map()

  const rows = await executor
    .select({
      userId: notificationPreference.userId,
      channel: notificationPreference.channel,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(inArray(notificationPreference.userId, [...userIds]))

  const disabled = new Map<string, Set<DeliveryChannel>>()
  for (const row of rows) {
    if (row.enabled) continue
    const bucket = disabled.get(row.userId) ?? new Set<DeliveryChannel>()
    bucket.add(row.channel)
    disabled.set(row.userId, bucket)
  }

  return disabled
}

async function campaignsWithWebhook(
  campaignIds: readonly string[],
  executor: DbOrTx,
): Promise<Set<string>> {
  if (campaignIds.length === 0) return new Set()

  const rows = await executor
    .select({ campaignId: campaignIntegration.campaignId })
    .from(campaignIntegration)
    .where(
      and(
        inArray(campaignIntegration.campaignId, [...campaignIds]),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
        eq(campaignIntegration.enabled, true),
      ),
    )

  return new Set(rows.map((row) => row.campaignId))
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}
