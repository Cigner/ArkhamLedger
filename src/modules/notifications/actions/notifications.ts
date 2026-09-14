'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError, RateLimitError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { consumeAttempt } from '@/lib/throttle'
import { findCampaignState } from '@/modules/campaigns/data/campaigns'
import { requireOwner } from '@/modules/campaigns/data/guards'
import { markAllRead, markRead } from '../data/inbox'
import {
  deleteDiscordWebhook,
  readDiscordWebhook,
  recordIntegrationError,
  saveDiscordWebhook,
} from '../data/integrations'
import { setChannelPreference } from '../data/preferences'
import { discordDispatcher } from '../dispatchers/discord'
import {
  campaignIdSchema,
  channelPreferenceSchema,
  discordWebhookSchema,
  markReadSchema,
} from '../domain/schemas'

/**
 * Reading, muting, and wiring up a channel.
 *
 * The inbox actions take no user id: the rows they touch are selected by the
 * session's own identity in the data layer, so there is no shape of input that
 * could mark somebody else's notifications read.
 */
export const markNotificationsRead = authActionClient
  .metadata({ name: 'notification.markRead' })
  .inputSchema(markReadSchema)
  .action(async ({ parsedInput }) => {
    await markRead(parsedInput.ids, new Date())
    revalidatePath('/notifications')
    return { ok: true }
  })

export const markAllNotificationsRead = authActionClient
  .metadata({ name: 'notification.markAllRead' })
  .action(async () => {
    await markAllRead(new Date())
    revalidatePath('/notifications')
    return { ok: true }
  })

export const setNotificationChannel = authActionClient
  .metadata({ name: 'notification.setChannel' })
  .inputSchema(channelPreferenceSchema)
  .action(async ({ parsedInput }) => {
    await setChannelPreference({
      channel: parsedInput.channel,
      enabled: parsedInput.enabled,
      now: new Date(),
    })

    revalidatePath('/settings')
    return { ok: true }
  })

/**
 * Points a campaign at a Discord channel.
 *
 * Owner only. A webhook posts to a room the whole group reads, so the decision
 * belongs to whoever owns the campaign rather than to any Keeper — and the URL
 * itself is a credential, so it is written and never read back.
 */
export const setDiscordWebhook = authActionClient
  .metadata({ name: 'integration.setDiscordWebhook' })
  .inputSchema(discordWebhookSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireOwner(parsedInput.campaignId)

    const now = new Date()

    await saveDiscordWebhook({
      campaignId: parsedInput.campaignId,
      url: parsedInput.url,
      createdBy: ctx.user.id,
      now,
    })

    await recordAudit({
      actorId: ctx.user.id,
      action: 'integration.discordConfigured',
      entityType: 'campaign',
      entityId: parsedInput.campaignId,
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/settings`)

    return { ok: true }
  })

export const removeDiscordWebhook = authActionClient
  .metadata({ name: 'integration.removeDiscordWebhook' })
  .inputSchema(campaignIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireOwner(parsedInput.campaignId)

    await deleteDiscordWebhook({ campaignId: parsedInput.campaignId })

    await recordAudit({
      actorId: ctx.user.id,
      action: 'integration.discordRemoved',
      entityType: 'campaign',
      entityId: parsedInput.campaignId,
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/settings`)

    return { ok: true }
  })

/**
 * Posts a test message.
 *
 * Worth the extra action: a webhook pasted with a character missing fails
 * silently three days later, when the session everybody was waiting to hear
 * about is confirmed and the channel says nothing. Rate limited because it is an
 * outbound request anybody with the owner's seat can trigger in a loop.
 */
export const testDiscordWebhook = authActionClient
  .metadata({ name: 'integration.testDiscordWebhook' })
  .inputSchema(campaignIdSchema)
  .action(async ({ parsedInput }) => {
    const context = await requireOwner(parsedInput.campaignId)

    const decision = await consumeAttempt('schedule', `discord:${parsedInput.campaignId}`)
    if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds)

    const url = await readDiscordWebhook(parsedInput.campaignId)
    if (!url) throw new DomainRuleError('notifications.errors.noWebhookConfigured')

    const { name: campaignName } = await findCampaignState(parsedInput.campaignId)

    const now = new Date()

    const outcome = await discordDispatcher.send({
      notification: {
        id: 'test',
        userId: context.user.id,
        type: 'SESSION_CREATED',
        campaignId: parsedInput.campaignId,
        gameSessionId: null,
        payload: {},
        readAt: null,
        createdAt: now,
      },
      recipient: {
        userId: context.user.id,
        name: context.user.name,
        email: context.user.email,
        timezone: 'UTC',
      },
      message: {
        subject: 'Test',
        body: 'Test',
        channelText: 'Arkham Ledger is connected to this channel.',
        href: null,
      },
      campaign: {
        campaignId: parsedInput.campaignId,
        name: campaignName,
        discordWebhookUrl: url,
      },
    })

    await recordIntegrationError({
      campaignId: parsedInput.campaignId,
      error: outcome.kind === 'SENT' ? null : outcome.error,
      now,
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/settings`)

    if (outcome.kind !== 'SENT') {
      throw new DomainRuleError('notifications.errors.webhookRejected', { error: outcome.error })
    }

    return { ok: true }
  })
