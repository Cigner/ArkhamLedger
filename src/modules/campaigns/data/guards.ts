import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { campaign, campaignMember } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import type { AuthenticatedUser } from '@/lib/auth'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { roleAtLeast } from '../domain/rules'
import type { CampaignRole, CampaignStatus, Membership } from '../domain/types'

/**
 * Campaign-scoped authorization.
 *
 * This is the boundary. Every read and every mutation that touches a campaign
 * passes through one of these, inside the data layer, rather than relying on a
 * layout or a route having checked first — a Server Action is a public endpoint
 * and may be called directly.
 *
 * Non-membership is reported as NOT FOUND, never as forbidden. A 403 would make
 * campaign existence discoverable by walking identifiers, which leaks who is
 * playing what with whom.
 */
export type CampaignContext = {
  readonly user: AuthenticatedUser
  readonly membership: Membership
  readonly status: CampaignStatus
}

export async function requireCampaignMember(
  campaignId: string,
  minimumRole: CampaignRole = 'INVESTIGATOR',
  executor: DbOrTx = db,
): Promise<CampaignContext> {
  const user = await requireUser()

  const row = await executor
    .select({
      ownerId: campaign.ownerId,
      status: campaign.status,
      role: campaignMember.role,
      memberStatus: campaignMember.status,
    })
    .from(campaign)
    .innerJoin(
      campaignMember,
      and(eq(campaignMember.campaignId, campaign.id), eq(campaignMember.userId, user.id)),
    )
    .where(and(eq(campaign.id, campaignId), isNull(campaign.deletedAt)))
    .limit(1)
    .then((rows) => rows[0])

  if (!row || row.memberStatus !== 'ACTIVE') throw new NotFoundError()

  const membership: Membership = {
    campaignId,
    userId: user.id,
    role: row.role,
    isOwner: row.ownerId === user.id,
  }

  if (!roleAtLeast(membership.role, minimumRole)) {
    securityLogger.warn(
      { userId: user.id, campaignId, role: membership.role, minimumRole },
      'campaign role insufficient',
    )
    throw new ForbiddenError()
  }

  return { user, membership, status: row.status }
}

/** Shorthand for operations only a Keeper may perform. */
export function requireKeeper(campaignId: string, executor: DbOrTx = db): Promise<CampaignContext> {
  return requireCampaignMember(campaignId, 'KEEPER', executor)
}

/**
 * Requires the campaign's owner.
 *
 * Ownership is an attribute rather than a role, so it is checked after
 * membership rather than folded into the role ranking.
 */
export async function requireOwner(
  campaignId: string,
  executor: DbOrTx = db,
): Promise<CampaignContext> {
  const context = await requireCampaignMember(campaignId, 'KEEPER', executor)

  if (!context.membership.isOwner) {
    securityLogger.warn({ userId: context.user.id, campaignId }, 'owner-only action denied')
    throw new ForbiddenError()
  }

  return context
}
