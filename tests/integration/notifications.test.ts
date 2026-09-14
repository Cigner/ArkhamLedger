import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignIntegration,
  gameSession,
  notificationDelivery,
  notificationPreference,
  sessionParticipant,
} from '@/db/schema'
import { encryptSecret } from '@/lib/crypto'
import { env } from '@/lib/env'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Notifications against a real database.
 *
 * The outbox is the part that only a database can prove: that a claim cannot
 * hand the same row to two workers, that a row abandoned by a killed process
 * comes back, and that the unique constraint makes redelivery after a restart
 * impossible rather than merely unlikely.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

vi.mock('@/lib/auth', () => ({
  requireUser: () => Promise.resolve({ id: 'unused', name: 'Unused', email: 'unused@test' }),
}))

const { enqueueNotifications } = await import('@/modules/notifications/data/notifications')
const { claimDueDeliveries, completeDelivery, loadDispatchContexts } = await import(
  '@/modules/notifications/data/outbox'
)
const { findPendingReminders, findIdleCampaigns } = await import(
  '@/modules/notifications/data/nudges'
)

async function seedGroup() {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
  const player = await createUserRow({ status: 'ACTIVE', name: 'Anna' })
  const campaign = await createCampaignRow({ ownerId: keeper.id, name: 'Masks', status: 'ACTIVE' })
  await addMemberRow({ campaignId: campaign.id, userId: player.id })

  return { keeper, player, campaign }
}

async function seedSession(campaignId: string, users: readonly { id: string }[], deadline: Date | null) {
  const sessionId = newId()

  await db.insert(gameSession).values({
    id: sessionId,
    campaignId,
    title: 'Chapter Two',
    status: 'COLLECTING',
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-12',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 1,
    availabilityDeadline: deadline,
    timezone: 'Europe/Warsaw',
    createdBy: users[0]!.id,
    createdAt: NOW,
    updatedAt: NOW,
  })

  for (const user of users) {
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: user.id,
      priority: 'PREFERRED',
      isKeeper: user.id === users[0]!.id,
      respondedAt: null,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  return sessionId
}

async function deliveriesFor(notificationId: string) {
  return db
    .select()
    .from(notificationDelivery)
    .where(eq(notificationDelivery.notificationId, notificationId))
}

beforeEach(async () => {
  await truncateAll()
})

describe('raising a notification', () => {
  it('records the event and the intention to deliver it together', async () => {
    const { keeper, campaign } = await seedGroup()

    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          {
            userId: keeper.id,
            type: 'AVAILABILITY_REQUESTED',
            campaignId: campaign.id,
            payload: { campaignName: 'Masks' },
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const deliveries = await deliveriesFor(notificationIds[0]!)

    expect(deliveries.map((row) => row.channel).sort()).toEqual(['EMAIL', 'IN_APP'])
  })

  /*
   * The in-app copy is the record itself, so it is delivered the moment it is
   * written. Leaving it pending would put a queue between a person and a row
   * they can already read.
   */
  it('counts the in-app copy as delivered immediately', async () => {
    const { keeper, campaign } = await seedGroup()

    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          { userId: keeper.id, type: 'SESSION_SCHEDULED', campaignId: campaign.id, payload: {} },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const deliveries = await deliveriesFor(notificationIds[0]!)
    const inApp = deliveries.find((row) => row.channel === 'IN_APP')

    expect(inApp?.status).toBe('SENT')
    expect(deliveries.find((row) => row.channel === 'EMAIL')?.status).toBe('PENDING')
  })

  it('respects somebody who turned their email off', async () => {
    const { keeper, player, campaign } = await seedGroup()

    await db.insert(notificationPreference).values({
      id: newId(),
      userId: player.id,
      channel: 'EMAIL',
      enabled: false,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [keeper.id, player.id].map((userId) => ({
          userId,
          type: 'SESSION_SCHEDULED' as const,
          campaignId: campaign.id,
          payload: {},
        })),
        now: NOW,
        executor: tx,
      }),
    )

    const forKeeper = await deliveriesFor(notificationIds[0]!)
    const forPlayer = await deliveriesFor(notificationIds[1]!)

    expect(forKeeper.map((row) => row.channel).sort()).toEqual(['EMAIL', 'IN_APP'])
    expect(forPlayer.map((row) => row.channel)).toEqual(['IN_APP'])
  })

  /*
   * Six people told about one confirmed date is one post in the channel, not
   * six. The carrier is chosen deterministically so a repeat of the same event
   * does not move it around.
   */
  it('posts to Discord exactly once for an event everybody is told about', async () => {
    const { keeper, player, campaign } = await seedGroup()

    await db.insert(campaignIntegration).values({
      id: newId(),
      campaignId: campaign.id,
      type: 'DISCORD_WEBHOOK',
      config: { url: encryptSecret('https://discord.com/api/webhooks/1/abc', env.ENCRYPTION_KEY) },
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [keeper.id, player.id].map((userId) => ({
          userId,
          type: 'SESSION_SCHEDULED' as const,
          campaignId: campaign.id,
          payload: {},
        })),
        now: NOW,
        executor: tx,
      }),
    )

    const all = await Promise.all(notificationIds.map(deliveriesFor))
    const discord = all.flat().filter((row) => row.channel === 'DISCORD')

    expect(discord).toHaveLength(1)
  })
})

