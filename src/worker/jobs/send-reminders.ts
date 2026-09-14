import { db } from '@/db/client'
import { enqueueNotifications } from '@/modules/notifications/data/notifications'
import { findPendingReminders } from '@/modules/notifications/data/nudges'
import type { Job, JobResult } from '../runtime'

/**
 * Nudges the people a session is still waiting on.
 *
 * Once each, a day and a half before the deadline. Late enough that the
 * reminder is about something imminent rather than something abstract, early
 * enough that answering it is still useful. A second reminder would be nagging,
 * and the query will not produce one.
 */
const HORIZON_MS = 36 * 60 * 60_000

export const sendReminders: Job = {
  name: 'send-reminders',

  async run(now: Date): Promise<JobResult> {
    const pending = await findPendingReminders({ now, horizonMs: HORIZON_MS })
    if (pending.length === 0) return { handled: 0 }

    await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: pending.map((reminder) => ({
          userId: reminder.userId,
          type: 'AVAILABILITY_REMINDER' as const,
          campaignId: reminder.campaignId,
          gameSessionId: reminder.sessionId,
          payload: {
            campaignName: reminder.campaignName,
            sessionTitle: reminder.sessionTitle,
            deadlineUtc: reminder.deadline.toISOString(),
            timezone: reminder.timezone,
          },
        })),
        now,
        executor: tx,
      }),
    )

    return { handled: pending.length }
  },
}
