import 'server-only'
import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  campaign,
  campaignInvestigator,
  campaignMember,
  gameSession,
  investigator,
  investigatorFieldVisibility,
  investigatorProfile,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { requireUser } from '@/lib/auth'
import { requireCampaignMember } from '@/modules/campaigns/data/guards'
import type { InvestigatorStatus } from '../domain/lifecycle'

/**
 * Characters as a campaign sees them.
 *
 * The summary is deliberately thin. A campaign list answers "who is at this
 * table", and the sheets themselves are read one at a time through the guard
 * that knows who is asking - so a Keeper opening this page never receives
 * everybody's private fields in a payload they did not ask for.
 *
 * The name is the one field that has to be resolved against privacy here, since
 * it is the only thing the list shows. A character whose owner has hidden it is
 * listed without one rather than omitted: the party can see that somebody is
 * playing, which is not a secret, without being told who.
 */
export type CampaignInvestigatorSummary = {
  readonly investigatorId: string
  readonly name: string | null
  readonly nameHidden: boolean
  readonly ownerId: string
  readonly ownerName: string
  readonly status: InvestigatorStatus
  readonly isDraft: boolean
  readonly linkedAt: Date
  readonly viewerOwns: boolean
}

export async function listCampaignInvestigators(
  campaignId: string,
): Promise<CampaignInvestigatorSummary[]> {
  const context = await requireCampaignMember(campaignId)
  const isKeeper = context.membership.role === 'KEEPER'

  const rows = await db
    .select({
      investigatorId: investigator.id,
      name: investigatorProfile.name,
      ownerId: investigator.ownerId,
      ownerName: authUser.name,
      status: investigator.status,
      linkedAt: campaignInvestigator.linkedAt,
    })
    .from(campaignInvestigator)
    .innerJoin(investigator, eq(investigator.id, campaignInvestigator.investigatorId))
    .innerJoin(authUser, eq(authUser.id, investigator.ownerId))
    .leftJoin(investigatorProfile, eq(investigatorProfile.investigatorId, investigator.id))
    .where(
      and(
        eq(campaignInvestigator.campaignId, campaignId),
        isNull(campaignInvestigator.unlinkedAt),
        isNull(investigator.archivedAt),
      ),
    )
    .orderBy(asc(authUser.name), asc(campaignInvestigator.linkedAt))

  const hiddenNames = await namesHiddenFrom(
    rows.map((row) => row.investigatorId),
    db,
  )

  return rows.map((row) => {
    const hidden =
      !isKeeper && row.ownerId !== context.user.id && hiddenNames.has(row.investigatorId)

    return {
      investigatorId: row.investigatorId,
      name: hidden ? null : row.name,
      nameHidden: hidden,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      status: row.status,
      isDraft: row.status === 'DRAFT',
      linkedAt: row.linkedAt,
      viewerOwns: row.ownerId === context.user.id,
    }
  })
}

/**
 * Which of these characters have hidden their name from the other players.
 *
 * One query for the whole list. The name is the only field this list shows, so
 * this asks about that key alone rather than resolving every character's full
 * visibility map to read one entry out of it.
 */
async function namesHiddenFrom(
  investigatorIds: readonly string[],
  executor: DbOrTx,
): Promise<ReadonlySet<string>> {
  if (investigatorIds.length === 0) return new Set()

  const rows = await executor
    .select({ investigatorId: investigatorFieldVisibility.investigatorId })
    .from(investigatorFieldVisibility)
    .where(
      and(
        inArray(investigatorFieldVisibility.investigatorId, [...investigatorIds]),
        eq(investigatorFieldVisibility.fieldKey, 'identity.name'),
        eq(investigatorFieldVisibility.visibility, 'HIDDEN'),
      ),
    )

  return new Set(rows.map((row) => row.investigatorId))
}

/**
 * The viewer's own characters, for choosing one to bring to a campaign.
 *
 * Only ever the caller's own, and it reads the caller from the session rather
 * than taking an identifier. A parameter here would be a Vault listing that
 * points wherever it is told to: correct at every call site today and one
 * careless argument away from handing somebody else's characters over. Section
 * 11 of the plan is the reason a campaign never learns what else somebody has
 * written.
 */
export async function listOwnInvestigators(executor: DbOrTx = db): Promise<
  {
    investigatorId: string
    name: string | null
    status: InvestigatorStatus
    linkedCampaignIds: string[]
  }[]
