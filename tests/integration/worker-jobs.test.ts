import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  availabilitySlot,
  gameSession,
  notification,
  notificationDelivery,
  scheduleProposal,
  scheduleRun,
  sessionParticipant,
} from '@/db/schema'
import { generateGridSlots } from '@/lib/datetime/slots'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * The jobs the worker runs, against a real database.
 *
 * These are the promises nobody is present to keep: a deadline that closes
 * itself, a ranking produced at three in the morning, a message queued for the
 * Keeper who set the deadline a fortnight ago. Tested through the job rather
 * than through its parts, because what matters is that the whole sequence
 * happens — and that running it twice does not happen twice.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

vi.mock('@/lib/auth', () => ({
  requireUser: () => Promise.resolve({ id: 'unused', name: 'Unused', email: 'unused@test' }),
}))

const { closeDeadlines } = await import('@/worker/jobs/close-deadlines')
const { flushOutbox } = await import('@/worker/jobs/flush-outbox')

async function seedCollectingSession(deadline: Date) {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
  const player = await createUserRow({ status: 'ACTIVE', name: 'Anna' })
  const campaign = await createCampaignRow({ ownerId: keeper.id, status: 'ACTIVE' })
  await addMemberRow({ campaignId: campaign.id, userId: player.id })

  const sessionId = newId()
  const window = { start: '2026-10-05', end: '2026-10-06' }

  await db.insert(gameSession).values({
    id: sessionId,
    campaignId: campaign.id,
    title: 'Chapter Two',
    status: 'COLLECTING',
    searchWindowStart: window.start,
    searchWindowEnd: window.end,
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 1,
    availabilityDeadline: deadline,
    timezone: 'Europe/Warsaw',
    createdBy: keeper.id,
    createdAt: NOW,
    updatedAt: NOW,
  })

  for (const user of [keeper, player]) {
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: user.id,
      priority: 'PREFERRED',
      isKeeper: user.id === keeper.id,
      respondedAt: NOW,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  // Both free on the 5th from six, which is one viable evening and no more.
  const slots = generateGridSlots({
    startDate: window.start,
    endDate: window.end,
    startHour: 12,
    endHour: 24,
    timeZone: 'Europe/Warsaw',
  }).filter((slot) => slot.localDate === '2026-10-05' && slot.localHour >= 18)

  for (const user of [keeper, player]) {
    for (const slot of slots) {
      await db.insert(availabilitySlot).values({
        id: newId(),
        gameSessionId: sessionId,
        userId: user.id,
        slotStartUtc: new Date(slot.startUtc),
        localDate: slot.localDate,
        localHour: slot.localHour,
        state: 'YES',
        createdAt: NOW,
        updatedAt: NOW,
      })
    }
  }

  return { sessionId, keeper, player, campaign }
}

beforeEach(async () => {
  await truncateAll()
})

describe('closing a deadline', () => {
  it('closes the session, ranks the answers and tells the Keeper', async () => {
    const { sessionId, keeper } = await seedCollectingSession(new Date(NOW.getTime() - 60_000))

    const result = await closeDeadlines.run(NOW)

    const [session] = await db.select().from(gameSession).where(eq(gameSession.id, sessionId))
    const runs = await db.select().from(scheduleRun).where(eq(scheduleRun.gameSessionId, sessionId))
    const proposals = await db
      .select()
      .from(scheduleProposal)
      .where(eq(scheduleProposal.gameSessionId, sessionId))
    const told = await db
      .select()
      .from(notification)
      .where(eq(notification.gameSessionId, sessionId))

    expect(result.handled).toBe(1)
    expect(session?.status).toBe('PROPOSED')
    expect(runs).toHaveLength(1)
    expect(proposals.length).toBeGreaterThan(0)
    expect(told.map((row) => row.userId)).toEqual([keeper.id])
    expect(told[0]?.type).toBe('COLLECTION_CLOSED')
  })

  it('leaves a session whose deadline has not passed', async () => {
    const { sessionId } = await seedCollectingSession(new Date(NOW.getTime() + 60_000))

    expect((await closeDeadlines.run(NOW)).handled).toBe(0)

    const [session] = await db.select().from(gameSession).where(eq(gameSession.id, sessionId))
    expect(session?.status).toBe('COLLECTING')
  })

  /*
   * The worker runs every five minutes forever. A second pass over a session it
   * already closed must do nothing at all — otherwise a Keeper would be told
   * again every five minutes until somebody noticed.
   */
  it('does nothing on a second pass', async () => {
    const { sessionId } = await seedCollectingSession(new Date(NOW.getTime() - 60_000))

    await closeDeadlines.run(NOW)
    const second = await closeDeadlines.run(new Date(NOW.getTime() + 60_000))

    const runs = await db.select().from(scheduleRun).where(eq(scheduleRun.gameSessionId, sessionId))
    const told = await db
      .select()
      .from(notification)
      .where(eq(notification.gameSessionId, sessionId))

    expect(second.handled).toBe(0)
    expect(runs).toHaveLength(1)
    expect(told).toHaveLength(1)
  })
})

describe('flushing the outbox', () => {
  /*
   * With no SMTP configured the mail port is the logging transport, which
   * reports success. That is the point of the port: the queue's behaviour is
   * exercised end to end without a mail server anywhere near the test.
   */
  it('sends what is due and marks it sent', async () => {
    await seedCollectingSession(new Date(NOW.getTime() - 60_000))
    await closeDeadlines.run(NOW)

    const result = await flushOutbox.run(NOW)

    const deliveries = await db.select().from(notificationDelivery)
    const email = deliveries.filter((row) => row.channel === 'EMAIL')

    expect(result.handled).toBeGreaterThan(0)
    expect(email.every((row) => row.status === 'SENT')).toBe(true)
    expect(email.every((row) => row.sentAt !== null)).toBe(true)
  })

  it('has nothing to do when the queue is empty', async () => {
    expect((await flushOutbox.run(NOW)).handled).toBe(0)
  })
})
