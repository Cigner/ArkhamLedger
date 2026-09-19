import { db } from '@/db/client'
import { enqueueNotifications } from '@/modules/notifications/data/notifications'
import {
  filterAlreadyNotified,
  findMissingAssignments,
  listKeeperIds,
} from '@/modules/notifications/data/nudges'
import type { Job, JobResult } from '../runtime'

/**
 * Tells a Keeper who has not picked a character yet.
 *
 * Section 21 asks for this and section 12 is the reason: starting a session
 * refuses while somebody who plays a character has not been given one, which is
 * a correct check discovered at the worst possible moment - with everybody
 * already sitting down. A day beforehand it is a question somebody can answer.
 *
 * Once per session per Keeper. The second copy would say exactly what the first
 * one said.
 */
const HORIZON_MS = 24 * 60 * 60_000

export const missingAssignments: Job = {
  name: 'missing-assignments',

  async run(now: Date): Promise<JobResult> {
    const missing = await findMissingAssignments({ now, horizonMs: HORIZON_MS })
    if (missing.length === 0) return { handled: 0 }

    const sessions = new Map<string, typeof missing>()
    for (const row of missing) {
      sessions.set(row.sessionId, [...(sessions.get(row.sessionId) ?? []), row])
    }

    let handled = 0

    for (const [sessionId, rows] of sessions) {
      const first = rows[0]
      if (!first) continue

      const keepers = await filterAlreadyNotified({
        userIds: await listKeeperIds(first.campaignId),
        gameSessionId: sessionId,
        type: 'SESSION_ASSIGNMENT_MISSING',
      })
      if (keepers.length === 0) continue

      await db.transaction((tx) =>
        enqueueNotifications({
          drafts: keepers.map((userId) => ({
            userId,
            type: 'SESSION_ASSIGNMENT_MISSING' as const,
            campaignId: first.campaignId,
            gameSessionId: sessionId,
            payload: {
              sessionTitle: first.sessionTitle,
              players: rows.map((row) => row.playerName).join(', '),
            },
          })),
          now,
          executor: tx,
        }),
      )

      handled += keepers.length
    }

    return { handled }
  },
}
