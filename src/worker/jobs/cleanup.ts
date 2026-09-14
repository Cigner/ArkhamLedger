import { deleteExpiredInvitations } from '@/modules/campaigns/data/maintenance'
import { deleteExpiredActivationTokens } from '@/modules/identity/data/activation'
import { deleteStaleThrottles } from '@/lib/throttle'
import type { Job, JobResult } from '../runtime'

/**
 * Removes what has expired.
 *
 * Tokens and invitations are deleted rather than kept: an expired credential has
 * no evidential value and every copy of one is a copy that could be stolen.
 * Throttle counters go once their window is far behind, which keeps the table
 * proportional to recent activity rather than to all activity ever.
 */
const THROTTLE_RETENTION_MS = 24 * 60 * 60_000

export const cleanup: Job = {
  name: 'cleanup',

  async run(now: Date): Promise<JobResult> {
    const tokens = await deleteExpiredActivationTokens(now)
    const invitations = await deleteExpiredInvitations(now)
    const throttles = await deleteStaleThrottles(new Date(now.getTime() - THROTTLE_RETENTION_MS))

    return { handled: tokens + invitations + throttles }
  },
}
