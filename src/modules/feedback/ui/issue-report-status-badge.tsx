import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { IssueReportStatus } from '../domain/types'

const PRESENTATION: Record<
  IssueReportStatus,
  'neutral' | 'positive' | 'candle' | 'danger' | 'warning'
> = {
  NEW: 'neutral',
  DONE: 'positive',
  PLANNED: 'candle',
  REJECTED: 'danger',
  NEEDS_MORE_INFO: 'warning',
}

export function IssueReportStatusBadge({ status }: { status: IssueReportStatus }) {
  const t = useTranslations('feedback.statuses')
  return <Badge variant={PRESENTATION[status]}>{t(status)}</Badge>
}
