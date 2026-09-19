import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { availabilitySlot, gameSession, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import { deleteAllAvailability } from '@/modules/availability/data/availability'
import { findExpiredCollections } from '@/modules/notifications/data/nudges'
import { transitionSession } from '@/modules/sessions/data/session-store'
import {
  clearResponses,
  listParticipantRecords,
  replaceParticipants,
} from '@/modules/sessions/data/participants'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Session persistence against a real database.
 *
 * Covers the three things that only exist in SQL: the conditional transition
 * that stops two Keepers applying the same change, the roster replacement that
 * must preserve answers already given, and the aggregate counts on the list.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function seedSession(overrides: Partial<{ status: string; deadline: Date | null }> = {}) {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })
  const sessionId = newId()

  await db.insert(gameSession).values({
    id: sessionId,
    campaignId: campaign.id,
    title: 'Chapter Two',
    status: (overrides.status ?? 'DRAFT') as 'DRAFT',
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-18',
    gridStartHour: 16,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 2,
    availabilityDeadline: overrides.deadline ?? null,
    timezone: 'Europe/Warsaw',
    createdBy: keeper.id,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return { keeper, campaignId: campaign.id, sessionId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('transitions', () => {
  it('applies a transition from the expected status', async () => {
    const { sessionId } = await seedSession()

    const moved = await transitionSession({
      sessionId,
      from: 'DRAFT',
      to: 'COLLECTING',
      now: NOW,
      executor: db,
    })

    expect(moved).toBe(true)
    const [row] = await db.select().from(gameSession).where(eq(gameSession.id, sessionId))
    expect(row?.status).toBe('COLLECTING')
  })

  it('refuses a transition from a status the session has already left', async () => {
    const { sessionId } = await seedSession({ status: 'COLLECTING' })

    const moved = await transitionSession({
      sessionId,
      from: 'DRAFT',
      to: 'COLLECTING',
      now: NOW,
      executor: db,
    })

    expect(moved).toBe(false)
  })

  /*
   * Two Keepers acting at once: the status is part of the WHERE clause, so the
   * second finds no row rather than overwriting the first's decision.
   */
  it('lets only one of two concurrent transitions from the same status win', async () => {
    const { sessionId } = await seedSession({ status: 'COLLECTING' })

    const results = await Promise.all([
      transitionSession({ sessionId, from: 'COLLECTING', to: 'SCHEDULED', now: NOW, executor: db }),
      transitionSession({ sessionId, from: 'COLLECTING', to: 'CANCELLED', now: NOW, executor: db }),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('roster', () => {
  it('keeps an answer already given when an unrelated priority changes', async () => {
    const { keeper, campaignId, sessionId } = await seedSession()
    const player = await createUserRow({ status: 'ACTIVE' })
    const other = await createUserRow({ status: 'ACTIVE' })
    await addMemberRow({ campaignId, userId: player.id })
    await addMemberRow({ campaignId, userId: other.id })

    const roster = [
      {
        userId: keeper.id,
        priority: 'REQUIRED' as const,
        isKeeper: true,
        playsInvestigator: false,
      },
      {
        userId: player.id,
        priority: 'PREFERRED' as const,
        isKeeper: false,
        playsInvestigator: true,
      },
      {
        userId: other.id,
        priority: 'OPTIONAL' as const,
        isKeeper: false,
        playsInvestigator: true,
      },
    ]

    await db.transaction(async (tx) =>
      replaceParticipants({ sessionId, participants: roster, now: NOW, executor: tx }),
    )

    await db
      .update(sessionParticipant)
      .set({ respondedAt: NOW })
      .where(eq(sessionParticipant.userId, player.id))

    // Somebody else's priority changes; the answer must survive.
    await db.transaction(async (tx) =>
      replaceParticipants({
        sessionId,
        participants: roster.map((entry) =>
          entry.userId === other.id ? { ...entry, priority: 'REQUIRED' as const } : entry,
        ),
        now: NOW,
        executor: tx,
      }),
    )

    const records = await listParticipantRecords(sessionId)
    expect(records.find((record) => record.userId === player.id)?.respondedAt).not.toBeNull()
    expect(records.find((record) => record.userId === other.id)?.priority).toBe('REQUIRED')
  })

  it('removes people dropped from the roster', async () => {
    const { keeper, campaignId, sessionId } = await seedSession()
    const player = await createUserRow({ status: 'ACTIVE' })
    await addMemberRow({ campaignId, userId: player.id })

    await db.transaction(async (tx) =>
      replaceParticipants({
        sessionId,
        participants: [
          { userId: keeper.id, priority: 'REQUIRED', isKeeper: true, playsInvestigator: false },
          { userId: player.id, priority: 'PREFERRED', isKeeper: false, playsInvestigator: true },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction(async (tx) =>
      replaceParticipants({
        sessionId,
        participants: [
          { userId: keeper.id, priority: 'REQUIRED', isKeeper: true, playsInvestigator: false },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const records = await listParticipantRecords(sessionId)
    expect(records.map((record) => record.userId)).toEqual([keeper.id])
  })

  it('clears every answer when collection is reopened', async () => {
    const { keeper, sessionId } = await seedSession()

    await db.transaction(async (tx) =>
      replaceParticipants({
        sessionId,
        participants: [
          { userId: keeper.id, priority: 'REQUIRED', isKeeper: true, playsInvestigator: false },
        ],
        now: NOW,
        executor: tx,
      }),
    )
    await db.update(sessionParticipant).set({ respondedAt: NOW })

    await db.transaction(async (tx) => clearResponses(sessionId, NOW, tx))

    const records = await listParticipantRecords(sessionId)
    expect(records.every((record) => record.respondedAt === null)).toBe(true)
  })
})

describe('deadline sweep', () => {
  it('finds only collecting sessions whose deadline has passed', async () => {
    const past = await seedSession({
      status: 'COLLECTING',
      deadline: new Date('2026-09-13T12:00:00Z'),
    })
    await seedSession({ status: 'COLLECTING', deadline: new Date('2026-09-20T12:00:00Z') })
    await seedSession({ status: 'DRAFT', deadline: new Date('2026-09-13T12:00:00Z') })

    const due = await findExpiredCollections(NOW)

    expect(due.map((row) => row.sessionId)).toEqual([past.sessionId])
  })
})

describe('reopening collection', () => {
  /*
   * The old behaviour marked everybody as not having answered and left their
   * answers in the table. The session then showed a party of silent people whose
   * stale answers still drove the heatmap and the ranking.
   */
  it('discards the answers themselves, not only the fact that they answered', async () => {
    const { sessionId, keeper } = await seedSession({ status: 'COLLECTING' })

    await db.insert(availabilitySlot).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: keeper.id,
      slotStartUtc: new Date('2026-10-08T16:00:00Z'),
      localDate: '2026-10-08',
      localHour: 18,
      state: 'YES',
      createdAt: NOW,
      updatedAt: NOW,
    })

    await db.transaction(async (tx) => {
      await clearResponses(sessionId, NOW, tx)
      await deleteAllAvailability(sessionId, tx)
    })

    const answers = await db
      .select()
      .from(availabilitySlot)
      .where(eq(availabilitySlot.gameSessionId, sessionId))
    const participants = await listParticipantRecords(sessionId)

    expect(answers).toEqual([])
    expect(participants.every((participant) => participant.respondedAt === null)).toBe(true)
  })
})
