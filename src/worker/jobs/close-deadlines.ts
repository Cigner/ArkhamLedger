import { db } from '@/db/client'
import { appLogger } from '@/lib/logger'
import { enqueueNotifications } from '@/modules/notifications/data/notifications'
import { findExpiredCollections, listKeeperIds } from '@/modules/notifications/data/nudges'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { insertRun, loadSchedulingInput } from '@/modules/scheduling/data/runs'
import { transitionSession } from '@/modules/sessions/data/session-store'
import type { Job, JobResult } from '../runtime'

/**
 * Closes sessions whose answering period has run out, and ranks what came in.
 *
 * This is the promise a deadline makes. A Keeper who sets one should not have to
 * remember it, and the group should not discover a week later that the answers
 * were sitting there unread.
 *
 * Closing and ranking happen in one transaction with the notification, so a
 * crash halfway cannot leave a session closed with nobody told - the Keeper
 * would be waiting for a message that was never going to arrive.
 */
export const closeDeadlines: Job = {
  name: 'close-deadlines',

  async run(now: Date): Promise<JobResult> {
    const expired = await findExpiredCollections(now)
    let handled = 0

    for (const session of expired) {
      const keeperIds = await listKeeperIds(session.campaignId)
      const { input, params } = await loadSchedulingInput(session.sessionId)
      const output = rankCandidates(input)

      const closed = await db.transaction(async (tx) => {
        const moved = await transitionSession({
          sessionId: session.sessionId,
          from: 'COLLECTING',
          to: 'PROPOSED',
          now,
          executor: tx,
        })

        /*
         * Somebody got there first - a Keeper who closed it by hand between the
         * query and this write. Their action stands; this one does nothing.
         */
        if (!moved) return false

        await insertRun({
          sessionId: session.sessionId,
          output,
          params,
          // Nobody triggered this: the deadline did.
          triggeredBy: null,
          now,
          executor: tx,
        })

        await enqueueNotifications({
          drafts: keeperIds.map((userId) => ({
            userId,
            type: 'COLLECTION_CLOSED' as const,
            campaignId: session.campaignId,
            gameSessionId: session.sessionId,
            payload: {
              campaignName: session.campaignName,
              sessionTitle: session.title,
              timezone: session.timezone,
            },
          })),
          now,
          executor: tx,
        })

        return true
      })

      if (closed) {
        handled += 1
        appLogger.info(
          { sessionId: session.sessionId, proposals: output.ranked.length },
          'collection closed on deadline',
        )
      }
    }

    return { handled }
  },
}
