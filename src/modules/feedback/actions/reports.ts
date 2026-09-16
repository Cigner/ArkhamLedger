'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { RateLimitError } from '@/lib/errors'
import { adminActionClient, authActionClient } from '@/lib/safe-action'
import { consumeAttempt } from '@/lib/throttle'
import { enqueueNotifications } from '@/modules/notifications/data/notifications'
import {
  insertIssueReport,
  listActiveAdministratorIds,
  setIssueReportStatus,
} from '../data/reports'
import { submitIssueReportSchema, updateIssueReportStatusSchema } from '../domain/schemas'

export const submitIssueReport = authActionClient
  .metadata({ name: 'feedback.submitIssueReport' })
  .inputSchema(submitIssueReportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const decision = await consumeAttempt('feedback', ctx.user.id)
    if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds)

    const now = new Date()

    const reportId = await db.transaction(async (tx) => {
      const id = await insertIssueReport({
        reporterId: ctx.user.id,
        message: parsedInput.message,
        sourcePath: parsedInput.sourcePath,
        now,
        executor: tx,
      })

      const administrators = await listActiveAdministratorIds(tx)

      await enqueueNotifications({
        drafts: administrators.map((userId) => ({
          userId,
          type: 'ISSUE_REPORTED' as const,
          payload: {
            reportId: id,
            reportMessage: parsedInput.message,
            actorName: ctx.user.name,
            reporterEmail: ctx.user.email,
            sourcePath: parsedInput.sourcePath,
          },
          requiredChannels: ['EMAIL'] as const,
        })),
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'feedback.reportSubmitted',
          entityType: 'issueReport',
          entityId: id,
          metadata: { sourcePath: parsedInput.sourcePath },
        },
        tx,
      )

      return id
    })

    revalidatePath('/admin/reports')
    return { ok: true, reportId }
  })

export const updateIssueReportStatus = adminActionClient
  .metadata({ name: 'feedback.updateIssueReportStatus' })
  .inputSchema(updateIssueReportStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    const now = new Date()

    await db.transaction(async (tx) => {
      await setIssueReportStatus({
        reportId: parsedInput.reportId,
        status: parsedInput.status,
        actorId: ctx.user.id,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'feedback.statusChanged',
          entityType: 'issueReport',
          entityId: parsedInput.reportId,
          metadata: { status: parsedInput.status },
        },
        tx,
      )
    })

    revalidatePath('/admin/reports')
    return { ok: true }
  })
