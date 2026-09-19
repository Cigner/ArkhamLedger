import 'server-only'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/db/client'
import { campaign, campaignMember, gameSession } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import type { CampaignStatus } from '@/modules/campaigns/domain/types'
import type { SessionStatus } from '@/modules/sessions/domain/types'
import type { CampaignShortcut, SessionShortcut, SidebarNavigation } from '../domain/types'

const SIDEBAR_LIMIT = 5

type CampaignAggregate = {
  id: string
  name: string
  status: CampaignStatus
  updatedAt: Date
  upcomingAt: Date | null
  arrangingAt: Date | null
  recentAt: Date | null
}

export async function getSidebarNavigation(now: Date = new Date()): Promise<SidebarNavigation> {
  const user = await requireUser()

  const [campaigns, sessions] = await Promise.all([
    listCampaignShortcuts(user.id, now, SIDEBAR_LIMIT),
    listSessionShortcuts(user.id, now, SIDEBAR_LIMIT),
  ])

  return { campaigns, sessions }
}

export async function listMySessionShortcuts(
  now: Date = new Date(),
  limit = 100,
): Promise<SessionShortcut[]> {
  const user = await requireUser()
  return listSessionShortcuts(user.id, now, limit)
}

async function listCampaignShortcuts(
  userId: string,
  now: Date,
  limit: number,
): Promise<CampaignShortcut[]> {
  const rows = await db
    .select({
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      campaignUpdatedAt: campaign.updatedAt,
      sessionStatus: gameSession.status,
      sessionStart: gameSession.confirmedStartUtc,
      sessionUpdatedAt: gameSession.updatedAt,
    })
    .from(campaignMember)
    .innerJoin(campaign, eq(campaign.id, campaignMember.campaignId))
    .leftJoin(gameSession, eq(gameSession.campaignId, campaign.id))
    .where(
      and(
        eq(campaignMember.userId, userId),
        eq(campaignMember.status, 'ACTIVE'),
        isNull(campaign.deletedAt),
        ne(campaign.status, 'ARCHIVED'),
      ),
    )

  const grouped = new Map<string, CampaignAggregate>()

  for (const row of rows) {
    const aggregate = grouped.get(row.campaignId) ?? {
      id: row.campaignId,
      name: row.campaignName,
      status: row.campaignStatus,
      updatedAt: row.campaignUpdatedAt,
      upcomingAt: null,
      arrangingAt: null,
      recentAt: null,
    }

    const startsAt = row.sessionStart
    const live =
      row.sessionStatus === 'IN_PROGRESS' ||
      (row.sessionStatus === 'SCHEDULED' &&
        startsAt !== null &&
        startsAt.getTime() >= now.getTime())

    if (live && startsAt !== null) {
      aggregate.upcomingAt = earlier(aggregate.upcomingAt, startsAt)
    } else if (
      row.sessionStatus === 'DRAFT' ||
      row.sessionStatus === 'COLLECTING' ||
      row.sessionStatus === 'PROPOSED'
    ) {
      if (row.sessionUpdatedAt) {
        aggregate.arrangingAt = later(aggregate.arrangingAt, row.sessionUpdatedAt)
      }
    } else if (
      row.sessionStatus === 'COMPLETED' ||
      (row.sessionStatus === 'SCHEDULED' &&
        row.sessionStart &&
        row.sessionStart.getTime() < now.getTime())
    ) {
      const recentAt = row.sessionStart ?? row.sessionUpdatedAt
      if (recentAt) {
        aggregate.recentAt = later(aggregate.recentAt, recentAt)
      }
    }

    grouped.set(row.campaignId, aggregate)
  }

  return [...grouped.values()]
    .map(toCampaignShortcut)
    .sort(compareCampaignShortcuts)
    .slice(0, limit)
}

