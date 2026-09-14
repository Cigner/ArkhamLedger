import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { gameSession, scheduleProposal, scheduleRun, sessionParticipant } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { DayRange } from '@/modules/availability/domain/types'
import { rankCandidates } from '@/modules/scheduling/domain/algorithm'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Scheduling against a real database.
 *
 * The algorithm is covered exhaustively by unit tests; what only a real database
 * can check is the join between the two worlds. An availability row comes back
 * from MySQL as a Date that stringifies with milliseconds, and the grid
 * generator produces instants without them — a mismatch there does not throw, it
 * silently reports that nobody is available, which is indistinguishable from a
 * group that genuinely cannot meet.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '', role: 'KEEPER' as 'KEEPER' | 'INVESTIGATOR' }

vi.mock('@/modules/campaigns/data/guards', async () => {
  const { ForbiddenError } = await import('@/lib/errors')
  const context = () =>
    Promise.resolve({
      user: { id: viewer.id },
      membership: { role: viewer.role, isOwner: false },
      status: 'ACTIVE',
    })

  return {
    requireCampaignMember: context,
    requireKeeper: () =>
      viewer.role === 'KEEPER' ? context() : Promise.reject(new ForbiddenError()),
  }
})

const { saveOwnAvailability } = await import('@/modules/availability/data/availability')
const { getSchedulingView, insertRun, loadSchedulingInput } = await import(
  '@/modules/scheduling/data/runs'
)

async function seedSession(options: { quorum?: number; minSessionHours?: number } = {}) {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Marek' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })

  const players = await Promise.all(
    ['Anna', 'Piotr', 'Kasia'].map((name) => createUserRow({ status: 'ACTIVE', name })),
  )
  for (const player of players) {
    await addMemberRow({ campaignId: campaign.id, userId: player.id })
  }

  const sessionId = newId()
  await db.insert(gameSession).values({
    id: sessionId,
    campaignId: campaign.id,
    title: 'The Corbitt House',
    status: 'COLLECTING',
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-08',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: options.minSessionHours ?? 6,
    quorum: options.quorum ?? 2,
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

  viewer.id = keeper.id
  viewer.role = 'KEEPER'

  return { sessionId, campaign, keeper, players }
}

async function record(sessionId: string, userId: string, ranges: readonly DayRange[]) {
  await db.transaction(async (tx) =>
    saveOwnAvailability({ sessionId, userId, ranges, now: NOW, executor: tx }),
  )
}

function free(date: string, fromHour = 12, toHour = 24): DayRange {
  return { date, state: 'YES', fromHour, toHour }
}

beforeEach(async () => {
  await truncateAll()
})

describe('loading what the algorithm scores', () => {
  it('matches stored answers to the hours of the generated grid', async () => {
    const { sessionId, keeper, players } = await seedSession()

    await record(sessionId, keeper.id, [free('2026-10-08', 18, 24)])
    await record(sessionId, players[0]!.id, [free('2026-10-08', 18, 24)])
    await record(sessionId, players[1]!.id, [free('2026-10-08', 18, 24)])

    const { input } = await loadSchedulingInput(sessionId)
    const keeperAnswer = input.participants.find((person) => person.userId === keeper.id)

    expect(keeperAnswer?.availability.size).toBe(6)
    expect(keeperAnswer?.availability.get('2026-10-08T16:00:00Z')).toBe('YES')
  })

  it('finds the evening three people said they were free', async () => {
    const { sessionId, keeper, players } = await seedSession({ quorum: 2 })

    for (const user of [keeper, players[0]!, players[1]!]) {
      await record(sessionId, user.id, [free('2026-10-08', 18, 24)])
    }

    const { input } = await loadSchedulingInput(sessionId)
    const result = rankCandidates(input)

    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0]?.startUtc).toBe('2026-10-08T16:00:00Z')
    expect(result.ranked[0]?.breakdown.availableCount).toBe(2)
  })

  it('carries the parameters the run was asked to solve', async () => {
    const { sessionId } = await seedSession({ quorum: 3 })

    const { params } = await loadSchedulingInput(sessionId)

    expect(params).toMatchObject({
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-08',
      quorum: 3,
      timezone: 'Europe/Warsaw',
      participantCount: 4,
      respondentCount: 0,
    })
  })

  it('treats somebody who never answered as unavailable rather than missing', async () => {
    const { sessionId, keeper } = await seedSession()

    await record(sessionId, keeper.id, [free('2026-10-08')])

    const { input } = await loadSchedulingInput(sessionId)

    expect(input.participants).toHaveLength(4)
    expect(input.participants.filter((person) => !person.hasResponded)).toHaveLength(3)
  })
})

