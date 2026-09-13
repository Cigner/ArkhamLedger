import 'server-only'
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, campaign, campaignInvitation, campaignMember } from '@/db/schema'
import { hashToken, issueToken } from '@/lib/crypto'
import { newId } from '@/lib/ids'
import { securityLogger, tokenPrefix } from '@/lib/logger'
import { INVITATION_TTL_DAYS } from '../domain/constants'
import type {
  CampaignRole,
  InvitationListItem,
  InvitationPreview,
  InvitationRejection,
} from '../domain/types'
import { requireKeeper } from './guards'

/**
 * Invitation links.
 *
 * Only the token digest is stored, so a database disclosure yields no working
 * links, and the plaintext is returned once to the Keeper who created it.
 *
 * Two shapes share one table: a personal invitation pins targetUserId and allows
 * a single use, a shared link leaves the target open with a use count. Modelling
 * them separately would duplicate the entire lifecycle for no gain.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function createInvitation(input: {
  campaignId: string
  targetUserId: string | null
  roleOnJoin: CampaignRole
  maxUses: number
  createdBy: string
  now: Date
  executor: DbOrTx
}): Promise<{ token: string; expiresAt: Date }> {
  const { plaintext, hash } = issueToken()
  const expiresAt = new Date(input.now.getTime() + INVITATION_TTL_DAYS * MS_PER_DAY)

  await input.executor.insert(campaignInvitation).values({
    id: newId(),
    campaignId: input.campaignId,
    tokenHash: hash,
    targetUserId: input.targetUserId,
    roleOnJoin: input.roleOnJoin,
    maxUses: input.maxUses,
    usedCount: 0,
    expiresAt,
    revokedAt: null,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  })

  securityLogger.info(
    {
      campaignId: input.campaignId,
      createdBy: input.createdBy,
      personal: input.targetUserId !== null,
      token: tokenPrefix(plaintext),
    },
    'campaign invitation issued',
  )

  return { token: plaintext, expiresAt }
}

export async function listActiveInvitations(campaignId: string): Promise<InvitationListItem[]> {
  await requireKeeper(campaignId)

  const rows = await db
    .select({
      id: campaignInvitation.id,
      targetUserName: authUser.name,
      roleOnJoin: campaignInvitation.roleOnJoin,
      maxUses: campaignInvitation.maxUses,
      usedCount: campaignInvitation.usedCount,
      expiresAt: campaignInvitation.expiresAt,
      createdAt: campaignInvitation.createdAt,
    })
    .from(campaignInvitation)
    .leftJoin(authUser, eq(authUser.id, campaignInvitation.targetUserId))
    .where(
      and(
        eq(campaignInvitation.campaignId, campaignId),
        isNull(campaignInvitation.revokedAt),
        gt(campaignInvitation.expiresAt, new Date()),
        lt(campaignInvitation.usedCount, campaignInvitation.maxUses),
      ),
    )
    .orderBy(desc(campaignInvitation.createdAt))

  return rows
}

export async function revokeInvitation(
  invitationId: string,
  campaignId: string,
  now: Date,
  executor: DbOrTx = db,
): Promise<void> {
  await executor
    .update(campaignInvitation)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(campaignInvitation.id, invitationId),
        eq(campaignInvitation.campaignId, campaignId),
      ),
    )
}

/**
 * Read-only look at an invitation, for the screen shown before accepting.
 *
 * Deliberately does not consume anything: a visitor must be able to see what
 * they are joining, and reload the page, without burning a use.
 */
export async function previewInvitation(
  token: string,
  viewerId: string,
  now: Date,
): Promise<InvitationPreview> {
  const row = await db.query.campaignInvitation.findFirst({
    where: eq(campaignInvitation.tokenHash, hashToken(token)),
    columns: {
      campaignId: true,
      targetUserId: true,
      roleOnJoin: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
    },
  })

  if (!row) return { ok: false, reason: 'INVALID' }

  const rejection = rejectionFor(row, viewerId, now)
  if (rejection) return { ok: false, reason: rejection }

  const campaignRow = await db.query.campaign.findFirst({
    where: and(eq(campaign.id, row.campaignId), isNull(campaign.deletedAt)),
    columns: { id: true, name: true },
  })

  if (!campaignRow) return { ok: false, reason: 'INVALID' }

  const members = await db
    .select({ userId: campaignMember.userId, role: campaignMember.role, name: authUser.name })
    .from(campaignMember)
    .innerJoin(authUser, eq(authUser.id, campaignMember.userId))
    .where(
      and(eq(campaignMember.campaignId, row.campaignId), eq(campaignMember.status, 'ACTIVE')),
    )

  return {
    ok: true,
    campaignId: campaignRow.id,
    campaignName: campaignRow.name,
    keeperNames: members.filter((member) => member.role === 'KEEPER').map((member) => member.name),
    memberCount: members.length,
    roleOnJoin: row.roleOnJoin,
    alreadyMember: members.some((member) => member.userId === viewerId),
  }
}

function rejectionFor(
  row: {
    targetUserId: string | null
    maxUses: number
    usedCount: number
    expiresAt: Date
    revokedAt: Date | null
  },
  viewerId: string,
  now: Date,
): InvitationRejection | null {
  if (row.revokedAt !== null) return 'REVOKED'
  if (row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  if (row.usedCount >= row.maxUses) return 'EXHAUSTED'
  if (row.targetUserId !== null && row.targetUserId !== viewerId) return 'NOT_FOR_YOU'
  return null
}

/**
 * Claims one use of an invitation.
 *
 * The whole decision lives in the WHERE clause of a single UPDATE, so two people
 * following the last remaining use of a shared link cannot both succeed: exactly
 * one UPDATE matches. A check based on a prior SELECT would let both through.
 *
 * Returns null when the claim did not land, without saying why — the caller
 * re-reads through previewInvitation to produce a specific message.
 */
export async function claimInvitation(
  token: string,
  viewerId: string,
  now: Date,
  executor: DbOrTx,
): Promise<{ campaignId: string; roleOnJoin: CampaignRole; invitationId: string } | null> {
  const hash = hashToken(token)

  const row = await executor.query.campaignInvitation.findFirst({
    where: eq(campaignInvitation.tokenHash, hash),
    columns: {
      id: true,
      campaignId: true,
      roleOnJoin: true,
      targetUserId: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
    },
  })

  if (!row) return null
  if (rejectionFor(row, viewerId, now) !== null) return null

  const [result] = await executor
    .update(campaignInvitation)
    .set({ usedCount: sql`${campaignInvitation.usedCount} + 1`, updatedAt: now })
    .where(
      and(
        eq(campaignInvitation.id, row.id),
        isNull(campaignInvitation.revokedAt),
        gt(campaignInvitation.expiresAt, now),
        lt(campaignInvitation.usedCount, campaignInvitation.maxUses),
      ),
    )

  if (result.affectedRows !== 1) return null

  return { campaignId: row.campaignId, roleOnJoin: row.roleOnJoin, invitationId: row.id }
}

/** Housekeeping for the worker. */
export async function deleteExpiredInvitations(now: Date): Promise<number> {
  const [result] = await db
    .delete(campaignInvitation)
    .where(lt(campaignInvitation.expiresAt, now))
  return result.affectedRows
}
