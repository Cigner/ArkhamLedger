import { appLogger } from '@/lib/logger'
import type { DeliveryOutcome, DispatchContext, NotificationDispatcher } from '../domain/dispatcher'

/**
 * Discord delivery.
 *
 * One post per event to the campaign's channel, not one per person — the
 * carrying recipient is chosen when the notification is written, and the wording
 * is the room's rather than the reader's.
 *
 * Failures are classified by what Discord actually does. A rate limit and a 5xx
 * are worth retrying; a 401, 403 or 404 means the webhook was deleted or
 * revoked, and retrying that for five hours only fills the log with the same
 * line. The URL itself is never logged: it is the credential.
 */
const TIMEOUT_MS = 10_000
const MAX_CONTENT_LENGTH = 2000

export const discordDispatcher: NotificationDispatcher = {
  channel: 'DISCORD',

  supports(context: DispatchContext): boolean {
    return Boolean(context.campaign?.discordWebhookUrl)
  },

  async send(context: DispatchContext): Promise<DeliveryOutcome> {
    const url = context.campaign?.discordWebhookUrl
    if (!url) return { kind: 'PERMANENT', error: 'no webhook configured' }

    const content =
      `**${context.campaign?.name ?? 'Arkham Ledger'}** — ${context.message.channelText}`.slice(
        0,
        MAX_CONTENT_LENGTH,
      )

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (response.ok) return { kind: 'SENT' }

      const permanent =
        response.status === 401 || response.status === 403 || response.status === 404

      appLogger.warn(
        { campaignId: context.campaign?.campaignId, status: response.status, permanent },
        'discord delivery rejected',
      )

      return permanent
        ? { kind: 'PERMANENT', error: `discord ${response.status}` }
        : { kind: 'RETRYABLE', error: `discord ${response.status}` }
    } catch (error) {
      /*
       * A timeout or a DNS failure is the network, not the message. Classified
       * as retryable so a home connection dropping for a minute does not lose
       * the post.
       */
      return { kind: 'RETRYABLE', error: errorName(error) }
    }
  },
}

function errorName(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 200)
  return 'unknown transport error'
}
