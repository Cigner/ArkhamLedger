import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/client'
import { gameSession, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Aggregates on the session list.
 *
 * A dedicated file because it needs the campaign guard replaced: what is under
 * test is the SQL the real query generates, not the authorization around it, and
 * the two cannot be separated without stubbing the guard.
 *
 * This exists as a regression guard for a silent failure. The counts were
 * previously computed with correlated subqueries, which Drizzle renders without
 * the outer table's prefix; since session_participant also has an `id` column,
 * `sp.game_session_id = id` resolved against the subquery's own row and matched
 * nothing. No error, no warning — every session simply reported "0 of 0
 * answered" while the data was right there.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewerId = { current: '' }

vi.mock('@/modules/campaigns/data/guards', () => ({
  requireCampaignMember: () =>
    Promise.resolve({
      user: { id: viewerId.current },
      membership: { role: 'KEEPER', isOwner: true },
      status: 'ACTIVE',
    }),
}))

const { listCampaignSessions } = await import('@/modules/sessions/data/sessions')

beforeEach(async () => {
  await truncateAll()
})

describe('listCampaignSessions', () => {
  it('counts participants and answers, and reports the viewer’s own state', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
    const answered = await createUserRow({ status: 'ACTIVE' })
    const silent = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: answered.id })
    await addMemberRow({ campaignId: campaign.id, userId: silent.id })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: 'COLLECTING',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 2,
      timezone: 'Europe/Warsaw',
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    for (const [userId, responded] of [
      [keeper.id, true],
      [answered.id, true],
      [silent.id, false],
    ] as const) {
      await db.insert(sessionParticipant).values({
        id: newId(),
        gameSessionId: sessionId,
        userId,
        priority: 'PREFERRED',
        isKeeper: userId === keeper.id,
        respondedAt: responded ? NOW : null,
        attendance: 'UNKNOWN',
        createdAt: NOW,
        updatedAt: NOW,
      })
    }

    viewerId.current = silent.id
    const asSilent = await listCampaignSessions(campaign.id)

    expect(asSilent).toHaveLength(1)
    expect(asSilent[0]).toMatchObject({
      participantCount: 3,
      respondedCount: 2,
      viewerIsParticipant: true,
      viewerHasResponded: false,
    })

    viewerId.current = answered.id
    const asAnswered = await listCampaignSessions(campaign.id)
    expect(asAnswered[0]).toMatchObject({ viewerIsParticipant: true, viewerHasResponded: true })
  })

  it('reports a non-participant as such without hiding the session', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const bystander = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: bystander.id })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Keeper only so far',
      status: 'DRAFT',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: keeper.id,
      priority: 'REQUIRED',
      isKeeper: true,
      respondedAt: null,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    viewerId.current = bystander.id
    const rows = await listCampaignSessions(campaign.id)

    expect(rows[0]).toMatchObject({
      participantCount: 1,
      respondedCount: 0,
      viewerIsParticipant: false,
    })
  })

  it('returns zero counts for a session with nobody invited', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })

    await db.insert(gameSession).values({
      id: newId(),
      campaignId: campaign.id,
      title: 'Empty draft',
      status: 'DRAFT',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    viewerId.current = keeper.id
    const rows = await listCampaignSessions(campaign.id)

    expect(rows[0]).toMatchObject({ participantCount: 0, respondedCount: 0 })
  })
})