> {
  const user = await requireUser()

  const rows = await executor
    .select({
      investigatorId: investigator.id,
      name: investigatorProfile.name,
      status: investigator.status,
      createdAt: investigator.createdAt,
    })
    .from(investigator)
    .leftJoin(investigatorProfile, eq(investigatorProfile.investigatorId, investigator.id))
    .where(and(eq(investigator.ownerId, user.id), isNull(investigator.archivedAt)))
    .orderBy(desc(investigator.createdAt))

  if (rows.length === 0) return []

  const bindings = await executor
    .select({
      investigatorId: campaignInvestigator.investigatorId,
      campaignId: campaignInvestigator.campaignId,
    })
    .from(campaignInvestigator)
    .where(
      and(
        inArray(
          campaignInvestigator.investigatorId,
          rows.map((row) => row.investigatorId),
        ),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )

  return rows.map((row) => ({
    investigatorId: row.investigatorId,
    name: row.name,
    status: row.status,
    linkedCampaignIds: bindings
      .filter((binding) => binding.investigatorId === row.investigatorId)
      .map((binding) => binding.campaignId),
  }))
}

export async function findActiveBinding(input: {
  investigatorId: string
  campaignId: string
  executor?: DbOrTx
}): Promise<{ id: string } | null> {
  const executor = input.executor ?? db

  const row = await executor
    .select({ id: campaignInvestigator.id })
    .from(campaignInvestigator)
    .where(
      and(
        eq(campaignInvestigator.investigatorId, input.investigatorId),
        eq(campaignInvestigator.campaignId, input.campaignId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  return row ?? null
}

/**
 * Brings a character into a campaign.
 *
 * Re-links rather than duplicates when the character was in this campaign
 * before: the unique index on the pair says a binding is a relationship, not an
 * event, and its history lives in the disclosures taken when it ended.
 */
export async function linkInvestigator(input: {
  investigatorId: string
  campaignId: string
  linkedBy: string
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const existing = await input.executor
    .select({ id: campaignInvestigator.id })
    .from(campaignInvestigator)
    .where(
      and(
        eq(campaignInvestigator.investigatorId, input.investigatorId),
        eq(campaignInvestigator.campaignId, input.campaignId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (existing) {
    await input.executor
      .update(campaignInvestigator)
      .set({
        unlinkedAt: null,
        unlinkReason: null,
        linkedBy: input.linkedBy,
        linkedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(campaignInvestigator.id, existing.id))

    return existing.id
  }

  const id = newId()

  await input.executor.insert(campaignInvestigator).values({
    id,
    campaignId: input.campaignId,
    investigatorId: input.investigatorId,
    linkedBy: input.linkedBy,
    linkedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  })

  return id
}

/** Active members of a campaign who could be given a character. */
export async function listCampaignPlayers(
  campaignId: string,
  executor: DbOrTx = db,
): Promise<{ userId: string; name: string; isKeeper: boolean }[]> {
  const rows = await executor
    .select({
      userId: campaignMember.userId,
      name: authUser.name,
      role: campaignMember.role,
    })
    .from(campaignMember)
    .innerJoin(authUser, eq(authUser.id, campaignMember.userId))
    .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.status, 'ACTIVE')))
    .orderBy(asc(authUser.name))

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    isKeeper: row.role === 'KEEPER',
  }))
}

/**
 * The session currently holding this character, if any.
 *
 * One sheet cannot be played at two tables at once, so starting a session asks
 * this first. Only a session that has actually started counts: two scheduled
 * games with the same character are a plan, not a conflict, and plans change.
 */
export async function findLiveSessionFor(input: {
  investigatorId: string
  exceptSessionId?: string
  executor?: DbOrTx
}): Promise<{ sessionId: string; title: string } | null> {
  const executor = input.executor ?? db

  const rows = await executor
    .select({ sessionId: gameSession.id, title: gameSession.title })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .innerJoin(gameSession, eq(gameSession.id, sessionParticipant.gameSessionId))
    .where(
      and(
        eq(sessionInvestigatorAssignment.investigatorId, input.investigatorId),
        eq(gameSession.status, 'IN_PROGRESS'),
      ),
    )

  const conflicting = rows.find((row) => row.sessionId !== input.exceptSessionId)
  return conflicting ?? null
}

/**
 * Every character currently attached to a campaign, across the whole
 * deployment.
 *
 * Administrators only, and not guarded here: the admin route's own guard runs
 * first, and a read that authorized itself would have to know about a role this
 * module otherwise has no opinion on.
 *
 * It exists for one operation - moving a character whose owner has stopped
 * answering - so it carries exactly what that decision needs and nothing about
 * what is on any sheet.
 */
export async function listAllActiveBindings(executor: DbOrTx = db): Promise<
  {
    investigatorId: string
    investigatorName: string | null
    ownerId: string
    ownerName: string
    campaignId: string
    campaignName: string
  }[]
> {
  const rows = await executor
    .select({
      investigatorId: investigator.id,
      investigatorName: investigatorProfile.name,
      ownerId: investigator.ownerId,
      ownerName: authUser.name,
      campaignId: campaignInvestigator.campaignId,
      campaignName: campaign.name,
    })
    .from(campaignInvestigator)
    .innerJoin(investigator, eq(investigator.id, campaignInvestigator.investigatorId))
    .innerJoin(authUser, eq(authUser.id, investigator.ownerId))
    .innerJoin(campaign, eq(campaign.id, campaignInvestigator.campaignId))
    .leftJoin(investigatorProfile, eq(investigatorProfile.investigatorId, investigator.id))
    .where(and(isNull(campaignInvestigator.unlinkedAt), isNull(campaign.deletedAt)))
    .orderBy(asc(campaign.name), asc(authUser.name))

  /*
   * A name the owner has hidden stays hidden here too. Section 17 gives an
   * administrator no ordinary access to a character, and this page exists to
   * decide who holds one rather than to read it - the owner and the campaign
   * are what a recovery needs.
   */
  const hidden = await namesHiddenFrom(
    rows.map((row) => row.investigatorId),
    executor,
  )

  return rows.map((row) => ({
    ...row,
    investigatorName: hidden.has(row.investigatorId) ? null : row.investigatorName,
  }))
}

/**
 * When the session this character is currently being played in started.
 *
 * Used to anchor the Sanity rules' in-game day. Null when the character is not
 * at a table, which is the ordinary case for a sheet somebody is tidying up
 * between games.
 */
export async function findLiveSessionStart(input: {
  investigatorId: string
  executor?: DbOrTx
}): Promise<Date | null> {
  const executor = input.executor ?? db

  const row = await executor
    .select({ startedAt: gameSession.startedAt })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .innerJoin(gameSession, eq(gameSession.id, sessionParticipant.gameSessionId))
    .where(
      and(
        eq(sessionInvestigatorAssignment.investigatorId, input.investigatorId),
        eq(gameSession.status, 'IN_PROGRESS'),
      ),
    )
    .orderBy(desc(gameSession.startedAt))
    .limit(1)
    .then((rows) => rows[0])

  return row?.startedAt ?? null
}

/**
 * Campaigns a Keeper could ask for this character in.
 *
 * Section 11: a Keeper may want a character they have met in another campaign,
 * and has no standing to take it. The list is what makes an invitation possible
 * without one - every campaign here is one the caller keeps, whose table the
 * owner already sits at, and where the character is not already playing.
 *
 * The owner's membership is part of the filter rather than a later error
 * message: asking somebody to bring a character to a campaign they cannot join
 * is a request nobody can act on.
 */
export async function listCampaignsToRequestFor(input: {
  investigatorId: string
  keeperId: string
  ownerId: string
  executor?: DbOrTx
}): Promise<{ campaignId: string; name: string }[]> {
  const executor = input.executor ?? db

  if (input.keeperId === input.ownerId) return []

  const ownerMembership = alias(campaignMember, 'owner_membership')

  const rows = await executor
    .select({ campaignId: campaign.id, name: campaign.name })
    .from(campaignMember)
    .innerJoin(campaign, eq(campaign.id, campaignMember.campaignId))
    .innerJoin(
      ownerMembership,
      and(
        eq(ownerMembership.campaignId, campaign.id),
        eq(ownerMembership.userId, input.ownerId),
        eq(ownerMembership.status, 'ACTIVE'),
      ),
    )
    .leftJoin(
      campaignInvestigator,
      and(
        eq(campaignInvestigator.campaignId, campaign.id),
        eq(campaignInvestigator.investigatorId, input.investigatorId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )
    .where(
      and(
        eq(campaignMember.userId, input.keeperId),
        eq(campaignMember.role, 'KEEPER'),
        eq(campaignMember.status, 'ACTIVE'),
        /*
         * Planning counts. Gathering characters is most of what a campaign
         * does before it starts; only one that has finished is past asking.
         */
        notInArray(campaign.status, ['COMPLETED', 'ARCHIVED']),
        isNull(campaign.deletedAt),
        isNull(campaignInvestigator.id),
      ),
    )
    .orderBy(asc(campaign.name))

  return rows
}
