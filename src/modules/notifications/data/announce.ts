import 'server-only'
import { and, eq } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { campaign, campaignMember, gameSession, sessionParticipant } from '@/db/schema'
import { enqueueNotifications } from './notifications'
import type { NotificationPayload, NotificationType } from '../domain/types'

/**
 * Raising a notification from the action that caused it.
 *
 * Every function here takes the caller's transaction, because the announcement
 * belongs to the change that prompted it: a session confirmed but not announced
 * is worse than one that failed to be confirmed at all, since nobody is waiting
 * for the second.
 *
 * The context each announcement needs - the campaign's name, who was invited -
 * is loaded here rather than passed in, so a caller cannot accidentally announce
 * to a stale list of participants it happened to be holding.
 */
export async function announceToSession(input: {
  readonly sessionId: string
  readonly type: NotificationType
  readonly payload?: NotificationPayload
  readonly now: Date
  readonly executor: DbOrTx
  /** Somebody who does not need telling about their own action. */
  readonly exceptUserId?: string
}): Promise<void> {
  const context = await sessionContext(input.sessionId, input.executor)
  if (!context) return

  const recipients = context.participantIds.filter((userId) => userId !== input.exceptUserId)

  await enqueueNotifications({
    drafts: recipients.map((userId) => ({
      userId,
      type: input.type,
      campaignId: context.campaignId,
      gameSessionId: input.sessionId,
      payload: {
        campaignName: context.campaignName,
        sessionTitle: context.title,
        timezone: context.timezone,
        ...input.payload,
      },
    })),
    now: input.now,
    executor: input.executor,
  })
}

export async function announceToKeepers(input: {
  readonly campaignId: string
  readonly type: NotificationType
  readonly payload?: NotificationPayload
  readonly now: Date
  readonly executor: DbOrTx
  readonly exceptUserId?: string
}): Promise<void> {
  const [details] = await input.executor
    .select({ name: campaign.name })
    .from(campaign)
    .where(eq(campaign.id, input.campaignId))
    .limit(1)

  const keepers = await input.executor
    .select({ userId: campaignMember.userId })
    .from(campaignMember)
    .where(
      and(
        eq(campaignMember.campaignId, input.campaignId),
        eq(campaignMember.role, 'KEEPER'),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )

  await enqueueNotifications({
    drafts: keepers
      .filter((keeper) => keeper.userId !== input.exceptUserId)
      .map((keeper) => ({
        userId: keeper.userId,
        type: input.type,
        campaignId: input.campaignId,
        payload: { ...(details ? { campaignName: details.name } : {}), ...input.payload },
      })),
    now: input.now,
    executor: input.executor,
  })
}

export async function announceToUser(input: {
  readonly userId: string
  readonly type: NotificationType
  readonly campaignId?: string | null
  readonly gameSessionId?: string | null
  readonly payload?: NotificationPayload
  readonly now: Date
  readonly executor: DbOrTx
}): Promise<void> {
  await enqueueNotifications({
    drafts: [
      {
        userId: input.userId,
        type: input.type,
        campaignId: input.campaignId ?? null,
        gameSessionId: input.gameSessionId ?? null,
        payload: input.payload ?? {},
      },
    ],
    now: input.now,
    executor: input.executor,
  })
}

async function sessionContext(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<{
  campaignId: string
  campaignName: string
  title: string
  timezone: string
  participantIds: string[]
} | null> {
  const [row] = await executor
    .select({
      campaignId: gameSession.campaignId,
      campaignName: campaign.name,
      title: gameSession.title,
      timezone: gameSession.timezone,
    })
    .from(gameSession)
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .where(eq(gameSession.id, sessionId))
    .limit(1)

  if (!row) return null

  const participants = await executor
    .select({ userId: sessionParticipant.userId })
    .from(sessionParticipant)
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  return { ...row, participantIds: participants.map((entry) => entry.userId) }
}
