import 'server-only'
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, campaign, campaignMember, scenario } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type {
  CampaignDetail,
  CampaignListItem,
  CampaignSettings,
  CampaignStatus,
} from '../domain/types'
import { requireCampaignMember, requireKeeper } from './guards'

/**
 * Campaign queries and mutations.
 *
 * Reads are scoped by membership at the query level rather than filtered
 * afterwards: a campaign the caller does not belong to never enters the result
 * set, so there is nothing to forget to strip.
 */
export async function listMyCampaigns(): Promise<CampaignListItem[]> {
  const user = await requireUser()

  const memberCounts = db
    .select({
      campaignId: campaignMember.campaignId,
      total: count().as('total'),
    })
    .from(campaignMember)
    .where(eq(campaignMember.status, 'ACTIVE'))
    .groupBy(campaignMember.campaignId)
    .as('member_counts')

  const rows = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      ownerId: campaign.ownerId,
      role: campaignMember.role,
      scenarioName: scenario.name,
      memberCount: memberCounts.total,
    })
    .from(campaign)
    .innerJoin(
      campaignMember,
      and(
        eq(campaignMember.campaignId, campaign.id),
        eq(campaignMember.userId, user.id),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )
    .leftJoin(scenario, eq(scenario.id, campaign.scenarioId))
    .leftJoin(memberCounts, eq(memberCounts.campaignId, campaign.id))
    .where(isNull(campaign.deletedAt))
    // Archived campaigns stay reachable but sink to the bottom of the list.
    .orderBy(sql`${campaign.status} = 'ARCHIVED'`, desc(campaign.updatedAt))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    role: row.role,
    isOwner: row.ownerId === user.id,
    memberCount: Number(row.memberCount ?? 0),
    scenarioName: row.scenarioName,
  }))
}

export async function getCampaignDetail(campaignId: string): Promise<CampaignDetail> {
  const { membership } = await requireCampaignMember(campaignId)

  const row = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      timezone: campaign.timezone,
      ownerId: campaign.ownerId,
      ownerName: authUser.name,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      createdAt: campaign.createdAt,
    })
    .from(campaign)
    .innerJoin(authUser, eq(authUser.id, campaign.ownerId))
    .leftJoin(scenario, eq(scenario.id, campaign.scenarioId))
    .where(and(eq(campaign.id, campaignId), isNull(campaign.deletedAt)))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    timezone: row.timezone,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    scenario: row.scenarioId && row.scenarioName ? { id: row.scenarioId, name: row.scenarioName } : null,
    createdAt: row.createdAt,
    viewer: membership,
  }
}

export async function getCampaignSettings(campaignId: string): Promise<CampaignSettings> {
  await requireKeeper(campaignId)

  const row = await db.query.campaign.findFirst({
    where: and(eq(campaign.id, campaignId), isNull(campaign.deletedAt)),
    columns: {
      id: true,
      name: true,
      description: true,
      status: true,
      timezone: true,
      defaultMinSessionHours: true,
      defaultQuorumMode: true,
      defaultQuorumValue: true,
      scenarioId: true,
    },
  })

  if (!row) throw new NotFoundError()

  return row
}

/**
 * Creates a campaign and its owner's membership in one transaction.
 *
 * A campaign whose creator is not a member would be unreachable by its own
 * author, so the two writes cannot be allowed to come apart.
 */
