import { MessageSquareOff } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/patterns/empty-state'
import type { IssueReportListItem } from '../domain/types'
import { IssueReportStatusBadge } from './issue-report-status-badge'
import { IssueReportStatusForm } from './issue-report-status-form'

export function IssueReportList({ reports }: { reports: readonly IssueReportListItem[] }) {
  const t = useTranslations('feedback.list')
  const format = useFormatter()

  if (reports.length === 0) {
    return (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        icon={<MessageSquareOff className="size-8" strokeWidth={1.25} />}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate">{report.reporterName}</CardTitle>
              <p className="font-ui text-xs text-text-muted">
                {report.reporterEmail ?? t('accountDeleted')} ·{' '}
                <time dateTime={report.createdAt.toISOString()}>
                  {formatDate(report.createdAt, format)}
                </time>
              </p>
            </div>
            <IssueReportStatusBadge status={report.status} />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="whitespace-pre-wrap break-words font-body text-sm leading-[--leading-body] text-text-primary">
              {report.message}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <p className="font-ui text-xs text-text-muted">
                {t('from')}{' '}
                <Link
                  href={report.sourcePath}
                  className="text-accent-text underline-offset-4 transition-interactive hover:underline"
                >
                  {report.sourcePath}
                </Link>
                {report.statusEditorName && report.statusChangedAt
                  ? t('lastChanged', {
                      name: report.statusEditorName,
                      date: formatDate(report.statusChangedAt, format),
                    })
                  : ''}
              </p>
              <IssueReportStatusForm reportId={report.id} status={report.status} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatDate(value: Date, format: ReturnType<typeof useFormatter>): string {
  return format.dateTime(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}
