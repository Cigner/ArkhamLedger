import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { gameSession, notificationDelivery, sessionParticipant, workerHeartbeat } from '@/db/schema'
import { newId } from '@/lib/ids'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * The campaign diary and the operations snapshot.
 *
 * Both answer a question somebody asks when they are worried: "are we playing
 * again" and "is anything broken". Both are therefore tested for the shape of
 * the answer in the states nobody wants — an empty diary and a dead worker.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '', role: 'KEEPER' as 'KEEPER' | 'INVESTIGATOR', isAdmin: true }

vi.mock('@/modules/campaigns/data/guards', () => ({
  requireCampaignMember: () =>
    Promise.resolve({
      user: { id: viewer.id },
      membership: { role: viewer.role, isOwner: true },
      status: 'ACTIVE',
    }),
  requireKeeper: () =>
    Promise.resolve({
      user: { id: viewer.id },
      membership: { role: viewer.role, isOwner: true },
      status: 'ACTIVE',
    }),
}))

vi.mock('@/lib/auth', async () => {
  const { ForbiddenError } = await import('@/lib/errors')
  return {
    requireUser: () => Promise.resolve({ id: viewer.id, name: 'Viewer', email: 'v@test' }),
    requireAdmin: () =>
      viewer.isAdmin
        ? Promise.resolve({ id: viewer.id, name: 'Viewer', role: 'admin' })
        : Promise.reject(new ForbiddenError()),
  }
})

const { getCampaignDiary } = await import('@/modules/sessions/data/sessions')
const { getOperationsSnapshot } = await import('@/modules/operations/data/metrics')

async function seedCampaign() {
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
  const campaign = await createCampaignRow({ ownerId: keeper.id, status: 'ACTIVE' })
  viewer.id = keeper.id
  viewer.isAdmin = true

  return { keeper, campaign }
}

async function seedSession(input: {
  campaignId: string
  createdBy: string
  status: 'DRAFT' | 'COLLECTING' | 'PROPOSED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  confirmedStartUtc?: Date | null
  deadline?: Date | null
  title?: string
}) {
  const id = newId()

  await db.insert(gameSession).values({
    id,
    campaignId: input.campaignId,
    title: input.title ?? 'A session',
    status: input.status,
    searchWindowStart: '2026-10-05',
    searchWindowEnd: '2026-10-12',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 1,
    availabilityDeadline: input.deadline ?? null,
    confirmedStartUtc: input.confirmedStartUtc ?? null,
    confirmedEndUtc: input.confirmedStartUtc
      ? new Date(input.confirmedStartUtc.getTime() + 6 * 3_600_000)
      : null,
    timezone: 'Europe/Warsaw',
    createdBy: input.createdBy,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return id
}

beforeEach(async () => {
  await truncateAll()
})

describe('the campaign diary', () => {
  it('reports nothing at all, which is the state worth acting on', async () => {
    const { campaign } = await seedCampaign()

    const diary = await getCampaignDiary(campaign.id)

    expect(diary.next).toBeNull()
    expect(diary.arranging).toEqual([])
    expect(diary.recent).toEqual([])
  })

  it('finds the soonest confirmed session still ahead', async () => {
    const { campaign, keeper } = await seedCampaign()

    const far = await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2026-11-01T18:00:00Z'),
      title: 'Later',
    })
    const soon = await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2026-10-01T18:00:00Z'),
      title: 'Sooner',
    })

    const diary = await getCampaignDiary(campaign.id)

    expect(diary.next?.id).toBe(soon)
    expect(diary.next?.id).not.toBe(far)
  })

  /*
   * A session that already happened is not the next session. Without the check
   * on the date, last month's evening would sit on the dashboard indefinitely
   * and the campaign would look healthy while quietly stalling.
   */
  it('does not offer a confirmed session that is in the past', async () => {
    const { campaign, keeper } = await seedCampaign()

    await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2020-01-01T18:00:00Z'),
    })

    expect((await getCampaignDiary(campaign.id)).next).toBeNull()
  })

  it('falls back to what is being arranged', async () => {
    const { campaign, keeper } = await seedCampaign()

    await seedSession({ campaignId: campaign.id, createdBy: keeper.id, status: 'COLLECTING' })

    const diary = await getCampaignDiary(campaign.id)

    expect(diary.next).toBeNull()
    expect(diary.arranging).toHaveLength(1)
  })

  it('remembers the last few played', async () => {
    const { campaign, keeper } = await seedCampaign()

    await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'COMPLETED',
      confirmedStartUtc: new Date('2026-08-01T18:00:00Z'),
      title: 'Played',
    })

    const diary = await getCampaignDiary(campaign.id)

    expect(diary.recent.map((entry) => entry.title)).toEqual(['Played'])
  })
})

