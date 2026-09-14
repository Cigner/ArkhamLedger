import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/client'
import { gameSession, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Availability privacy.
 *
 * The rule the product rests on: an Investigator sees aggregates, never who said
 * what, and never the priorities the Keeper assigned. Enforced by narrowing the
 * DTO in the data layer rather than by not rendering fields, so there is no
 * version of the payload that carries the information unused — which is what
 * makes it safe against a future component that renders everything it is given.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '', role: 'KEEPER' as 'KEEPER' | 'INVESTIGATOR' }

vi.mock('@/modules/campaigns/data/guards', () => ({
  requireCampaignMember: () =>
    Promise.resolve({
      user: { id: viewer.id },
      membership: { role: viewer.role, isOwner: false },
      status: 'ACTIVE',
    }),
  requireKeeper: () =>
    Promise.resolve({
      user: { id: viewer.id },
      membership: { role: viewer.role, isOwner: false },
      status: 'ACTIVE',
    }),
}))

const { getSessionDetail } = await import('@/modules/sessions/data/sessions')

async function seedSession() {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const required = await createUserRow({ status: 'ACTIVE', name: 'Required Player' })
  const optional = await createUserRow({ status: 'ACTIVE', name: 'Optional Player' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })
  await addMemberRow({ campaignId: campaign.id, userId: required.id })
  await addMemberRow({ campaignId: campaign.id, userId: optional.id })

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

  const rows = [
    { userId: keeper.id, priority: 'REQUIRED' as const, isKeeper: true, responded: true },
    { userId: required.id, priority: 'REQUIRED' as const, isKeeper: false, responded: true },
    { userId: optional.id, priority: 'OPTIONAL' as const, isKeeper: false, responded: false },
  ]

  for (const row of rows) {
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: row.userId,
      priority: row.priority,
      isKeeper: row.isKeeper,
      respondedAt: row.responded ? NOW : null,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  return { sessionId, keeper, required, optional }
}

beforeEach(async () => {
  await truncateAll()
})

describe('getSessionDetail as a Keeper', () => {
  it('includes every priority and every response time', async () => {
    const { sessionId, keeper, optional } = await seedSession()
    viewer.id = keeper.id
    viewer.role = 'KEEPER'

    const detail = await getSessionDetail(sessionId)

    expect(detail.participants).toHaveLength(3)
    expect(detail.participants.find((p) => p.userId === optional.id)?.priority).toBe('OPTIONAL')
    expect(detail.participants.filter((p) => p.respondedAt !== null)).toHaveLength(2)
    expect(detail.viewer.isKeeper).toBe(true)
  })
})

describe('getSessionDetail as an Investigator', () => {
  it('carries no real priorities at all', async () => {
    const { sessionId, optional } = await seedSession()
    viewer.id = optional.id
    viewer.role = 'INVESTIGATOR'

    const detail = await getSessionDetail(sessionId)

    // Every entry is flattened to the same placeholder; the distinctions the
    // Keeper made are simply not present in this payload.
    expect(new Set(detail.participants.map((p) => p.priority))).toEqual(new Set(['PREFERRED']))
    expect(JSON.stringify(detail)).not.toContain('OPTIONAL')
  })

  it('carries no per-person response times', async () => {
    const { sessionId, optional } = await seedSession()
    viewer.id = optional.id
    viewer.role = 'INVESTIGATOR'

    const detail = await getSessionDetail(sessionId)

    expect(detail.participants.every((p) => p.respondedAt === null)).toBe(true)
  })

  /*
   * The one slice of their own priority a player is told: whether the session
   * needs them. Useful, and not the same as being labelled "optional" in front
   * of the others.
   */
  it('tells a required player that they are needed', async () => {
    const { sessionId, required } = await seedSession()
    viewer.id = required.id
    viewer.role = 'INVESTIGATOR'

    const detail = await getSessionDetail(sessionId)

    expect(detail.viewer.ownPresenceRequired).toBe(true)
    expect(detail.viewer.isKeeper).toBe(false)
  })

  it('does not tell an optional player they are optional', async () => {
    const { sessionId, optional } = await seedSession()
    viewer.id = optional.id
    viewer.role = 'INVESTIGATOR'

    const detail = await getSessionDetail(sessionId)

    expect(detail.viewer.ownPresenceRequired).toBe(false)
  })

  it('still reports its own answer, so the player can see they replied', async () => {
    const { sessionId, required } = await seedSession()
    viewer.id = required.id
    viewer.role = 'INVESTIGATOR'

    const detail = await getSessionDetail(sessionId)

    expect(detail.viewer.ownResponse).not.toBeNull()
  })
})
