import { relations } from 'drizzle-orm'
import { datetime, index, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core'
import { idColumn, timestamps } from './_shared'
import { authUser } from './auth'

export const issueReportStatuses = [
  'NEW',
  'DONE',
  'PLANNED',
  'REJECTED',
  'NEEDS_MORE_INFO',
] as const

/**
 * User-submitted product and defect reports.
 *
 * Reports survive account deletion, so both user references are nullable and
 * use SET NULL. The append-only audit log preserves every status transition.
 */
export const issueReport = mysqlTable(
  'issue_report',
  {
    id: idColumn().primaryKey(),
    reporterId: idColumn('reporter_id').references(() => authUser.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    sourcePath: varchar('source_path', { length: 500 }).notNull(),
    status: mysqlEnum('status', issueReportStatuses).notNull().default('NEW'),
    statusChangedBy: idColumn('status_changed_by').references(() => authUser.id, {
      onDelete: 'set null',
    }),
    statusChangedAt: datetime('status_changed_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    index('ix_issue_report_status').on(t.status, t.createdAt),
    index('ix_issue_report_reporter').on(t.reporterId, t.createdAt),
  ],
)

export const issueReportRelations = relations(issueReport, ({ one }) => ({
  reporter: one(authUser, {
    fields: [issueReport.reporterId],
    references: [authUser.id],
    relationName: 'issueReporter',
  }),
  statusEditor: one(authUser, {
    fields: [issueReport.statusChangedBy],
    references: [authUser.id],
    relationName: 'issueStatusEditor',
  }),
}))