async function listSessionShortcuts(
  userId: string,
  now: Date,
  limit: number,
): Promise<SessionShortcut[]> {
  const rows = await db
    .select({
      id: gameSession.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      title: gameSession.title,
      status: gameSession.status,
      confirmedStartUtc: gameSession.confirmedStartUtc,
      availabilityDeadline: gameSession.availabilityDeadline,
      updatedAt: gameSession.updatedAt,
    })
    .from(campaignMember)
    .innerJoin(campaign, eq(campaign.id, campaignMember.campaignId))
    .innerJoin(gameSession, eq(gameSession.campaignId, campaign.id))
    .where(
      and(
        eq(campaignMember.userId, userId),
        eq(campaignMember.status, 'ACTIVE'),
        isNull(campaign.deletedAt),
        ne(campaign.status, 'ARCHIVED'),
        ne(gameSession.status, 'CANCELLED'),
      ),
    )

  return rows
    .sort((left, right) => compareSessions(left, right, now))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      title: row.title,
      status: row.status,
      confirmedStartUtc: row.confirmedStartUtc?.toISOString() ?? null,
      availabilityDeadline: row.availabilityDeadline?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }))
}

function toCampaignShortcut(value: CampaignAggregate): CampaignShortcut {
  if (value.upcomingAt) {
    return {
      ...baseCampaign(value),
      activity: 'UPCOMING',
      activityAt: value.upcomingAt.toISOString(),
    }
  }
  if (value.arrangingAt) {
    return {
      ...baseCampaign(value),
      activity: 'ARRANGING',
      activityAt: value.arrangingAt.toISOString(),
    }
  }
  if (value.recentAt) {
    return { ...baseCampaign(value), activity: 'RECENT', activityAt: value.recentAt.toISOString() }
  }
  return { ...baseCampaign(value), activity: 'CAMPAIGN', activityAt: value.updatedAt.toISOString() }
}

function baseCampaign(value: CampaignAggregate) {
  return { id: value.id, name: value.name, status: value.status }
}

function compareCampaignShortcuts(left: CampaignShortcut, right: CampaignShortcut): number {
  const rank = { UPCOMING: 0, ARRANGING: 1, RECENT: 2, CAMPAIGN: 3 } as const
  const difference = rank[left.activity] - rank[right.activity]
  if (difference !== 0) return difference

  const leftTime = new Date(left.activityAt).getTime()
  const rightTime = new Date(right.activityAt).getTime()
  return left.activity === 'UPCOMING' ? leftTime - rightTime : rightTime - leftTime
}

function compareSessions(
  left: { status: SessionStatus; confirmedStartUtc: Date | null; updatedAt: Date },
  right: { status: SessionStatus; confirmedStartUtc: Date | null; updatedAt: Date },
  now: Date,
): number {
  const leftGroup = sessionGroup(left, now)
  const rightGroup = sessionGroup(right, now)
  if (leftGroup !== rightGroup) return leftGroup - rightGroup

  if (leftGroup === 0) {
    return (
      (left.confirmedStartUtc?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (right.confirmedStartUtc?.getTime() ?? Number.MAX_SAFE_INTEGER)
    )
  }

  const leftTime = left.confirmedStartUtc?.getTime() ?? left.updatedAt.getTime()
  const rightTime = right.confirmedStartUtc?.getTime() ?? right.updatedAt.getTime()
  return rightTime - leftTime
}

function sessionGroup(
  value: { status: SessionStatus; confirmedStartUtc: Date | null },
  now: Date,
): number {
  if (
    value.status === 'IN_PROGRESS' ||
    (value.status === 'SCHEDULED' &&
      value.confirmedStartUtc &&
      value.confirmedStartUtc.getTime() >= now.getTime())
  ) {
    return 0
  }
  if (value.status === 'DRAFT' || value.status === 'COLLECTING' || value.status === 'PROPOSED') {
    return 1
  }
  return 2
}

function earlier(current: Date | null, candidate: Date): Date {
  return !current || candidate.getTime() < current.getTime() ? candidate : current
}

function later(current: Date | null, candidate: Date): Date {
  return !current || candidate.getTime() > current.getTime() ? candidate : current
}
