import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/client'
import { gameSession } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { SessionStatus } from '@/modules/sessions/domain/types'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const viewerId = { current: '' }

vi.mock('@/lib/auth', () => ({
  requireUser: () =>
    Promise.resolve({
      id: viewerId.current,
      role: 'user',
      status: 'ACTIVE',
      name: 'Viewer',
      email: 'viewer@example.test',
    }),
}))

const { getSidebarNavigation } = await import('@/modules/navigation/data/sidebar')

beforeEach(async () => {
  await truncateAll()
})

describe('sidebar shortcuts', () => {
  it('ranks relevant campaigns and sessions and returns at most five of each', async () => {
    const viewer = await createUserRow({ status: 'ACTIVE' })
    viewerId.current = viewer.id

    const fixtures = [
      {
        campaign: 'Upcoming later',
        session: 'Later',
        status: 'SCHEDULED' as const,
        start: '2026-10-10T17:00:00.000Z',
        updated: '2026-09-20T12:00:00.000Z',
      },
      {
        campaign: 'Recent newer',
        session: 'Recently played',
        status: 'COMPLETED' as const,
        start: '2026-09-28T17:00:00.000Z',
        updated: '2026-09-28T23:00:00.000Z',
      },
      {
        campaign: 'Arranging',
        session: 'Finding a date',
        status: 'COLLECTING' as const,
        start: null,
        updated: '2026-09-30T12:00:00.000Z',
      },
      {
        campaign: 'Upcoming soon',
        session: 'Tomorrow',
        status: 'SCHEDULED' as const,
        start: '2026-10-02T17:00:00.000Z',
        updated: '2026-09-29T12:00:00.000Z',
      },
      {
        campaign: 'Recent older',
        session: 'Played last week',
        status: 'COMPLETED' as const,
        start: '2026-09-22T17:00:00.000Z',
        updated: '2026-09-22T23:00:00.000Z',
      },
      {
        campaign: 'Campaign only',
        session: 'Cancelled plan',
        status: 'CANCELLED' as const,
        start: '2026-10-03T17:00:00.000Z',
        updated: '2026-09-27T12:00:00.000Z',
      },
    ]

    for (const fixture of fixtures) {
      const campaign = await createCampaignRow({
        ownerId: viewer.id,
        name: fixture.campaign,
        status: 'ACTIVE',
      })
      await insertSession({
        campaignId: campaign.id,
        createdBy: viewer.id,
        title: fixture.session,
        status: fixture.status,
        confirmedStartUtc: fixture.start ? new Date(fixture.start) : null,
        updatedAt: new Date(fixture.updated),
      })
    }

    const outsider = await createUserRow({ status: 'ACTIVE' })
    const archived = await createCampaignRow({
      ownerId: viewer.id,
      name: 'Archived',
      status: 'ARCHIVED',
    })
    await insertSession({
      campaignId: archived.id,
      createdBy: viewer.id,
      title: 'Archived future',
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2026-10-01T13:00:00.000Z'),
      updatedAt: NOW,
    })

    const left = await createCampaignRow({
      ownerId: outsider.id,
      name: 'Already left',
      status: 'ACTIVE',
    })
    await addMemberRow({ campaignId: left.id, userId: viewer.id, status: 'LEFT' })
    await insertSession({
      campaignId: left.id,
      createdBy: outsider.id,
      title: 'Invisible future',
      status: 'SCHEDULED',
      confirmedStartUtc: new Date('2026-10-01T14:00:00.000Z'),
      updatedAt: NOW,
    })

    const navigation = await getSidebarNavigation(NOW)

    expect(navigation.campaigns.map((item) => item.name)).toEqual([
      'Upcoming soon',
      'Upcoming later',
      'Arranging',
      'Recent newer',
      'Recent older',
    ])
    expect(navigation.sessions.map((item) => item.title)).toEqual([
      'Tomorrow',
      'Later',
      'Finding a date',
      'Recently played',
      'Played last week',
    ])
    expect(navigation.sessions.every((item) => item.title !== 'Cancelled plan')).toBe(true)
  })
})

async function insertSession(input: {
  campaignId: string
  createdBy: string
  title: string
  status: SessionStatus
  confirmedStartUtc: Date | null
  updatedAt: Date
}): Promise<void> {
  await db.insert(gameSession).values({
    id: newId(),
    campaignId: input.campaignId,
    title: input.title,
    status: input.status,
    searchWindowStart: '2026-10-01',
    searchWindowEnd: '2026-10-31',
    gridStartHour: 12,
    gridEndHour: 24,
    minSessionHours: 6,
    quorum: 1,
    timezone: 'Europe/Warsaw',
    confirmedStartUtc: input.confirmedStartUtc,
    confirmedEndUtc: input.confirmedStartUtc
      ? new Date(input.confirmedStartUtc.getTime() + 6 * 60 * 60 * 1000)
      : null,
    createdBy: input.createdBy,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  })
}
