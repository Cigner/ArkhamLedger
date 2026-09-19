import 'server-only'
import { and, count, eq, ne } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, investigator, investigatorProfile, investigatorTransfer } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { alias } from 'drizzle-orm/mysql-core'

/**
 * The character's own history of ownership.
 *
 * Separate from the view so it can be read without assembling a whole sheet:
 * provenance is a handful of joins about who held what, and loading nine tables
 * of characteristics to answer it would be wasteful on a page that shows none of
 * them.
 */
const creator = alias(authUser, 'creator')
const owner = alias(authUser, 'owner')
const fromOwner = alias(authUser, 'from_owner')
const toOwner = alias(authUser, 'to_owner')
const parent = alias(investigator, 'parent')
const parentProfile = alias(investigatorProfile, 'parent_profile')

export async function loadProvenance(investigatorId: string, executor: DbOrTx = db) {
  const row = await executor
    .select({
      rulesetId: investigator.rulesetId,
      rulesetVersion: investigator.rulesetVersion,
      creationMethod: investigator.creationMethod,
      createdAt: investigator.createdAt,
      lineageId: investigator.lineageId,
      creatorName: creator.name,
      ownerName: owner.name,
      branchedFromId: parent.id,
      branchedFromName: parentProfile.name,
    })
    .from(investigator)
    .innerJoin(owner, eq(owner.id, investigator.ownerId))
    .leftJoin(creator, eq(creator.id, investigator.creatorId))
    .leftJoin(parent, eq(parent.id, investigator.branchedFromId))
    .leftJoin(parentProfile, eq(parentProfile.investigatorId, parent.id))
    .where(eq(investigator.id, investigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()

  const [siblings, transfers] = await Promise.all([
    executor
      .select({ total: count() })
      .from(investigator)
      .where(and(eq(investigator.lineageId, row.lineageId), ne(investigator.id, investigatorId)))
      .then((rows) => Number(rows[0]?.total ?? 0)),
    executor
      .select({
        fromOwnerName: fromOwner.name,
        toOwnerName: toOwner.name,
        status: investigatorTransfer.status,
        decidedAt: investigatorTransfer.decidedAt,
      })
      .from(investigatorTransfer)
      .innerJoin(fromOwner, eq(fromOwner.id, investigatorTransfer.fromOwnerId))
      .innerJoin(toOwner, eq(toOwner.id, investigatorTransfer.toOwnerId))
      .where(eq(investigatorTransfer.sourceInvestigatorId, investigatorId))
      .orderBy(investigatorTransfer.createdAt),
  ])

  return {
    rulesetId: row.rulesetId,
    rulesetVersion: row.rulesetVersion,
    creationMethod: row.creationMethod,
    createdAt: row.createdAt,
    creatorName: row.creatorName,
    ownerName: row.ownerName,
    branchedFrom: row.branchedFromId
      ? { id: row.branchedFromId, name: row.branchedFromName }
      : null,
    siblings,
    transfers,
  }
}