describe('the queue', () => {
  async function enqueueOne() {
    const { keeper, campaign } = await seedGroup()

    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          {
            userId: keeper.id,
            type: 'SESSION_SCHEDULED',
            campaignId: campaign.id,
            payload: { sessionTitle: 'Chapter Two' },
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    return { notificationId: notificationIds[0]!, keeper, campaign }
  }

  it('hands out what is due and marks it in flight', async () => {
    await enqueueOne()

    const claimed = await claimDueDeliveries({ limit: 10, now: NOW })
    expect(claimed).toHaveLength(1)

    const [row] = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, claimed[0]!))

    expect(row?.status).toBe('SENDING')
    expect(row?.attempts).toBe(1)
  })

  it('does not hand the same row out twice', async () => {
    await enqueueOne()

    const first = await claimDueDeliveries({ limit: 10, now: NOW })
    const second = await claimDueDeliveries({ limit: 10, now: NOW })

    expect(first).toHaveLength(1)
    expect(second).toEqual([])
  })

  /*
   * A worker killed mid-send leaves its claim behind. Without this the delivery
   * would sit in SENDING forever and nobody would ever be told.
   */
  it('reclaims a row abandoned by a process that died', async () => {
    await enqueueOne()
    await claimDueDeliveries({ limit: 10, now: NOW })

    const muchLater = new Date(NOW.getTime() + 30 * 60_000)
    const reclaimed = await claimDueDeliveries({ limit: 10, now: muchLater })

    expect(reclaimed).toHaveLength(1)
  })

  it('resolves everything a dispatcher needs in one go', async () => {
    const { keeper, campaign } = await enqueueOne()

    const claimed = await claimDueDeliveries({ limit: 10, now: NOW })
    const contexts = await loadDispatchContexts(claimed)
    const email = contexts.find((entry) => entry.channel === 'EMAIL')

    expect(email?.context.recipient.email).toBe(keeper.email)
    expect(email?.context.campaign?.name).toBe('Masks')
    expect(email?.context.message.subject).toContain('Chapter Two')
    expect(campaign.id).toBe(email?.context.notification.campaignId)
  })

  it('puts a transient failure back with a later attempt time', async () => {
    await enqueueOne()
    const [deliveryId] = await claimDueDeliveries({ limit: 10, now: NOW })

    await completeDelivery({
      deliveryId: deliveryId!,
      attempts: 1,
      outcome: { kind: 'RETRYABLE', error: 'ECONNRESET' },
      now: NOW,
    })

    const [row] = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, deliveryId!))

    expect(row?.status).toBe('PENDING')
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(row?.lastError).toBe('ECONNRESET')
  })

  it('stops after the last attempt and keeps the evidence', async () => {
    await enqueueOne()
    const [deliveryId] = await claimDueDeliveries({ limit: 10, now: NOW })

    await completeDelivery({
      deliveryId: deliveryId!,
      attempts: 5,
      outcome: { kind: 'RETRYABLE', error: 'still down' },
      now: NOW,
    })

    const [row] = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, deliveryId!))

    expect(row?.status).toBe('FAILED')
    expect(row?.lastError).toBe('still down')
  })

  it('does not retry something that will never work', async () => {
    await enqueueOne()
    const [deliveryId] = await claimDueDeliveries({ limit: 10, now: NOW })

    await completeDelivery({
      deliveryId: deliveryId!,
      attempts: 1,
      outcome: { kind: 'PERMANENT', error: 'no such mailbox' },
      now: NOW,
    })

    const [row] = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, deliveryId!))

    expect(row?.status).toBe('FAILED')
  })

  /*
   * The constraint, not the code, is what makes redelivery after a restart
   * impossible. Worth asserting directly: it is the last line of defence against
   * somebody receiving the same email twice.
   */
  it('cannot hold two deliveries of one notification on one channel', async () => {
    const { notificationId } = await enqueueOne()

    await expect(
      db.insert(notificationDelivery).values({
        id: newId(),
        notificationId,
        channel: 'EMAIL',
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toThrow()
  })
})

describe('reminders', () => {
  it('finds people who have not answered a session closing soon', async () => {
    const { keeper, player, campaign } = await seedGroup()
    const deadline = new Date(NOW.getTime() + 24 * 60 * 60_000)
    await seedSession(campaign.id, [keeper, player], deadline)

    const pending = await findPendingReminders({ now: NOW, horizonMs: 36 * 60 * 60_000 })

    expect(pending.map((entry) => entry.userId).sort()).toEqual([keeper.id, player.id].sort())
  })

  it('ignores a deadline that is still far off', async () => {
    const { keeper, player, campaign } = await seedGroup()
    await seedSession(campaign.id, [keeper, player], new Date(NOW.getTime() + 10 * 24 * 60 * 60_000))

    expect(await findPendingReminders({ now: NOW, horizonMs: 36 * 60 * 60_000 })).toEqual([])
  })

  it('ignores somebody who has already answered', async () => {
    const { keeper, player, campaign } = await seedGroup()
    const sessionId = await seedSession(campaign.id, [keeper, player], new Date(NOW.getTime() + 60_000))

    await db
      .update(sessionParticipant)
      .set({ respondedAt: NOW })
      .where(
        and(
          eq(sessionParticipant.gameSessionId, sessionId),
          eq(sessionParticipant.userId, player.id),
        ),
      )

    const pending = await findPendingReminders({ now: NOW, horizonMs: 36 * 60 * 60_000 })

    expect(pending.map((entry) => entry.userId)).toEqual([keeper.id])
  })

  /*
   * Once each, ever. A second reminder is nagging, and the first was already the
   * strongest signal the application has.
   */
  it('never reminds the same person about the same session twice', async () => {
    const { keeper, player, campaign } = await seedGroup()
    const sessionId = await seedSession(campaign.id, [keeper, player], new Date(NOW.getTime() + 60_000))

    await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          {
            userId: player.id,
            type: 'AVAILABILITY_REMINDER',
            campaignId: campaign.id,
            gameSessionId: sessionId,
            payload: {},
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const pending = await findPendingReminders({ now: NOW, horizonMs: 36 * 60 * 60_000 })

    expect(pending.map((entry) => entry.userId)).toEqual([keeper.id])
  })
})

describe('campaigns with nothing in the diary', () => {
  it('finds an active campaign with no session ahead', async () => {
    const { keeper, campaign } = await seedGroup()

    const idle = await findIdleCampaigns({ now: NOW, repeatAfterMs: 7 * 24 * 60 * 60_000 })

    expect(idle.map((entry) => entry.campaignId)).toEqual([campaign.id])
    expect(idle[0]?.keeperIds).toEqual([keeper.id])
  })

  it('leaves alone a campaign that is still looking for a date', async () => {
    const { keeper, player, campaign } = await seedGroup()
    await seedSession(campaign.id, [keeper, player], null)

    expect(await findIdleCampaigns({ now: NOW, repeatAfterMs: 7 * 24 * 60 * 60_000 })).toEqual([])
  })

  it('does not say it again the next morning', async () => {
    const { keeper, campaign } = await seedGroup()

    await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          { userId: keeper.id, type: 'NO_NEXT_SESSION', campaignId: campaign.id, payload: {} },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60_000)

    expect(await findIdleCampaigns({ now: tomorrow, repeatAfterMs: 7 * 24 * 60 * 60_000 })).toEqual(
      [],
    )
  })
})
