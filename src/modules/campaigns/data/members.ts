import 'server-only'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, campaign, campaignMember } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { CampaignMemberListItem, CampaignRole, MembershipStatus } from '../domain/types'
import { requireCampaignMember } from './guards'

/**
 * Campaign membership.
 *
 * Membership is unique per (campaign, user) and its status is a lifecycle rather
 * than a row to delete. Rejoining reactivates the original record, which is what
 * preserves a returning player's availability history and past attendance.
 */
export async function listMembers(campaignId: string): Promise<CampaignMemberListItem[]> {
  await requireCampaignMember(campaignId)

  const rows = await db
    .select({
      userId: campaignMember.userId,
      name: authUser.name,
      email: authUser.email,
      role: campaignMember.role,
      joinedAt: campaignMember.joinedAt,
      ownerId: campaign.ownerId,
    })
    .from(campaignMember)
    .innerJoin(authUser, eq(authUser.id, campaignMember.userId))
    .innerJoin(campaign, eq(campaign.id, campaignMember.campaignId))
    .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.status, 'ACTIVE')))
    .orderBy(asc(campaignMember.joinedAt))

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    isOwner: row.ownerId === row.userId,
    joinedAt: row.joinedAt,
  }))
}

export async function findMembership(
  campaignId: string,
  userId: string,
  executor: DbOrTx = db,
): Promise<{ userId: string; role: CampaignRole; status: MembershipStatus } | null> {
  const row = await executor.query.campaignMember.findFirst({
    where: and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.userId, userId)),
    columns: { userId: true, role: true, status: true },
  })

  return row ?? null
}

/**
 * Adds a member, reviving a previous membership when one exists.
 *
 * Relies on the unique index over (campaign, user): two people following the
 * same shared link at once cannot produce two rows, and the second write becomes
 * an update of the first.
 */
export async function addOrReviveMember(input: {
  campaignId: string
  userId: string
  role: CampaignRole
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .insert(campaignMember)
    .values({
      id: newId(),
      campaignId: input.campaignId,
      userId: input.userId,
      role: input.role,
      status: 'ACTIVE',
      joinedAt: input.now,
      leftAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onDuplicateKeyUpdate({
      set: {
        status: 'ACTIVE',
        role: input.role,
        leftAt: null,
        joinedAt: input.now,
        updatedAt: input.now,
      },
    })
}

export async function setMembershipStatus(input: {
  campaignId: string
  userId: string
  status: Exclude<MembershipStatus, 'ACTIVE'>
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(campaignMember)
    .set({ status: input.status, leftAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(campaignMember.campaignId, input.campaignId),
        eq(campaignMember.userId, input.userId),
      ),
    )
}

export async function setMemberRole(input: {
  campaignId: string
  userId: string
  role: CampaignRole
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(campaignMember)
    .set({ role: input.role, updatedAt: input.now })
    .where(
      and(
        eq(campaignMember.campaignId, input.campaignId),
        eq(campaignMember.userId, input.userId),
      ),
    )
}

/**
 * Candidates for a personal invitation.
 *
 * Includes accounts that have not been activated yet: the invitation outlives
 * the activation link, so a Keeper can send both at once and the recipient
 * activates and joins in one sitting. They still cannot accept until their
 * account is active, which the session guard enforces on its own.
 */
export async function listInvitableUsers(campaignId: string): Promise<
  { id: string; name: string; email: string; pending: boolean }[]
> {
  await requireCampaignMember(campaignId, 'KEEPER')

  const members = await db
    .select({ userId: campaignMember.userId })
    .from(campaignMember)
    .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.status, 'ACTIVE')))

  const memberIds = new Set(members.map((member) => member.userId))

  const users = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      status: authUser.status,
    })
    .from(authUser)
    .where(
      and(
        inArray(authUser.status, ['ACTIVE', 'PENDING_ACTIVATION']),
        isNull(authUser.deletedAt),
      ),
    )
    .orderBy(asc(authUser.name))

  return users
    .filter((user) => !memberIds.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      pending: user.status === 'PENDING_ACTIVATION',
    }))
}
