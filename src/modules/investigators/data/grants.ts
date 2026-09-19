import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { investigatorEditGrant } from '@/db/schema'
import { newId } from '@/lib/ids'

/**
 * The creating Keeper's temporary right to edit.
 *
 * A grant exists so a Keeper can make a character for somebody who has not
 * arrived yet. It is deliberately hard to keep: it closes at the character's
 * first use and never reopens, so the arrangement cannot quietly become a Keeper
 * who edits a player's sheet indefinitely.
 */
export async function openEditGrant(input: {
  investigatorId: string
  campaignId: string
  keeperId: string
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const id = newId()

  await input.executor.insert(investigatorEditGrant).values({
    id,
    investigatorId: input.investigatorId,
    campaignId: input.campaignId,
    keeperId: input.keeperId,
    grantedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  })

  return id
}

/**
 * Closes every open grant on a character, and says how many there were.
 *
 * Called when the character is first played. The count is returned rather than
 * discarded because it decides whether anybody needs telling: closing nothing is
 * the ordinary case, and a notification about it would be noise.
 */
export async function closeEditGrants(input: {
  investigatorId: string
  reason: string
  now: Date
  executor: DbOrTx
}): Promise<{ keeperIds: string[] }> {
  const open = await input.executor
    .select({ id: investigatorEditGrant.id, keeperId: investigatorEditGrant.keeperId })
    .from(investigatorEditGrant)
    .where(
      and(
        eq(investigatorEditGrant.investigatorId, input.investigatorId),
        isNull(investigatorEditGrant.closedAt),
      ),
    )

  if (open.length === 0) return { keeperIds: [] }

  await input.executor
    .update(investigatorEditGrant)
    .set({ closedAt: input.now, closedReason: input.reason, updatedAt: input.now })
    .where(
      and(
        eq(investigatorEditGrant.investigatorId, input.investigatorId),
        isNull(investigatorEditGrant.closedAt),
      ),
    )

  return { keeperIds: open.map((grant) => grant.keeperId) }
}
