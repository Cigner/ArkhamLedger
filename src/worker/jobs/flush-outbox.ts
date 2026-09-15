import {
  claimDueDeliveries,
  completeDelivery,
  loadDispatchContexts,
} from '@/modules/notifications/data/outbox'
import { dispatcherFor } from '@/modules/notifications/dispatchers/registry'
import type { Job, JobResult } from '../runtime'

/**
 * Sends what the outbox is holding.
 *
 * Deliveries go out one at a time rather than in parallel. The volume is a
 * handful of messages after somebody presses a button, and a home SMTP relay
 * reacts badly to a burst of simultaneous connections - patience costs seconds
 * here and avoids being throttled by the thing we are trying to use.
 *
 * A channel with no dispatcher, or one that declines the notification, is
 * recorded as permanently undeliverable rather than retried: neither condition
 * changes on its own.
 */
const BATCH_SIZE = 25

export const flushOutbox: Job = {
  name: 'flush-outbox',

  async run(now: Date): Promise<JobResult> {
    const claimed = await claimDueDeliveries({ limit: BATCH_SIZE, now })
    if (claimed.length === 0) return { handled: 0 }

    const deliveries = await loadDispatchContexts(claimed)

    for (const delivery of deliveries) {
      const dispatcher = dispatcherFor(delivery.channel)

      const outcome = !dispatcher
        ? ({ kind: 'PERMANENT', error: `no dispatcher for ${delivery.channel}` } as const)
        : !dispatcher.supports(delivery.context)
          ? ({ kind: 'PERMANENT', error: `${delivery.channel} not applicable` } as const)
          : await dispatcher.send(delivery.context)

      await completeDelivery({
        deliveryId: delivery.deliveryId,
        attempts: delivery.attempts,
        outcome,
        now,
      })
    }

    return { handled: deliveries.length }
  },
}
