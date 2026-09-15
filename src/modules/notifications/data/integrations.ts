import 'server-only'
import { and, eq } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { campaignIntegration } from '@/db/schema'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { env } from '@/lib/env'
import { newId } from '@/lib/ids'

/**
 * A campaign's outbound webhook.
 *
 * The URL is a bearer credential: anybody holding it can post to the channel as
 * the application. It is encrypted at rest, it is never returned to the
 * interface, and the only function that recovers it is the one the dispatcher
 * calls. What the settings page gets instead is whether one is configured -
 * which is all it needs to render.
 */
export type IntegrationStatus = {
  readonly configured: boolean
  readonly enabled: boolean
  readonly lastError: string | null
  readonly updatedAt: Date | null
}

export async function getDiscordStatus(campaignId: string): Promise<IntegrationStatus> {
  const [row] = await db
    .select({
      enabled: campaignIntegration.enabled,
      config: campaignIntegration.config,
      updatedAt: campaignIntegration.updatedAt,
    })
    .from(campaignIntegration)
    .where(
      and(
        eq(campaignIntegration.campaignId, campaignId),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
    .limit(1)

  if (!row) return { configured: false, enabled: false, lastError: null, updatedAt: null }

  const config = row.config as { lastError?: string }

  return {
    configured: true,
    enabled: row.enabled,
    lastError: config.lastError ?? null,
    updatedAt: row.updatedAt,
  }
}

export async function saveDiscordWebhook(input: {
  readonly campaignId: string
  readonly url: string
  readonly createdBy: string
  readonly now: Date
  readonly executor?: DbOrTx
}): Promise<void> {
  const executor = input.executor ?? db
  const config = { url: encryptSecret(input.url, env.ENCRYPTION_KEY) }

  await executor
    .insert(campaignIntegration)
    .values({
      id: newId(),
      campaignId: input.campaignId,
      type: 'DISCORD_WEBHOOK',
      config,
      enabled: true,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onDuplicateKeyUpdate({ set: { config, enabled: true, updatedAt: input.now } })
}

export async function deleteDiscordWebhook(input: {
  readonly campaignId: string
  readonly executor?: DbOrTx
}): Promise<void> {
  const executor = input.executor ?? db

  await executor
    .delete(campaignIntegration)
    .where(
      and(
        eq(campaignIntegration.campaignId, input.campaignId),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
}

/**
 * Recovers the URL for the one caller allowed to have it.
 *
 * Returns null rather than throwing when nothing is configured; a campaign
 * without a webhook is a normal state, not an error.
 */
export async function readDiscordWebhook(campaignId: string): Promise<string | null> {
  const [row] = await db
    .select({ config: campaignIntegration.config, enabled: campaignIntegration.enabled })
    .from(campaignIntegration)
    .where(
      and(
        eq(campaignIntegration.campaignId, campaignId),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
    .limit(1)

  if (!row?.enabled) return null

  const config = row.config as { url?: string }
  return config.url ? decryptSecret(config.url, env.ENCRYPTION_KEY) : null
}

/** Records why a post failed, so the settings page can say so. */
export async function recordIntegrationError(input: {
  readonly campaignId: string
  readonly error: string | null
  readonly now: Date
}): Promise<void> {
  const [row] = await db
    .select({ config: campaignIntegration.config })
    .from(campaignIntegration)
    .where(
      and(
        eq(campaignIntegration.campaignId, input.campaignId),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
    .limit(1)

  if (!row) return

  const config = row.config as Record<string, unknown>

  await db
    .update(campaignIntegration)
    .set({
      config: { ...config, lastError: input.error?.slice(0, 300) ?? null },
      updatedAt: input.now,
    })
    .where(
      and(
        eq(campaignIntegration.campaignId, input.campaignId),
        eq(campaignIntegration.type, 'DISCORD_WEBHOOK'),
      ),
    )
}
