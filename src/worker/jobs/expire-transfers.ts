import { db } from '@/db/client'
import { announceToUser } from '@/modules/notifications/data/announce'
import { expirePendingTransfers, findTransfer } from '@/modules/investigators/data/transfers'
import type { Job, JobResult } from '../runtime'

/**
 * Lapses transfer requests nobody answered.
 *
 * A question left open forever is one the asker has stopped expecting an answer
 * to, and while it waits the character cannot be offered to anybody else. Both
 * parties are told, because the silence was the request's whole problem.
 */
export const expireTransfers: Job = {
  name: 'expire-transfers',

  async run(now: Date): Promise<JobResult> {
    const expired = await db.transaction((tx) => expirePendingTransfers({ now, executor: tx }))

    for (const transferId of expired) {
      const transfer = await findTransfer(transferId)

      await db.transaction(async (tx) => {
        for (const userId of [transfer.fromOwnerId, transfer.toOwnerId]) {
          await announceToUser({
            userId,
            type: 'INVESTIGATOR_TRANSFER_EXPIRED',
            campaignId: transfer.campaignId,
            payload: {
              investigatorId: transfer.sourceInvestigatorId,
              ...(transfer.investigatorName === null
                ? {}
                : { investigatorName: transfer.investigatorName }),
            },
            now,
            executor: tx,
          })
        }
      })
    }

    return { handled: expired.length }
  },
}
