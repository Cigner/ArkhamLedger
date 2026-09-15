import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { campaign, gameSession } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import {
  requireCampaignMember,
  requireKeeper,
  type CampaignContext,
} from '@/modules/campaigns/data/guards'
import type { SessionStatus } from '../domain/types'

/**
 * Session-scoped authorization.
 *
 * A session inherits its permissions from its campaign, so the campaign id is
 * resolved first and the campaign guards do the deciding. Resolving it in a
 * single query - rather than reading the session and then checking membership -
 * is what keeps a non-member from learning that a session id exists at all.
 */
export type SessionContext = CampaignContext & {
  readonly sessionId: string
  readonly campaignId: string
  readonly sessionStatus: SessionStatus
  readonly timezone: string
}

async function resolveCampaign(
  sessionId: string,
  executor: DbOrTx,
): Promise<{ campaignId: string; status: SessionStatus; timezone: string }> {
  const row = await executor
    .select({
      campaignId: gameSession.campaignId,
      status: gameSession.status,
      timezone: gameSession.timezone,
    })
    .from(gameSession)
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .where(and(eq(gameSession.id, sessionId), isNull(campaign.deletedAt)))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) throw new NotFoundError()
  return row
}

export async function requireSessionMember(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<SessionContext> {
  const resolved = await resolveCampaign(sessionId, executor)
  const context = await requireCampaignMember(resolved.campaignId, 'INVESTIGATOR', executor)

  return {
    ...context,
    sessionId,
    campaignId: resolved.campaignId,
    sessionStatus: resolved.status,
    timezone: resolved.timezone,
  }
}

export async function requireSessionKeeper(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<SessionContext> {
  const resolved = await resolveCampaign(sessionId, executor)
  const context = await requireKeeper(resolved.campaignId, executor)

  return {
    ...context,
    sessionId,
    campaignId: resolved.campaignId,
    sessionStatus: resolved.status,
    timezone: resolved.timezone,
  }
}
