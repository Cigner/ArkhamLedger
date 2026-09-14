import type { DeliveryOutcome, DispatchContext, NotificationDispatcher } from '../domain/dispatcher'

/**
 * In-app delivery.
 *
 * The notification row is the delivery, so there is nothing to send. It exists
 * as a dispatcher anyway because the queue should have one implementation per
 * channel: without it, a row that reached PENDING through some future path would
 * sit in the queue forever with nothing willing to claim it.
 */
export const inAppDispatcher: NotificationDispatcher = {
  channel: 'IN_APP',

  supports(): boolean {
    return true
  },

  send(_context: DispatchContext): Promise<DeliveryOutcome> {
    return Promise.resolve({ kind: 'SENT' })
  },
}
