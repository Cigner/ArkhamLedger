import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { availabilitySlot, gameSession, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import { MIN_RESPONDENTS_FOR_HEATMAP } from '@/modules/availability/domain/aggregate'
import type { DayRange } from '@/modules/availability/domain/types'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Availability against a real database.
 *
 * The privacy rule is the reason this file exists. It is enforced by what the
 * query returns rather than by what a component renders, so it has to be checked
 * on the payload — a screenshot of a page that happens not to show names proves
 * nothing about the data behind it.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '', role: 'INVESTIGATOR' as 'KEEPER' | 'INVESTIGATOR' }

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

const { getAvailabilityView, saveOwnAvailability, findPreviousAnswer } =
  await import('@/modules/availability/data/availability')

async function seedSession(participantCount = 4) {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })

  const players = await Promise.all(
    Array.from({ length: participantCount - 1 }, (_, index) =>
      createUserRow({ status: 'ACTIVE', name: `Player ${index + 1}` }),
    ),
  )
  for (const player of players) {
    await addMemberRow({ campaignId: campaign.id, userId: player.id })
  }

  const sessionId = newId()
  await db.insert(gameSession).values({
    id: sessionId,
    campaignId: campaign.id,
    title: 'Chapter Two',
    status: 'COLLECTING',
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-08',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 2,
    timezone: 'Europe/Warsaw',
    createdBy: keeper.id,
    createdAt: NOW,
    updatedAt: NOW,
  })

  for (const user of [keeper, ...players]) {
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: user.id,
      priority: user.id === keeper.id ? 'REQUIRED' : 'PREFERRED',
      isKeeper: user.id === keeper.id,
      respondedAt: null,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  return { sessionId, keeper, players }
}

function answer(date: string, fromHour: number, toHour: number): DayRange {
  return { date, state: 'YES', fromHour, toHour }
}

async function record(sessionId: string, userId: string, ranges: readonly DayRange[]) {
  await db.transaction(async (tx) =>
    saveOwnAvailability({ sessionId, userId, ranges, now: NOW, executor: tx }),
  )
}

beforeEach(async () => {
  await truncateAll()
})

describe('saving', () => {
  it('expands a range into the hours it covers', async () => {
    const { sessionId, keeper } = await seedSession()

    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])

    const rows = await db
      .select()
      .from(availabilitySlot)
      .where(eq(availabilitySlot.userId, keeper.id))

    expect(rows).toHaveLength(6)
    expect(rows.map((row) => row.localHour).sort((a, b) => a - b)).toEqual([18, 19, 20, 21, 22, 23])
  })

  it('replaces the previous answer rather than adding to it', async () => {
    const { sessionId, keeper } = await seedSession()

    await record(sessionId, keeper.id, [answer('2026-10-08', 12, 24)])
    await record(sessionId, keeper.id, [answer('2026-10-08', 20, 24)])

    const rows = await db
      .select()
      .from(availabilitySlot)
      .where(eq(availabilitySlot.userId, keeper.id))

    expect(rows).toHaveLength(4)
  })

  /*
   * "I cannot make any of these" is an answer. Leaving respondedAt null would
   * make a deliberate refusal indistinguishable from silence, and the two mean
   * opposite things to a Keeper chasing replies.
   */
  it('marks somebody as having answered even when they refused everything', async () => {
    const { sessionId, keeper } = await seedSession()

    await record(sessionId, keeper.id, [
      { date: '2026-10-05', state: 'NO', fromHour: 0, toHour: 0 },
      { date: '2026-10-06', state: 'NO', fromHour: 0, toHour: 0 },
    ])

    const [participant] = await db
      .select()
      .from(sessionParticipant)
      .where(eq(sessionParticipant.userId, keeper.id))

    expect(participant?.respondedAt).not.toBeNull()
  })

  it('records a refusal against every hour of that day', async () => {
    const { sessionId, keeper } = await seedSession()

    await record(sessionId, keeper.id, [
      { date: '2026-10-05', state: 'NO', fromHour: 0, toHour: 0 },
    ])

    const rows = await db
      .select()
      .from(availabilitySlot)
      .where(eq(availabilitySlot.userId, keeper.id))

    expect(rows).toHaveLength(12)
    expect(rows.every((row) => row.state === 'NO')).toBe(true)
  })

  it('round-trips through the view unchanged', async () => {
    const { sessionId, keeper } = await seedSession()
    viewer.id = keeper.id
    viewer.role = 'KEEPER'

    await record(sessionId, keeper.id, [answer('2026-10-06', 19, 23)])

    const view = await getAvailabilityView(sessionId)
    const day = view.own.find((range) => range.date === '2026-10-06')

    expect(day).toEqual({ date: '2026-10-06', state: 'YES', fromHour: 19, toHour: 23 })
  })
})

