import 'server-only'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { type DbOrTx, db } from '@/db/client'
import { authUser, issueReport } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import type { IssueReportListItem, IssueReportStatus } from '../domain/types'

export async function insertIssueReport(input: {
  readonly reporterId: string
  readonly message: string
  readonly sourcePath: string
  readonly now: Date
  readonly executor: DbOrTx
}): Promise<string> {
  const id = newId()

  await input.executor.insert(issueReport).values({
    id,
    reporterId: input.reporterId,
    message: input.message,
    sourcePath: input.sourcePath,
    status: 'NEW',
    createdAt: input.now,
    updatedAt: input.now,
  })

  return id
}

/** Active administrator recipients are resolved server-side, never supplied by the reporter. */
export async function listActiveAdministratorIds(executor: DbOrTx): Promise<string[]> {
  const rows = await executor
    .select({ id: authUser.id })
    .from(authUser)
    .where(
      and(eq(authUser.role, 'admin'), eq(authUser.status, 'ACTIVE'), isNull(authUser.deletedAt)),
    )
    .orderBy(asc(authUser.id))

  return rows.map((row) => row.id)
}

export async function listIssueReports(): Promise<IssueReportListItem[]> {
  await requireAdmin()

  const reporter = alias(authUser, 'issue_reporter')
  const statusEditor = alias(authUser, 'issue_status_editor')

  const rows = await db
    .select({
      id: issueReport.id,
      message: issueReport.message,
      sourcePath: issueReport.sourcePath,
      status: issueReport.status,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      statusEditorName: statusEditor.name,
      statusChangedAt: issueReport.statusChangedAt,
      createdAt: issueReport.createdAt,
    })
    .from(issueReport)
    .leftJoin(reporter, eq(reporter.id, issueReport.reporterId))
    .leftJoin(statusEditor, eq(statusEditor.id, issueReport.statusChangedBy))
    .orderBy(
      sql`field(${issueReport.status}, 'NEW', 'NEEDS_MORE_INFO', 'PLANNED', 'DONE', 'REJECTED')`,
      desc(issueReport.createdAt),
    )

  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    sourcePath: row.sourcePath,
    status: row.status,
    reporterName: row.reporterName ?? 'Deleted user',
    reporterEmail: row.reporterEmail,
    statusEditorName: row.statusEditorName,
    statusChangedAt: row.statusChangedAt,
    createdAt: row.createdAt,
  }))
}

export async function setIssueReportStatus(input: {
  readonly reportId: string
  readonly status: IssueReportStatus
  readonly actorId: string
  readonly now: Date
  readonly executor: DbOrTx
}): Promise<void> {
  const [result] = await input.executor
    .update(issueReport)
    .set({
      status: input.status,
      statusChangedBy: input.actorId,
      statusChangedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(issueReport.id, input.reportId))

  if (result.affectedRows !== 1) throw new NotFoundError()
}
