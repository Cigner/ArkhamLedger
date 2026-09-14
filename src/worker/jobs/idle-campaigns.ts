import { db } from '@/db/client'
import { enqueueNotifications } from '@/modules/notifications/data/notifications'
import { findIdleCampaigns } from '@/modules/notifications/data/nudges'
import type { Job, JobResult } from '../runtime'

/**
 * Tells Keepers when a campaign has nothing in the diary.
 *
 * The quiet failure this whole application exists to prevent: campaigns rarely
 * end in a decision, they end because the evening after the last one was never
 * arranged and then too much time passed to restart.
 *
 * Weekly rather than daily, and only to the people who can act on it. A nudge
 * that arrives every morning is one people learn to filter out, which would make
 * it worse than silence.
 */
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60_000

export const idleCampaigns: Job = {
  name: 'idle-campaigns',

  async run(now: Date): Promise<JobResult> {
    const idle = await findIdleCampaigns({ now, repeatAfterMs: REPEAT_AFTER_MS })
    if (idle.length === 0) return { handled: 0 }

    await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: idle.flatMap((campaign) =>
          campaign.keeperIds.map((userId) => ({
            userId,
            type: 'NO_NEXT_SESSION' as const,
            campaignId: campaign.campaignId,
            payload: { campaignName: campaign.campaignName },
          })),
        ),
        now,
        executor: tx,
      }),
    )

    return { handled: idle.length }
  },
}
