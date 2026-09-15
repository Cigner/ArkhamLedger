import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  authUser,
  availabilitySlot,
  campaignMember,
  gameSession,
  notification,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Removing an account, against a real database.
 *
 * The cascades and the restrictions are the whole mechanism, and neither is
 * visible from TypeScript: what survives a soft removal and what a hard one
 * destroys is decided by foreign keys, so it is checked by counting rows.
 */
const NOW = new Date('2026-09-15T12:00:00.000Z')

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => Promise.resolve({ id: 'admin', name: 'Admin', role: 'admin' }),
  requireUser: () => Promise.resolve({ id: 'admin', name: 'Admin', email: 'a@test' }),
}))

const { countDeletionBlockers, hardDeleteUser, softDeleteUser, listUsersForAdmin } =
  await import('@/modules/identity/data/users')

async function seedPlayer() {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
  const player = await createUserRow({ status: 'ACTIVE', name: 'Anna' })
  const campaign = await createCampaignRow({ ownerId: keeper.id, status: 'ACTIVE' })
  await addMemberRow({ campaignId: campaign.id, userId: player.id })

  const sessionId = newId()
  await db.insert(gameSession).values({
    id: sessionId,
    campaignId: campaign.id,
    title: 'Chapter Two',
    status: 'COLLECTING',
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-12',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 1,
    timezone: 'Europe/Warsaw',
    // Created by the Keeper: the player authored nothing.
    createdBy: keeper.id,
    createdAt: NOW,
    updatedAt: NOW,
  })

  await db.insert(sessionParticipant).values({
    id: newId(),
    gameSessionId: sessionId,
    userId: player.id,
    priority: 'PREFERRED',
    isKeeper: false,
    respondedAt: NOW,
    attendance: 'ATTENDED',
    createdAt: NOW,
    updatedAt: NOW,
  })

  await db.insert(availabilitySlot).values({
    id: newId(),
    gameSessionId: sessionId,
    userId: player.id,
    slotStartUtc: new Date('2026-10-08T16:00:00Z'),
    localDate: '2026-10-08',
    localHour: 18,
    state: 'YES',
    createdAt: NOW,
    updatedAt: NOW,
  })

  await db.insert(notification).values({
    id: newId(),
    userId: player.id,
    type: 'AVAILABILITY_REQUESTED',
    campaignId: campaign.id,
    gameSessionId: sessionId,
    payload: {},
    readAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return { keeper, player, campaign, sessionId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('what stands in the way', () => {
  it('counts nothing for somebody who only ever played', async () => {
    const { player } = await seedPlayer()

    expect(await countDeletionBlockers(player.id)).toEqual({
      ownedCampaigns: 0,
      createdSessions: 0,
      createdInvitations: 0,
      createdScenarios: 0,
      issuedActivationTokens: 0,
    })
  })

  it('counts what a Keeper authored', async () => {
    const { keeper } = await seedPlayer()

    const blockers = await countDeletionBlockers(keeper.id)

    expect(blockers.ownedCampaigns).toBe(1)
    expect(blockers.createdSessions).toBe(1)
  })

  it('reports the same counts on the administration list', async () => {
    const { keeper, player } = await seedPlayer()

    const users = await listUsersForAdmin()
    const byId = new Map(users.map((user) => [user.id, user]))

    expect(byId.get(keeper.id)?.deletionBlockers.ownedCampaigns).toBe(1)
    expect(byId.get(player.id)?.deletionBlockers.ownedCampaigns).toBe(0)
  })
})

describe('closing an account', () => {
  it('keeps everything the person did', async () => {
    const { player } = await seedPlayer()

    await db.transaction(async (tx) =>
      softDeleteUser({ userId: player.id, now: NOW, executor: tx }),
    )

    const [row] = await db.select().from(authUser).where(eq(authUser.id, player.id))
    const participation = await db
      .select()
      .from(sessionParticipant)
      .where(eq(sessionParticipant.userId, player.id))
    const answers = await db
      .select()
      .from(availabilitySlot)
      .where(eq(availabilitySlot.userId, player.id))

    expect(row?.deletedAt).not.toBeNull()
    expect(row?.status).toBe('DISABLED')
    expect(participation).toHaveLength(1)
    expect(participation[0]?.attendance).toBe('ATTENDED')
    expect(answers).toHaveLength(1)
  })

  /*
   * An account nobody can sign into must stop being waited on. Left ACTIVE it
   * would sit in the party list, count towards quorum, and hold up a session
   * for an answer that can never arrive.
   */
  it('ends their memberships', async () => {
    const { player } = await seedPlayer()

    await db.transaction(async (tx) =>
      softDeleteUser({ userId: player.id, now: NOW, executor: tx }),
    )

    const [membership] = await db
      .select()
      .from(campaignMember)
      .where(eq(campaignMember.userId, player.id))

    expect(membership?.status).toBe('REMOVED')
    expect(membership?.leftAt).not.toBeNull()
  })

  it('takes them off the administration list', async () => {
    const { player } = await seedPlayer()

    await db.transaction(async (tx) =>
      softDeleteUser({ userId: player.id, now: NOW, executor: tx }),
    )

    const users = await listUsersForAdmin()

    expect(users.map((user) => user.id)).not.toContain(player.id)
  })
})

describe('erasing the row', () => {
  it('takes everything addressed to them with it', async () => {
    const { player } = await seedPlayer()

    await db.transaction(async (tx) => hardDeleteUser({ userId: player.id, executor: tx }))

    const remaining = await Promise.all([
      db.select().from(authUser).where(eq(authUser.id, player.id)),
      db.select().from(campaignMember).where(eq(campaignMember.userId, player.id)),
      db.select().from(sessionParticipant).where(eq(sessionParticipant.userId, player.id)),
      db.select().from(availabilitySlot).where(eq(availabilitySlot.userId, player.id)),
      db.select().from(notification).where(eq(notification.userId, player.id)),
    ])

    expect(remaining.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0])
  })

  /*
   * The database is the last line, and it holds. Every foreign key naming an
   * author restricts, so an erase that the rule wrongly permitted fails loudly
   * instead of destroying somebody else's history.
   */
  it('is refused by the database for somebody who authored something', async () => {
    const { keeper } = await seedPlayer()

    await expect(
      db.transaction(async (tx) => hardDeleteUser({ userId: keeper.id, executor: tx })),
    ).rejects.toThrow()

    const [row] = await db.select().from(authUser).where(eq(authUser.id, keeper.id))
    expect(row).toBeDefined()
  })
})
