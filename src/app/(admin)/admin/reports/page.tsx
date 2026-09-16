import { MessageSquareWarning } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { listIssueReports } from '@/modules/feedback/data/reports'
import { IssueReportList } from '@/modules/feedback/ui/issue-report-list'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.reports')
  return { title: t('title') }
}
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const t = await getTranslations('admin.reports')
  const reports = await listIssueReports()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        icon={<MessageSquareWarning className="size-6" strokeWidth={1.5} />}
        description={t('description')}
      />
      <IssueReportList reports={reports} />
    </div>
  )
}
