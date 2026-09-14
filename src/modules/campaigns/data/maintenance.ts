import 'server-only'
import { lt } from 'drizzle-orm'
import { db } from '@/db/client'
import { campaignInvitation } from '@/db/schema'

/**
 * Housekeeping the worker performs.
 *
 * Separate from the module that issues and claims invitations, because that one
 * authorizes every call and this one runs in a process with nobody to authorize.
 */
/** Housekeeping for the worker. */
export async function deleteExpiredInvitations(now: Date): Promise<number> {
  const [result] = await db
    .delete(campaignInvitation)
    .where(lt(campaignInvitation.expiresAt, now))
  return result.affectedRows
}
