import 'server-only'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorProfile,
  investigatorTransfer,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { alias } from 'drizzle-orm/mysql-core'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type { TransferStatus } from '../domain/transfer'

/**
 * Requests to hand a character over.
 *
 * A request is a question asked of the current owner, so it is a row rather
 * than an operation: it waits, it can be withdrawn, and it lapses. Only
 * accepting it does anything to the character.
 */
export type TransferRecord = {
  readonly id: string
  readonly campaignId: string
  readonly sourceInvestigatorId: string
  readonly investigatorName: string | null
  readonly fromOwnerId: string
  readonly fromOwnerName: string
  readonly toOwnerId: string
  readonly toOwnerName: string
  readonly status: TransferStatus
  readonly reason: string | null
  readonly expiresAt: Date
  readonly createdAt: Date
}

export async function createTransferRequest(input: {
  campaignId: string
  investigatorId: string
  fromOwnerId: string
  toOwnerId: string
  requestedBy: string
  reason: string | null
  expiresAt: Date
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const id = newId()

  await input.executor.insert(investigatorTransfer).values({
    id,
    campaignId: input.campaignId,
    sourceInvestigatorId: input.investigatorId,
    fromOwnerId: input.fromOwnerId,
    toOwnerId: input.toOwnerId,
    requestedBy: input.requestedBy,
    status: 'PENDING',
    reason: input.reason,
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  })

  return id
}

export async function findTransfer(
  transferId: string,
  executor: DbOrTx = db,
): Promise<TransferRecord> {
  const row = await selectTransfers(executor)
    .where(eq(investigatorTransfer.id, transferId))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()
  return row
}

/**
 * The request currently waiting on this character's owner, if there is one.
 *
 * Returns the row rather than a flag, because the two callers want different
 * things from it: asking refuses when one exists, and a forced move withdraws
 * it.
 */
export async function findPendingTransfer(input: {
  investigatorId: string
  executor?: DbOrTx
}): Promise<{ id: string } | null> {
  const row = await (input.executor ?? db)
    .select({ id: investigatorTransfer.id })
    .from(investigatorTransfer)
    .where(
      and(
        eq(investigatorTransfer.sourceInvestigatorId, input.investigatorId),
        eq(investigatorTransfer.status, 'PENDING'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  return row ?? null
}

/** Whether this character is already in the middle of changing hands. */
export async function hasPendingTransfer(input: {
  investigatorId: string
  executor?: DbOrTx
}): Promise<boolean> {
  return (await findPendingTransfer(input)) !== null
}

/** Requests waiting on one person's answer. */
export async function listIncomingTransfers(
  ownerId: string,
  executor: DbOrTx = db,
): Promise<TransferRecord[]> {
  return selectTransfers(executor)
    .where(
      and(
        eq(investigatorTransfer.fromOwnerId, ownerId),
        eq(investigatorTransfer.status, 'PENDING'),
      ),
    )
    .orderBy(desc(investigatorTransfer.createdAt))
}

/** Everything that has ever happened to this character's ownership. */
export async function listTransfersFor(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<TransferRecord[]> {
  return selectTransfers(executor)
    .where(eq(investigatorTransfer.sourceInvestigatorId, investigatorId))
    .orderBy(desc(investigatorTransfer.createdAt))
}

export async function settleTransfer(input: {
  transferId: string
  status: Exclude<TransferStatus, 'PENDING'>
  continuationInvestigatorId?: string | null
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const [result] = await input.executor
    .update(investigatorTransfer)
    .set({
      status: input.status,
      continuationInvestigatorId: input.continuationInvestigatorId ?? null,
      decidedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(investigatorTransfer.id, input.transferId),
        eq(investigatorTransfer.status, 'PENDING'),
      ),
    )

  return result.affectedRows === 1
}

/**
 * Lapses every request nobody answered.
 *
 * Run by the worker. A question left open forever is one the asker eventually
 * forgets they asked, and the character stays locked out of any other transfer
 * while it waits.
 */
/**
 * Records which branch a transfer produced.
 *
 * Separate from settling, and unconditional. Settling claims the request by
 * moving it out of PENDING, which is what stops two people accepting at once;
 * by the time the branch exists the request is no longer pending, so a second
 * conditional update would silently do nothing.
 */
export async function attachContinuation(input: {
  transferId: string
  continuationInvestigatorId: string
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(investigatorTransfer)
    .set({
      continuationInvestigatorId: input.continuationInvestigatorId,
      updatedAt: input.now,
    })
    .where(eq(investigatorTransfer.id, input.transferId))
}

export async function expirePendingTransfers(input: {
  now: Date
  executor?: DbOrTx
}): Promise<string[]> {
  const executor = input.executor ?? db

  const due = await executor
    .select({ id: investigatorTransfer.id })
    .from(investigatorTransfer)
    .where(
      and(
        eq(investigatorTransfer.status, 'PENDING'),
        lte(investigatorTransfer.expiresAt, input.now),
      ),
    )

  if (due.length === 0) return []

  await executor
    .update(investigatorTransfer)
    .set({ status: 'EXPIRED', decidedAt: input.now, updatedAt: input.now })
    .where(
      inArray(
        investigatorTransfer.id,
        due.map((row) => row.id),
      ),
    )

  return due.map((row) => row.id)
}

/**
 * Moves the campaign's binding and its future sessions onto the new branch.
 *
 * Only this campaign, and only sessions that have not started. A session that
 * was played was played by the character as it was then, and rewriting its
 * assignment would change what history says happened.
 */
export async function redirectToBranch(input: {
  campaignId: string
  sourceInvestigatorId: string
  branchInvestigatorId: string
  newOwnerId: string
  now: Date
  executor: DbOrTx
}): Promise<{ bindingId: string; reassignedSessions: number }> {
  await input.executor
    .update(campaignInvestigator)
    .set({ unlinkedAt: input.now, unlinkReason: 'TRANSFERRED', updatedAt: input.now })
    .where(
      and(
        eq(campaignInvestigator.campaignId, input.campaignId),
        eq(campaignInvestigator.investigatorId, input.sourceInvestigatorId),
      ),
    )

  const bindingId = newId()
  await input.executor.insert(campaignInvestigator).values({
    id: bindingId,
    campaignId: input.campaignId,
    investigatorId: input.branchInvestigatorId,
    linkedBy: input.newOwnerId,
    linkedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  })

  const upcoming = await input.executor
    .select({
      assignmentId: sessionInvestigatorAssignment.id,
      participantId: sessionParticipant.id,
      userId: sessionParticipant.userId,
    })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .innerJoin(gameSession, eq(gameSession.id, sessionParticipant.gameSessionId))
    .where(
      and(
        eq(sessionInvestigatorAssignment.investigatorId, input.sourceInvestigatorId),
        eq(gameSession.campaignId, input.campaignId),
        inArray(gameSession.status, ['DRAFT', 'COLLECTING', 'PROPOSED', 'SCHEDULED']),
      ),
    )

  /*
   * Only where the new owner is the one sitting in that seat. An upcoming
   * session that still lists the previous player keeps pointing at the branch
   * they own, because a character cannot be played by somebody it does not
   * belong to.
   */
  const transferable = upcoming.filter((row) => row.userId === input.newOwnerId)

  if (transferable.length > 0) {
    await input.executor
      .update(sessionInvestigatorAssignment)
      .set({
        investigatorId: input.branchInvestigatorId,
        campaignInvestigatorId: bindingId,
        updatedAt: input.now,
      })
      .where(
        inArray(
          sessionInvestigatorAssignment.id,
          transferable.map((row) => row.assignmentId),
        ),
      )
  }

  /*
   * Assignments still pointing at the old branch belong to somebody who no
   * longer owns it. They are cleared rather than left dangling, so the Keeper
   * is told that seat is empty instead of discovering it at the table.
   */
  const orphaned = upcoming.filter((row) => row.userId !== input.newOwnerId)
  if (orphaned.length > 0) {
    await input.executor.delete(sessionInvestigatorAssignment).where(
      inArray(
        sessionInvestigatorAssignment.id,
        orphaned.map((row) => row.assignmentId),
      ),
    )
  }

  return { bindingId, reassignedSessions: transferable.length }
}

/*
 * Both owners come from the same table, so one of them needs a real alias.
 * Spreading the table object looks like one and is not: the query would join
 * `auth_user` once and report the same name twice.
 */
const toOwner = alias(authUser, 'to_owner')

function selectTransfers(executor: DbOrTx) {
  const fromOwner = alias(authUser, 'from_owner')

  return executor
    .select({
      id: investigatorTransfer.id,
      campaignId: investigatorTransfer.campaignId,
      sourceInvestigatorId: investigatorTransfer.sourceInvestigatorId,
      investigatorName: investigatorProfile.name,
      fromOwnerId: investigatorTransfer.fromOwnerId,
      fromOwnerName: fromOwner.name,
      toOwnerId: investigatorTransfer.toOwnerId,
      toOwnerName: toOwner.name,
      status: investigatorTransfer.status,
      reason: investigatorTransfer.reason,
      expiresAt: investigatorTransfer.expiresAt,
      createdAt: investigatorTransfer.createdAt,
    })
    .from(investigatorTransfer)
    .innerJoin(investigator, eq(investigator.id, investigatorTransfer.sourceInvestigatorId))
    .leftJoin(investigatorProfile, eq(investigatorProfile.investigatorId, investigator.id))
    .innerJoin(fromOwner, eq(fromOwner.id, investigatorTransfer.fromOwnerId))
    .innerJoin(toOwner, eq(toOwner.id, investigatorTransfer.toOwnerId))
}