describe('storing a run', () => {
  it('round-trips proposals through the database unchanged', async () => {
    const { sessionId, keeper, players } = await seedSession()

    for (const user of [keeper, players[0]!, players[1]!]) {
      await record(sessionId, user.id, [free('2026-10-08', 18, 24)])
    }

    const { input, params } = await loadSchedulingInput(sessionId)
    const output = rankCandidates(input)

    await db.transaction(async (tx) =>
      insertRun({ sessionId, output, params, triggeredBy: keeper.id, now: NOW, executor: tx }),
    )

    const view = await getSchedulingView(sessionId)

    expect(view.proposals).toHaveLength(output.ranked.length)
    expect(view.proposals[0]?.score).toBe(output.ranked[0]?.score)
    expect(view.proposals[0]?.breakdown).toEqual(output.ranked[0]?.breakdown)
    expect(view.proposals[0]?.explanation).toEqual(output.ranked[0]?.explanation)
    expect(view.proposals[0]?.startUtc.toISOString()).toBe('2026-10-08T16:00:00.000Z')
  })

  it('keeps the summary of what blocked the rest', async () => {
    const { sessionId, players } = await seedSession()

    await record(sessionId, players[0]!.id, [free('2026-10-08')])

    const { input, params } = await loadSchedulingInput(sessionId)
    const output = rankCandidates(input)

    await db.transaction(async (tx) =>
      insertRun({ sessionId, output, params, triggeredBy: null, now: NOW, executor: tx }),
    )

    const view = await getSchedulingView(sessionId)

    expect(view.proposals).toEqual([])
    expect(view.run?.summary.byReason.KEEPER_UNAVAILABLE).toBeGreaterThan(0)
    expect(view.run?.summary.windowsConsidered).toBe(view.run?.summary.windowsRejected)
  })

  it('keeps every run rather than overwriting the last', async () => {
    const { sessionId, keeper } = await seedSession()

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { input, params } = await loadSchedulingInput(sessionId)
      const output = rankCandidates(input)
      await db.transaction(async (tx) =>
        insertRun({ sessionId, output, params, triggeredBy: keeper.id, now: NOW, executor: tx }),
      )
    }

    const runs = await db
      .select()
      .from(scheduleRun)
      .where(eq(scheduleRun.gameSessionId, sessionId))

    expect(runs).toHaveLength(2)
  })

  /*
   * A run is a snapshot. Answering afterwards does not change what it found, so
   * the screen says the ranking is out of date rather than quietly re-running.
   */
  it('reports a ranking as out of date once somebody answers again', async () => {
    const { sessionId, keeper, players } = await seedSession()

    await record(sessionId, keeper.id, [free('2026-10-08', 18, 24)])

    const { input, params } = await loadSchedulingInput(sessionId)
    await db.transaction(async (tx) =>
      insertRun({
        sessionId,
        output: rankCandidates(input),
        params,
        triggeredBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect((await getSchedulingView(sessionId)).run?.staleAnswers).toBe(false)

    await db.transaction(async (tx) =>
      saveOwnAvailability({
        sessionId,
        userId: players[0]!.id,
        ranges: [free('2026-10-08', 18, 24)],
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    expect((await getSchedulingView(sessionId)).run?.staleAnswers).toBe(true)
  })
})

describe('who may read a ranking', () => {
  /*
   * A proposal explains itself by naming who is only free at a push. That is
   * named availability, so the whole screen is the Keeper's — an Investigator is
   * refused at the query rather than served a blanked copy.
   */
  it('refuses an Investigator', async () => {
    const { sessionId, players } = await seedSession()

    viewer.id = players[0]!.id
    viewer.role = 'INVESTIGATOR'

    await expect(getSchedulingView(sessionId)).rejects.toThrow()
  })

  it('gives a Keeper the names a breakdown needs', async () => {
    const { sessionId, keeper } = await seedSession()

    const view = await getSchedulingView(sessionId)

    expect(view.names[keeper.id]).toBe('Marek')
    expect(Object.keys(view.names)).toHaveLength(4)
  })
})

describe('proposals of a session that was scheduled', () => {
  it('marks the accepted one', async () => {
    const { sessionId, keeper, players } = await seedSession()

    for (const user of [keeper, players[0]!, players[1]!]) {
      await record(sessionId, user.id, [free('2026-10-08', 18, 24)])
    }

    const { input, params } = await loadSchedulingInput(sessionId)
    await db.transaction(async (tx) =>
      insertRun({
        sessionId,
        output: rankCandidates(input),
        params,
        triggeredBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    const [proposal] = await db
      .select()
      .from(scheduleProposal)
      .where(eq(scheduleProposal.gameSessionId, sessionId))

    await db
      .update(gameSession)
      .set({ acceptedProposalId: proposal!.id, status: 'SCHEDULED' })
      .where(eq(gameSession.id, sessionId))

    const view = await getSchedulingView(sessionId)

    expect(view.acceptedProposalId).toBe(proposal!.id)
    expect(view.canRun).toBe(false)
  })
})
