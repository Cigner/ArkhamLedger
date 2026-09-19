import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  campaign,
  campaignInvestigator,
  campaignMember,
  investigator,
  investigatorAccessGrant,
  investigatorEditGrant,
} from '@/db/schema'
import { requireUser } from '@/lib/auth'
import type { AuthenticatedUser } from '@/lib/auth'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import {
  type InvestigatorOperation,
  type InvestigatorRole,
  editGrantRemainsOpen,
  permits,
  resolveRole,
} from '../domain/access'
import type { InvestigatorStatus } from '../domain/lifecycle'

/**
 * Investigator-scoped authorization.
 *
 * A character is not owned by a campaign, so this cannot delegate to the
 * campaign guards the way sessions do. The viewer's standing is assembled from
 * three independent facts - ownership, an open creator grant, and membership of
 * a campaign the character is linked to - and the domain decides what that adds
 * up to.
 *
 * A viewer with no standing at all is told NOT FOUND rather than forbidden.
 * Character identifiers are handed out in campaigns, and a 403 would let anybody
 * confirm that a given sheet exists and belongs to somebody.
 */
export type InvestigatorContext = {
  readonly user: AuthenticatedUser
  readonly investigatorId: string
  readonly ownerId: string
  readonly role: InvestigatorRole
  readonly status: InvestigatorStatus
  readonly firstUsedAt: Date | null
  readonly archivedAt: Date | null
}

async function loadInvestigator(investigatorId: string, executor: DbOrTx) {
  const row = await executor
    .select({
      ownerId: investigator.ownerId,
      status: investigator.status,
      firstUsedAt: investigator.firstUsedAt,
      archivedAt: investigator.archivedAt,
    })
    .from(investigator)
    .where(eq(investigator.id, investigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()
  return row
}

/**
 * The campaigns this character is in that the viewer is also in.
 *
 * Unlinked bindings are excluded: removing a character from a campaign ends the
 * live access of everyone in it, and what they keep afterwards is the disclosure
 * captured at that moment rather than a continuing view.
 */
async function loadCampaignStanding(
  investigatorId: string,
  viewerId: string,
  executor: DbOrTx,
): Promise<{ keeps: boolean; plays: boolean }> {
  const rows = await executor
    .select({ role: campaignMember.role })
    .from(campaignInvestigator)
    .innerJoin(campaign, eq(campaign.id, campaignInvestigator.campaignId))
    .innerJoin(
      campaignMember,
      and(
        eq(campaignMember.campaignId, campaignInvestigator.campaignId),
        eq(campaignMember.userId, viewerId),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(campaignInvestigator.investigatorId, investigatorId),
        isNull(campaignInvestigator.unlinkedAt),
        isNull(campaign.deletedAt),
      ),
    )

  return {
    keeps: rows.some((row) => row.role === 'KEEPER'),
    plays: rows.length > 0,
  }
}

/**
 * Whether the viewer is the Keeper who made this sheet, before its first use.
 *
 * The grant is only worth anything while its Keeper still keeps the campaign it
 * was granted in: a Keeper who has left should not keep editing a character they
 * made for somebody in a game they no longer run.
 */
async function hasOpenEditGrant(
  investigatorId: string,
  viewerId: string,
  firstUsedAt: Date | null,
  executor: DbOrTx,
): Promise<boolean> {
  const row = await executor
    .select({ closedAt: investigatorEditGrant.closedAt, role: campaignMember.role })
    .from(investigatorEditGrant)
    .innerJoin(
      campaignMember,
      and(
        eq(campaignMember.campaignId, investigatorEditGrant.campaignId),
        eq(campaignMember.userId, investigatorEditGrant.keeperId),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(investigatorEditGrant.investigatorId, investigatorId),
        eq(investigatorEditGrant.keeperId, viewerId),
        isNull(investigatorEditGrant.closedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!row) return false

  return editGrantRemainsOpen({
    closedAt: row.closedAt,
    keeperStillKeepsCampaign: row.role === 'KEEPER',
    investigatorFirstUsedAt: firstUsedAt,
  })
}

/** Whether anything was ever disclosed to this viewer, which never expires. */
async function hasHistoricalAccess(
  investigatorId: string,
  viewerId: string,
  executor: DbOrTx,
): Promise<boolean> {
  const row = await executor
    .select({ id: investigatorAccessGrant.id })
    .from(investigatorAccessGrant)
    .where(
      and(
        eq(investigatorAccessGrant.investigatorId, investigatorId),
        eq(investigatorAccessGrant.viewerId, viewerId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  return row !== undefined
}

export async function requireInvestigatorAccess(
  investigatorId: string,
  operation: InvestigatorOperation,
  executor: DbOrTx = db,
): Promise<InvestigatorContext> {
  const user = await requireUser()
  const row = await loadInvestigator(investigatorId, executor)

  const standing = await loadCampaignStanding(investigatorId, user.id, executor)
  const grant =
    user.id === row.ownerId
      ? false
      : await hasOpenEditGrant(investigatorId, user.id, row.firstUsedAt, executor)
  const historical =
    standing.plays || user.id === row.ownerId
      ? false
      : await hasHistoricalAccess(investigatorId, user.id, executor)

  const role = resolveRole({
    viewerId: user.id,
    ownerId: row.ownerId,
    hasOpenEditGrant: grant,
    keepsLinkedCampaign: standing.keeps,
    playsLinkedCampaign: standing.plays,
    hasHistoricalAccess: historical,
  })

  if (role === null) throw new NotFoundError()

  if (!permits(role, operation)) {
    securityLogger.warn(
      { userId: user.id, investigatorId, role, operation },
      'investigator operation denied',
    )
    throw new ForbiddenError()
  }

  return {
    user,
    investigatorId,
    ownerId: row.ownerId,
    role,
    status: row.status,
    firstUsedAt: row.firstUsedAt,
    archivedAt: row.archivedAt,
  }
}

/**
 * The viewer's standing toward a character, without refusing them.
 *
 * For places that draw something about several characters at once and must skip
 * the ones this reader has no business seeing rather than failing the page - a
 * session summary listing everyone who was there, for instance. Null means no
 * standing at all, which is the same answer the guard turns into NOT FOUND.
 */
export async function resolveInvestigatorRole(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<InvestigatorRole | null> {
  try {
    const context = await requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT', executor)
    return context.role
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return null
    throw error
  }
}
