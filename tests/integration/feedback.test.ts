import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  issueReport,
  notification,
  notificationDelivery,
  notificationPreference,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { createUserRow, truncateAll } from './helpers/fixtures'

const NOW = new Date('2026-09-16T18:00:00.000Z')

vi.mock('@/lib/auth', () => ({
  requireAdmin: () =>
    Promise.resolve({
      id: '01H00000000000000000000001',
      role: 'admin',
      name: 'Administrator',
    }),
}))

const { insertIssueReport, listActiveAdministratorIds, listIssueReports, setIssueReportStatus } =
  await import('@/modules/feedback/data/reports')
const { enqueueNotifications } = await import('@/modules/notifications/data/notifications')

beforeEach(async () => {
  await truncateAll()
})

describe('problem reports', () => {
  it('stores the report and forces an email to every active administrator', async () => {
    const reporter = await createUserRow({ status: 'ACTIVE', name: 'Anna' })
    const administrator = await createUserRow({
      status: 'ACTIVE',
      role: 'admin',
      name: 'Warden',
    })
    await createUserRow({ status: 'DISABLED', role: 'admin', name: 'Disabled Warden' })

    await db.insert(notificationPreference).values({
      id: newId(),
      userId: administrator.id,
      channel: 'EMAIL',
      enabled: false,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const reportId = await db.transaction(async (tx) => {
      const id = await insertIssueReport({
        reporterId: reporter.id,
        message: 'The scheduling dialog remained open after saving.',
        sourcePath: '/sessions/example/scheduling',
        now: NOW,
        executor: tx,
      })
      const administratorIds = await listActiveAdministratorIds(tx)

      expect(administratorIds).toEqual([administrator.id])

      await enqueueNotifications({
        drafts: administratorIds.map((userId) => ({
          userId,
          type: 'ISSUE_REPORTED' as const,
          payload: {
            reportId: id,
            reportMessage: 'The scheduling dialog remained open after saving.',
            actorName: reporter.name,
            reporterEmail: reporter.email,
            sourcePath: '/sessions/example/scheduling',
          },
          requiredChannels: ['EMAIL'] as const,
        })),
        now: NOW,
        executor: tx,
      })

      return id
    })

    const [saved] = await db.select().from(issueReport).where(eq(issueReport.id, reportId))
    const [event] = await db
      .select()
      .from(notification)
      .where(eq(notification.type, 'ISSUE_REPORTED'))
    const deliveries = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.notificationId, event!.id))

    expect(saved).toMatchObject({
      reporterId: reporter.id,
      status: 'NEW',
      sourcePath: '/sessions/example/scheduling',
    })
    expect(deliveries.map((row) => row.channel).sort()).toEqual(['EMAIL', 'IN_APP'])

    const listed = await listIssueReports()
    expect(listed[0]).toMatchObject({
      id: reportId,
      reporterName: 'Anna',
      reporterEmail: reporter.email,
      status: 'NEW',
    })
  })

  it('records who changed the workflow status and when', async () => {
    const reporter = await createUserRow({ status: 'ACTIVE' })
    const administrator = await createUserRow({ status: 'ACTIVE', role: 'admin' })
    const reportId = await insertIssueReport({
      reporterId: reporter.id,
      message: 'The campaign list needs a more useful empty state.',
      sourcePath: '/campaigns',
      now: NOW,
      executor: db,
    })

    await setIssueReportStatus({
      reportId,
      status: 'PLANNED',
      actorId: administrator.id,
      now: NOW,
      executor: db,
    })

    const [saved] = await db.select().from(issueReport).where(eq(issueReport.id, reportId))
    expect(saved).toMatchObject({
      status: 'PLANNED',
      statusChangedBy: administrator.id,
      statusChangedAt: NOW,
    })
  })
})
