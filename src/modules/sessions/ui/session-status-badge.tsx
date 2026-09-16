import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { SessionStatus } from '../domain/types'

/**
 * Session status.
 *
 * The label says what is happening rather than naming the enum: "Collecting
 * availability" tells a player what is expected of them, "COLLECTING" does not.
 */
const STATUS_PRESENTATION: Record<
  SessionStatus,
  'neutral' | 'candle' | 'positive' | 'warning' | 'muted' | 'danger'
> = {
  DRAFT: 'muted',
  COLLECTING: 'warning',
  PROPOSED: 'candle',
  SCHEDULED: 'positive',
  COMPLETED: 'muted',
  CANCELLED: 'danger',
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('sessions.statuses')
  return <Badge variant={STATUS_PRESENTATION[status]}>{t(status)}</Badge>
}
