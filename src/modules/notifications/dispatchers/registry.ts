import { discordDispatcher } from './discord'
import { emailDispatcher } from './email'
import { inAppDispatcher } from './in-app'
import type { DeliveryChannel } from '../domain/types'
import type { NotificationDispatcher } from '../domain/dispatcher'

/**
 * Every channel the application can deliver on.
 *
 * The one place a new channel is registered. Adding Telegram or a push service
 * means a file next to these three and a line in this array; the worker, the
 * queue and every caller that raises a notification stay untouched, which is the
 * property the dispatcher interface exists to buy.
 */
export const DISPATCHERS: readonly NotificationDispatcher[] = [
  inAppDispatcher,
  emailDispatcher,
  discordDispatcher,
]

export function dispatcherFor(channel: DeliveryChannel): NotificationDispatcher | undefined {
  return DISPATCHERS.find((dispatcher) => dispatcher.channel === channel)
}