describe('what an Investigator receives', () => {
  it('carries no participant names', async () => {
    const { sessionId, keeper, players } = await seedSession()
    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])
    for (const player of players) {
      await record(sessionId, player.id, [answer('2026-10-08', 18, 24)])
    }

    viewer.id = players[0]!.id
    viewer.role = 'INVESTIGATOR'

    const view = await getAvailabilityView(sessionId)

    expect(view.participants).toEqual([])
    expect(JSON.stringify(view)).not.toContain('Keeper')
    expect(JSON.stringify(view)).not.toContain('Player 2')
  })

  it('still carries the counts and their own answer', async () => {
    const { sessionId, keeper, players } = await seedSession()
    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])
    for (const player of players) {
      await record(sessionId, player.id, [answer('2026-10-08', 18, 24)])
    }

    viewer.id = players[0]!.id
    viewer.role = 'INVESTIGATOR'

    const view = await getAvailabilityView(sessionId)

    expect(view.respondentCount).toBe(4)
    expect(view.own.find((range) => range.date === '2026-10-08')?.state).toBe('YES')
    expect(view.windows[0]).toMatchObject({ date: '2026-10-08', available: 4, quorumMet: true })
  })

  /*
   * With one or two answers, a per-hour count plus the viewer's own answer names
   * the other person exactly. The ranked windows are still shown — they are the
   * useful part — but the breakdown waits until there is cover to hide in.
   */
  it('withholds the hour-by-hour breakdown until enough people have answered', async () => {
    const { sessionId, keeper, players } = await seedSession()
    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])
    await record(sessionId, players[0]!.id, [answer('2026-10-08', 18, 24)])

    viewer.id = players[0]!.id
    viewer.role = 'INVESTIGATOR'

    const view = await getAvailabilityView(sessionId)

    expect(view.respondentCount).toBeLessThan(MIN_RESPONDENTS_FOR_HEATMAP)
    expect(view.tallies).toEqual([])
    // The part they actually need survives the restriction.
    expect(view.windows.length).toBeGreaterThan(0)
  })

  it('releases the breakdown once the threshold is reached', async () => {
    const { sessionId, keeper, players } = await seedSession()
    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])
    for (const player of players.slice(0, 2)) {
      await record(sessionId, player.id, [answer('2026-10-08', 18, 24)])
    }

    viewer.id = players[0]!.id
    viewer.role = 'INVESTIGATOR'

    const view = await getAvailabilityView(sessionId)

    expect(view.respondentCount).toBe(MIN_RESPONDENTS_FOR_HEATMAP)
    expect(view.tallies.length).toBeGreaterThan(0)
  })
})

describe('what a Keeper receives', () => {
  it('carries every name against every answer', async () => {
    const { sessionId, keeper, players } = await seedSession()
    await record(sessionId, players[0]!.id, [answer('2026-10-08', 18, 24)])

    viewer.id = keeper.id
    viewer.role = 'KEEPER'

    const view = await getAvailabilityView(sessionId)

    expect(view.participants).toHaveLength(4)
    expect(view.participants.map((participant) => participant.name)).toContain('Player 1')
  })

  /*
   * A Keeper reading two answers is reading their own data; the threshold exists
   * to stop players triangulating each other, not to hide the group from the
   * person organising it.
   */
  it('sees the breakdown regardless of how few have answered', async () => {
    const { sessionId, keeper } = await seedSession()
    await record(sessionId, keeper.id, [answer('2026-10-08', 18, 24)])

    viewer.id = keeper.id
    viewer.role = 'KEEPER'

    const view = await getAvailabilityView(sessionId)

    expect(view.respondentCount).toBe(1)
    expect(view.tallies.length).toBeGreaterThan(0)
  })
})

describe('same as last time', () => {
  it('finds the previous answer and keys it by weekday', async () => {
    const { keeper } = await seedSession()
    const campaign = await db.query.gameSession.findFirst({ columns: { campaignId: true } })

    const earlier = newId()
    await db.insert(gameSession).values({
      id: earlier,
      campaignId: campaign!.campaignId,
      title: 'Chapter One',
      status: 'COMPLETED',
      searchWindowStart: '2026-09-01',
      searchWindowEnd: '2026-09-07',
      gridStartHour: 12,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 2,
      timezone: 'Europe/Warsaw',
      createdBy: keeper.id,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: NOW,
    })
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: earlier,
      userId: keeper.id,
      priority: 'REQUIRED',
      isKeeper: true,
      respondedAt: NOW,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })
    // Thursday 3 September.
    await record(earlier, keeper.id, [answer('2026-09-03', 19, 24)])

    const current = await db.query.gameSession.findFirst({
      where: eq(gameSession.title, 'Chapter Two'),
      columns: { id: true },
    })

    const previous = await findPreviousAnswer({
      sessionId: current!.id,
      campaignId: campaign!.campaignId,
      userId: keeper.id,
    })

    expect(previous?.sessionTitle).toBe('Chapter One')
    // Thursday is weekday 4; the dates themselves do not repeat, the weekday does.
    expect(previous?.byWeekday.get(4)).toMatchObject({ fromHour: 19, toHour: 24 })
  })

  it('reports nothing when there is no earlier answer', async () => {
    const { sessionId, keeper } = await seedSession()
    const session = await db.query.gameSession.findFirst({ columns: { campaignId: true } })

    const previous = await findPreviousAnswer({
      sessionId,
      campaignId: session!.campaignId,
      userId: keeper.id,
    })

    expect(previous).toBeNull()
  })
})
