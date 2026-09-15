import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { notificationPreference } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import { newId } from '@/lib/ids'
import { CHANNEL_DEFAULT_ENABLED } from '../domain/preferences'
import type { DeliveryChannel } from '../domain/types'

/**
 * A person's own delivery settings.
 *
 * Only exceptions are stored, so the read fills in defaults rather than
 * returning holes - a channel added after somebody last opened this page is on
 * for them, which is the behaviour that does not require a backfill or leave
 * anybody silently unreachable.
 */
export async function getMyChannelPreferences(): Promise<Record<DeliveryChannel, boolean>> {
  const user = await requireUser()

  const rows = await db
    .select({ channel: notificationPreference.channel, enabled: notificationPreference.enabled })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, user.id))

  const preferences = { ...CHANNEL_DEFAULT_ENABLED }
  for (const row of rows) preferences[row.channel] = row.enabled

  return preferences
}

export async function setChannelPreference(input: {
  readonly channel: DeliveryChannel
  readonly enabled: boolean
  readonly now: Date
}): Promise<void> {
  const user = await requireUser()

  await db
    .insert(notificationPreference)
    .values({
      id: newId(),
      userId: user.id,
      channel: input.channel,
      enabled: input.enabled,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onDuplicateKeyUpdate({ set: { enabled: input.enabled, updatedAt: input.now } })
}

/** Used by tests and by the admin view; never exposed to another user's id. */
export async function isChannelEnabledFor(
  userId: string,
  channel: DeliveryChannel,
): Promise<boolean> {
  const [row] = await db
    .select({ enabled: notificationPreference.enabled })
    .from(notificationPreference)
    .where(
      and(eq(notificationPreference.userId, userId), eq(notificationPreference.channel, channel)),
    )
    .limit(1)

  return row?.enabled ?? CHANNEL_DEFAULT_ENABLED[channel]
}