describe('the operations snapshot', () => {
  it('is refused to anybody but an administrator', async () => {
    await seedCampaign()
    viewer.isAdmin = false

    await expect(getOperationsSnapshot(NOW)).rejects.toThrow()
  })

  it('counts a campaign with nothing planned', async () => {
    const { campaign, keeper } = await seedCampaign()
    await addMemberRow({ campaignId: campaign.id, userId: keeper.id, role: 'KEEPER' }).catch(
      () => undefined,
    )

    const idle = await getOperationsSnapshot(NOW)
    expect(idle.campaigns.idle).toBe(1)

    await seedSession({ campaignId: campaign.id, createdBy: keeper.id, status: 'COLLECTING' })

    const busy = await getOperationsSnapshot(NOW)
    expect(busy.campaigns.idle).toBe(0)
    expect(busy.sessions.collecting).toBe(1)
  })

  /*
   * A deadline still open after it passed means the worker has not run. One is a
   * timing artefact; a number that grows is an outage nobody has noticed yet.
   */
  it('counts deadlines that should have closed themselves', async () => {
    const { campaign, keeper } = await seedCampaign()

    await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'COLLECTING',
      deadline: new Date(NOW.getTime() - 60_000),
    })

    expect((await getOperationsSnapshot(NOW)).sessions.overdueDeadlines).toBe(1)
  })

  it('calls the worker stale when it has not reported', async () => {
    await seedCampaign()

    const silent = await getOperationsSnapshot(NOW)
    expect(silent.worker.stale).toBe(true)
    expect(silent.worker.lastBeatAt).toBeNull()

    await db.insert(workerHeartbeat).values({ id: 'worker', beatAt: NOW })

    const alive = await getOperationsSnapshot(new Date(NOW.getTime() + 30_000))
    expect(alive.worker.stale).toBe(false)
  })

  it('reports deliveries that were given up on', async () => {
    const { campaign, keeper } = await seedCampaign()
    const sessionId = await seedSession({
      campaignId: campaign.id,
      createdBy: keeper.id,
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2026-10-01T18:00:00Z'),
    })

    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId: keeper.id,
      priority: 'REQUIRED',
      isKeeper: true,
      respondedAt: NOW,
      attendance: 'UNKNOWN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    const { enqueueNotifications } = await import('@/modules/notifications/data/notifications')
    const { notificationIds } = await db.transaction(async (tx) =>
      enqueueNotifications({
        drafts: [
          {
            userId: keeper.id,
            type: 'SESSION_SCHEDULED',
            campaignId: campaign.id,
            gameSessionId: sessionId,
            payload: {},
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    await db
      .update(notificationDelivery)
      .set({ status: 'FAILED', lastError: 'no such mailbox', attempts: 5 })
      .where(eq(notificationDelivery.notificationId, notificationIds[0]!))

    const snapshot = await getOperationsSnapshot(NOW)

    expect(snapshot.deliveries.failed).toBeGreaterThan(0)
    expect(snapshot.deliveries.recentFailures[0]?.error).toBe('no such mailbox')
  })
})
