import type {
  DeliveryChannel,
  NotificationRecord,
  Recipient,
} from './types'
import type { RenderedMessage } from './messages'

/**
 * The delivery port.
 *
 * Adding a channel — Telegram, Signal, a push service — is a new file
 * implementing this interface plus one line in the registry. Nothing in the
 * worker, the outbox or the code that raises notifications changes, which is the
 * whole reason the seam is here rather than in a switch statement.
 *
 * Two rules that implementations must respect, both learned from what breaks
 * without them:
 *
 *   - Never throw. A dispatcher that throws takes the worker's flush loop down
 *     with it and every other pending delivery waits behind it. Failure is a
 *     return value.
 *   - Never claim a channel it cannot serve. `supports` is how a dispatcher
 *     declines; returning a permanent failure instead would burn an attempt and
 *     record an error for something that was never applicable.
 */
export type DeliveryOutcome =
  | { readonly kind: 'SENT'; readonly reference?: string }
  /** Transient: the queue will try again after a backoff. */
  | { readonly kind: 'RETRYABLE'; readonly error: string }
  /** Hopeless: a malformed address, a revoked webhook. Retrying wastes attempts. */
  | { readonly kind: 'PERMANENT'; readonly error: string }

/**
 * Everything a dispatcher needs, resolved before it is called.
 *
 * Dispatchers do not query. The worker gathers the recipient and the campaign's
 * outbound configuration once per notification, so ten deliveries of one event
 * do not become ten lookups, and a dispatcher stays a pure function of its
 * input plus one network call.
 */
export type DispatchContext = {
  readonly notification: NotificationRecord
  readonly recipient: Recipient
  readonly message: RenderedMessage
  readonly campaign: CampaignOutbound | null
}

export type CampaignOutbound = {
  readonly campaignId: string
  readonly name: string
  /** Decrypted at the last possible moment, and only when a post is due. */
  readonly discordWebhookUrl: string | null
}

export interface NotificationDispatcher {
  readonly channel: DeliveryChannel
  /** Whether this dispatcher can deliver this particular notification. */
  supports(context: DispatchContext): boolean
  send(context: DispatchContext): Promise<DeliveryOutcome>
}