export async function createCampaign(input: {
  name: string
  description?: string | undefined
  scenarioName?: string | undefined
  ownerId: string
  timezone: string
  now: Date
}): Promise<{ campaignId: string }> {
  const campaignId = newId()

  await db.transaction(async (tx) => {
    let scenarioId: string | null = null

    if (input.scenarioName) {
      scenarioId = newId()
      await tx.insert(scenario).values({
        id: scenarioId,
        campaignId,
        name: input.scenarioName,
        description: null,
        createdBy: input.ownerId,
        createdAt: input.now,
        updatedAt: input.now,
      })
    }

    await tx.insert(campaign).values({
      id: campaignId,
      name: input.name,
      description: input.description ?? null,
      ownerId: input.ownerId,
      scenarioId,
      status: 'PLANNING',
      timezone: input.timezone,
      createdAt: input.now,
      updatedAt: input.now,
    })

    await tx.insert(campaignMember).values({
      id: newId(),
      campaignId,
      userId: input.ownerId,
      role: 'KEEPER',
      status: 'ACTIVE',
      joinedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
  })

  return { campaignId }
}

export async function updateCampaign(
  campaignId: string,
  patch: { name: string; description: string | null; status: CampaignStatus; timezone: string },
  now: Date,
  executor: DbOrTx = db,
): Promise<void> {
  await executor
    .update(campaign)
    .set({ ...patch, updatedAt: now })
    .where(eq(campaign.id, campaignId))
}

/**
 * Archives a campaign.
 *
 * Sets the status only. `deletedAt` is deliberately left alone: the two mean
 * different things, and setting both would make an archived campaign
 * indistinguishable from a deleted one — which in turn makes the ARCHIVED status
 * unobservable and its read-only rule impossible to verify.
 *
 * Archived campaigns stay listed, below the rest, and refuse modification
 * through canModifyContent.
 */
export async function archiveCampaign(
  campaignId: string,
  now: Date,
  executor: DbOrTx = db,
): Promise<void> {
  await executor
    .update(campaign)
    .set({ status: 'ARCHIVED', updatedAt: now })
    .where(eq(campaign.id, campaignId))
}

export async function setCampaignOwner(
  campaignId: string,
  newOwnerId: string,
  now: Date,
  executor: DbOrTx,
): Promise<void> {
  await executor
    .update(campaign)
    .set({ ownerId: newOwnerId, updatedAt: now })
    .where(eq(campaign.id, campaignId))
}

export async function touchCampaign(
  campaignId: string,
  now: Date,
  executor: DbOrTx = db,
): Promise<void> {
  await executor.update(campaign).set({ updatedAt: now }).where(eq(campaign.id, campaignId))
}

/** Internal read used by rules that need the campaign's state without a DTO. */
export async function findCampaignState(
  campaignId: string,
  executor: DbOrTx = db,
): Promise<{
  id: string
  name: string
  ownerId: string
  status: CampaignStatus
  timezone: string
  defaultMinSessionHours: number
}> {
  const row = await executor.query.campaign.findFirst({
    where: and(eq(campaign.id, campaignId), isNull(campaign.deletedAt)),
    columns: {
      id: true,
      name: true,
      ownerId: true,
      status: true,
      timezone: true,
      defaultMinSessionHours: true,
    },
  })

  if (!row) throw new NotFoundError()
  return row
}

export async function upsertCampaignScenario(input: {
  campaignId: string
  scenarioId: string | null
  name: string
  description: string | null
  createdBy: string
  now: Date
}): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.scenarioId) {
      await tx
        .update(scenario)
        .set({ name: input.name, description: input.description, updatedAt: input.now })
        .where(eq(scenario.id, input.scenarioId))
      return
    }

    const scenarioId = newId()
    await tx.insert(scenario).values({
      id: scenarioId,
      campaignId: input.campaignId,
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      createdAt: input.now,
      updatedAt: input.now,
    })
    await tx
      .update(campaign)
      .set({ scenarioId, updatedAt: input.now })
      .where(eq(campaign.id, input.campaignId))
  })
}

/** Count of active members, used by rules that must not leave a campaign keeperless. */
export async function listMemberRoles(
  campaignId: string,
  executor: DbOrTx = db,
): Promise<{ userId: string; role: 'KEEPER' | 'INVESTIGATOR' }[]> {
  return executor
    .select({ userId: campaignMember.userId, role: campaignMember.role })
    .from(campaignMember)
    .where(
      and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.status, 'ACTIVE')),
    )
}
